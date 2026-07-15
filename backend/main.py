import os
import re
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import ollama
from db import (save_message, get_connection, create_conversation, get_conversations,
                 get_messages_by_conversations, delete_conversation, conversation_belongs_to_user,
                 create_user, get_user_by_email, log_login_event, is_user_suspended, suspend_user, unsuspend_user, 
                 get_employees_by_department, get_employee_detail, get_login_history)
from scope_guard import is_in_scope
from retrieve import retrieve, format_context
from web_search import web_search
import json # NEW: Need json for chat export from admin dashboard

app = Flask(__name__)
CORS(app)
# single source of truth used in both employee and admin login/signup
DEPARTMENTS = ["HR", "IT", "Legal", "Finance & Accounting", "Marketing", "Customer Service", "Sales", "Administration",]

DETAIL_KEYWORDS = (
    'detailed', 'in detail', 'explain in detail', 'detailed explanation',
    'tell me more', 'elaborate', 'comprehensive', 'full explanation',
    'describe in depth', 'go deeper', 'expand on', 'long answer',
    'step by step', 'walk me through', 'break it down',
)

SYSTEM_PROMPT = (
    'You are a sharp, witty AI assistant with a humorous personality — '
    'dry, satirical, and self-aware. '
    'By default, give CONCISE answers: lead with the answer immediately in the first sentence, '
    'use at most 2-3 short sentences, no preamble, no backstory, no filler. '
    'If the user explicitly asks for detail (e.g. "explain in detail", "elaborate", "step by step"), '
    'switch to a thorough, well-structured explanation. '
    'Always maintain full context of the conversation — remember what was discussed earlier.'
    'When context is provided below under "Reference material", base your answer on it '
    'and do not contradict it. If the reference material does not fully answer the question, '
    'say so briefly rather than inventing details.'
)

CONCISE_MAX_TOKENS = 250
DETAILED_MAX_TOKENS = 1024

OUT_OF_SCOPE_MSG = ( "That's outside what I can help with here — I'm scoped to IT support and "
    "company help questions only. Try me with something like a VPN, printer, "
    "or account issue.")

def suspension_message(admin_name):
    return f"Chatting services suspended. Contact your admin {admin_name}."


# FIX: each conversation gets its own isolated chat history.
chat_history ={}

def get_history(conversation_id):
    '''Return this conversation's history, creating a new one if it doesn't exist.'''
    if conversation_id not in chat_history:
        chat_history[conversation_id] = [
            {
                'role': 'system',
                'content': SYSTEM_PROMPT
            }
        ]
    return chat_history[conversation_id]

def wants_detailed_explanation(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in DETAIL_KEYWORDS)

def build_augmented_message(user_message: str) -> tuple[str, str]:
    rag_chunks = retrieve(user_message)
    
    if rag_chunks:
        context_text = format_context(rag_chunks)
        source = "rag"
    else:
        context_text = web_search(user_message)
        source = "web" if context_text else "none"
        
    if not context_text:
        return user_message, source
    
    augmented = (
        f"Reference material: \n{context_text}\n\n"
        f"User question: {user_message}"
    )
    return augmented, source

EMAIL_DOMAIN = "pfcindia.com"
SIGNUP_EMAIL_PATTERN = re.compile(r"^[a-z]+_[a-z]+@pfcindia\.com$")
LOGIN_EMAIL_PATTERN = re.compile(r"^[a-z0-9._%+-]+@pfcindia\.com$")


def expected_email(first_name: str, last_name: str) -> str:
    first = re.sub(r"\s+", "", first_name.strip().lower())
    last = re.sub(r"\s+", "", last_name.strip().lower())
    return f"{first}_{last}@{EMAIL_DOMAIN}"


@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    department = (data.get('department') or '').strip() #new field req

    if not first_name or not last_name or not email or not password:
        return {'error': 'All fields are required.'}, 400
    
    if department not in DEPARTMENTS:
        return {'error': f'Department must be one of: {", ".join(DEPARTMENTS)}'}, 400

    if email != expected_email(first_name, last_name):
        return {'error': f'Email must be {expected_email(first_name, last_name)}'}, 400

    if get_user_by_email(email):
        return {'error': 'An account with this email already exists.'}, 409

    password_hash = generate_password_hash(password)
    user_id = create_user(first_name, last_name, email, password_hash, department)
    log_login_event(user_id, 'signup')

    return {
        'id': user_id,
        'first_name': first_name,
        'last_name': last_name,
        'email': email,
        'department' :department,
        'user_type': 'employee',
    }


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not LOGIN_EMAIL_PATTERN.match(email):
        return {'error': 'Please use your company email (@pfcindia.com).'}, 400

    user = get_user_by_email(email)
    if not user or not check_password_hash(user['password_hash'], password):
        return {'error': 'Invalid email or password.'}, 401

    # change: this route is now only for employees
    if user['user_type'] != 'employee':
        return {'error': 'Please use the Admin Login option.'}, 403
    
    log_login_event(user['id'], 'login')
    return {
        'id': user['id'],
        'first_name': user['first_name'],
        'last_name': user['last_name'],
        'email': user['email'],
        'department': user['department'],
        'user_type': user['user_type'],
        'created_at': user['created_at'],
    }

