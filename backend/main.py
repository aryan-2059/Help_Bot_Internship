import os
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
import ollama

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
)

CONCISE_MAX_TOKENS = 200
DETAILED_MAX_TOKENS = 1024

chat_history = [
    {
        'role': 'system',
        'content': SYSTEM_PROMPT,
    }
]

def wants_detailed_explanation(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in DETAIL_KEYWORDS)


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    
    detailed = wants_detailed_explanation(user_message)
    
    if not user_message.strip():
        return Response('', mimetype='text/plain')
    
    detailed = wants_detailed_explanation(user_message)

    chat_history.append({
        'role': 'user',
        'content': user_message,
    })
    
    options = {
        'num_predict': DETAILED_MAX_TOKENS if detailed else CONCISE_MAX_TOKENS,
        'temperature': 0.7,
    }
    
    print(f"\n--- {'DETAILED' if detailed else 'CONCISE'} | History depth: {len(chat_history)} | Q: {user_message} ---")

    def generate():
        full_response = ''
        try:
            response_stream = ollama.chat(
                model='llama3:latest',
                messages=chat_history,
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
                chat_history.append({
                    'role': 'assistant',
                    'content': full_response,
                })
                print(f"[Assistant response stored, history now {len(chat_history)} messages]")

    # Use text/event-stream or plain text with stream_with_context
    return Response(stream_with_context(generate()), mimetype='text/plain')

@app.route('/api/reset', methods=['POST'])
def reset():
    '''Utility endpoint to reset the chat history.'''
    global chat_history
    chat_history = [
        {
            'role': 'system',
            'content': SYSTEM_PROMPT
        }
    ]
    print("[Chat history reset]")
    return {'status': 'success', 'message': 'Chat history reset.'}
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)