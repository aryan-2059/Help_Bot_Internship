import os
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
import ollama
from db import (save_message, get_connection, create_conversation, get_conversations, get_messages_by_conversations)
from scope_guard import is_in_scope
from retrieve import retrieve, format_context
from web_search import web_search

app = Flask(__name__)
CORS(app)

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


# FIX: each conversatino gets its oown isolated chat history.
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

@app.route('/api/conversations', methods=['POST'])
def new_conversation():
    '''Create a new conversation and return its ID.'''
    conv_id = create_conversation()
    return {'id': conv_id}

@app.route('/api/conversations', methods=['GET'])
def list_conversations():
    '''Return a list of all conversations.'''
    conversations = get_conversations()
    return {'conversations': conversations}

@app.route('/api/conversations/<int:conv_id>/messages', methods=['GET'])
def conversation_messages(conv_id):
    '''Return all messages for a specific conversation.'''
    messages = get_messages_by_conversations(conv_id)
    return {'messages': messages}

@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    conversation_id = data.get('conversation_id')
    
    if not user_message.strip() or not conversation_id:
        return Response('', mimetype='text/plain')
    
    if not is_in_scope(user_message):
        def refuse():
            yield OUT_OF_SCOPE_MSG
        save_message('user', user_message, conversation_id)
        save_message('bot', OUT_OF_SCOPE_MSG, conversation_id)
        return Response(stream_with_context(refuse()), mimetype='text/plain')
    
    detailed = wants_detailed_explanation(user_message)
    history = get_history(conversation_id)

    existing = get_messages_by_conversations(conversation_id)
    if len(existing) == 0:
        # First message in this conversation, create a new conversation in the DB
        conn = get_connection()
        cursor = conn.cursor()
        title = user_message[:50]  # Use the first 50 characters as the title
        cursor.execute('UPDATE conversations SET title = %s WHERE id = %s', (title, conversation_id))
        conn.commit()
        cursor.close()
        conn.close()
        
    augmented_message, context_source = build_augmented_message(user_message)
    history.append({
        'role': 'user',
        'content': augmented_message,
    })
    save_message('user', user_message, conversation_id)
    
    options = {
        'num_predict': DETAILED_MAX_TOKENS if detailed else CONCISE_MAX_TOKENS,
        'temperature': 0.7,
    }
    
    print(f"\n--- {'DETAILED' if detailed else 'CONCISE'} | Conv {conversation_id} | History depth: {len(history)} | Q: {user_message} ---")

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
                token = chunk.get('message',{}).get('content', '')
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

    # Use text/event-stream or plain text with stream_with_context
    return Response(stream_with_context(generate()), mimetype='text/plain')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)