# ADD a new route for admin access; separated from employees
@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.json
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    department = (data.get('department') or '').strip()
    
    if not first_name or not last_name or not email or not password or not department:
        return {'error': 'All fields are necesaary!'}, 400
    if department not in DEPARTMENTS:
        return {'error': f'Department must be one of: {", ".join(DEPARTMENTS)}'}, 400
    
    user = get_user_by_email(email)
    if not user or not check_password_hash(user['password_hash'], password):
        return {'error': 'Invalid email or password'}, 401
    
    if user['user_type'] != 'admin':
        return {'error': 'This account is not registered as an admin.'}, 403
 
    if user['department'] != department:
        return {'error': 'Department does not match this admin account.'}, 403
 
    log_login_event(user['id'], 'login')
    
    return {
        'id': user['id'],
        'first_name': user['first_name'],
        'last_name': user['last_name'],
        'email': user['email'],
        'department': user['department'],
        'user_type': user['user_type'],
        'created_at': user['created_at'],
    }

@app.route('/api/conversations', methods=['POST'])
def new_conversation():
    '''Create a new conversation and return its ID.'''
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return {'error': 'user_id is required'}, 400
    conv_id = create_conversation(user_id)
    return {'id': conv_id}

@app.route('/api/conversations', methods=['GET'])
def list_conversations():
    '''Return a list of all conversations.'''
    user_id = request.args.get('user_id')
    if not user_id:
        return {'error': 'user_id is required'}, 400
    conversations = get_conversations(user_id)
    return {'conversations': conversations}


@app.route('/api/conversations/<int:conv_id>/messages', methods=['GET'])
def conversation_messages(conv_id):
    '''Return all messages for a specific conversation.'''
    messages = get_messages_by_conversations(conv_id)
    return {'messages': messages}

@app.route('/api/conversations/<int:conv_id>', methods=['DELETE'])
def delete_conversation_route(conv_id):
    '''Soft delete a conversation and its messages (cascade), scoped to the owning user.'''
    user_id = request.args.get('user_id')
    if not user_id:
        return {'error': 'user_id is required'}, 400
    delete_conversation(conv_id, user_id)
    chat_history.pop(conv_id, None)  # also drop it from in-memory history
    return {'deleted': conv_id}

# NEW route to check if account suspended or not
@app.root_path('/api/user/status', methods=['GET'])
def user_status():
    user_id = request.args.get('user_id')
    if not user_id:
        return {'error':'user_id is required,'}, 400
    status = is_user_suspended(user_id)
    return status


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    conversation_id = data.get('conversation_id')
    user_id = data.get('user_id') # req for suspension check
    
    # CHANGE: an employee cannot access chat if suspended
    if user_id:
        status = is_user_suspended(user_id)
        if status['suspended']:
            def refuse_suspended():
                yield suspension_message(status['admin_name'])
            return Response(stream_with_context(refuse_suspended()), mimetype='text/plain')
    
    history_so_far = get_history(conversation_id)
    last_bot_message = next(
        (m['content'] for m in reversed(history_so_far) if m['role'] == 'assistant'),
        ""
    )
    if not is_in_scope(user_message, last_bot_message):
        def refuse():
            yield OUT_OF_SCOPE_MSG
        save_message('user', user_message, conversation_id)
        save_message('bot', OUT_OF_SCOPE_MSG, conversation_id)
        return Response(stream_with_context(refuse()), mimetype='text/plain')

    detailed = wants_detailed_explanation(user_message)
    history = history_so_far

    existing = get_messages_by_conversations(conversation_id)
    if len(existing) == 0:
        conn = get_connection()
        cursor = conn.cursor()
        title = user_message[:50]
        cursor.execute('UPDATE conversations SET title = %s WHERE id = %s', (title, conversation_id))
        conn.commit()
        cursor.close()
        conn.close()

    augmented_message, context_source = build_augmented_message(user_message)

    history.append({
        'role': 'user',
        'content': augmented_message,
    })
    save_message('user', user_message, conversation_id)  # store the ORIGINAL, not augmented

    options = {
        'num_predict': DETAILED_MAX_TOKENS if detailed else CONCISE_MAX_TOKENS,
        'temperature': 0.7,
    }

    print(f"\n--- {'DETAILED' if detailed else 'CONCISE'} | Conv {conversation_id} | Context: {context_source} | History depth: {len(history)} | Q: {user_message} ---")

    def generate():
        full_response = ''
        try:
            response_stream = ollama.chat(
                model='llama3:latest',
                messages=history,
                stream=True,
                options=options,
            )

            for chunk in response_stream:
                token = chunk.get('message', {}).get('content', '')
                if token:
                    full_response += token
                    yield token

        except Exception as e:
            err = f"\n[Backend Error: {str(e)}]"
            full_response += err
            yield err

        finally:
            if full_response.strip():
                history.append({
                    'role': 'assistant',
                    'content': full_response,
                })
                save_message('bot', full_response, conversation_id)
                print(f"[Assistant response stored, history now {len(history)} messages]")

    return Response(stream_with_context(generate()), mimetype='text/plain')

# CHANGE: Admin ports - take id and deptt as parameters | scoped to deptt only
def _verify_admin(admin_id, department):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("select id from users where id = %s and user_type = 'admin' and department = %s",
                   (admin_id, department))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    return row is not None

@app.route('/api/admin/employees', methods=['GET'])
def  admin_list_employees9():
    admin_id = request.args.get('admin_id')
    department = request.args.get('department')
    if not admin_id or not department:
        return{'error':'admin_id or and department are required.'}, 400
    if not _verify_admin(admin_id, department):
        return{'error': 'Not authorized'}, 403
    return {'employees': get_employees_by_department(department)}

@app.route('/api/admin/employees/<int:employee_id>', methods=['GET'])
def admin_employee_detail(employee_id):
    admin_id = request.args.get('admin_id')
    department = request.args.get('department')
    if not admin_id or not department:
        return {'error': 'admin_id and department are required'}, 400
    if not _verify_admin(admin_id, department):
        return{'error': 'Not authorized'}, 403
    detail = get_employee_detail(employee_id, department)
    if not detail:
        return {'error': 'Employee not found in this department'}, 404
    detail['suspension'] = is_user_suspended(employee_id)
    return detail

@app.route('/api/admin/employees/<int:employee_id>/conversations/<int:conv_id>/download', methods=['GET'])
def admin_download_chat(employee_id, conv_id):
    admin_id = request.args.get('admin_id')
    department = request.args.get('department')
    if not admin_id or not department:
        return {'error': 'admin_id and department are required'}, 400
    if not _verify_admin(admin_id, department):
        return {'error': 'Not authorized'}, 403
 
    messages = get_messages_by_conversations(conv_id)
    payload = json.dumps({'conversation_id': conv_id, 'messages': messages}, indent=2)
    return Response(
        payload,
        mimetype='application/json',
        headers={'Content-Disposition': f'attachment; filename=chat_{conv_id}.json'}
    )
 
 
@app.route('/api/admin/employees/<int:employee_id>/suspend', methods=['POST'])
def admin_suspend_employee(employee_id):
    data = request.json or {}
    admin_id = data.get('admin_id')
    department = data.get('department')
    duration = data.get('duration')  # '1h' | '4h' | '12h' | '1d' | '1w' | 'indefinite'
    if not admin_id or not department or not duration:
        return {'error': 'admin_id, department, and duration are required'}, 400
    if not _verify_admin(admin_id, department):
        return {'error': 'Not authorized'}, 403
 
    suspend_user(employee_id, admin_id, duration)
    return {'suspended': True, 'employee_id': employee_id, 'duration': duration}
 
 
@app.route('/api/admin/employees/<int:employee_id>/unsuspend', methods=['POST'])
def admin_unsuspend_employee(employee_id):
    data = request.json or {}
    admin_id = data.get('admin_id')
    department = data.get('department')
    if not admin_id or not department:
        return {'error': 'admin_id and department are required'}, 400
    if not _verify_admin(admin_id, department):
        return {'error': 'Not authorized'}, 403
 
    unsuspend_user(employee_id)
    return {'suspended': False, 'employee_id': employee_id}
 
 
@app.route('/api/admin/login-history', methods=['GET'])
def admin_login_history():
    admin_id = request.args.get('admin_id')
    department = request.args.get('department')
    if not admin_id or not department:
        return {'error': 'admin_id and department are required'}, 400
    if not _verify_admin(admin_id, department):
        return {'error': 'Not authorized'}, 403
    return {'history': get_login_history(department)}

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)