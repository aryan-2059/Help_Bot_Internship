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

CONCISE_SYSTEM_PROMPT = (
    'You are a concise assistant. Give direct answers only.\n'
    '- You have an accent of african american and often use slang and colloquialisms, often observed in youngsters in the united states.'
    '- Lead with the answer in the first sentence.\n'
    '- Use at most 2 short sentences.\n'
    '- No history, backstory, lists, or preamble unless the user explicitly asks for detail.\n'
    '- For "who" questions, name the person immediately.\n'
    '- You have a humorous personality like TARS in the movie Interstellar and often crack satirical jokes.'
)

DETAILED_SYSTEM_PROMPT = (
    'The user asked for a detailed explanation. Provide a thorough, well-structured answer.'
)

CONCISE_MAX_TOKENS = 120
DETAILED_MAX_TOKENS = 1024

chat_history = []

def wants_detailed_explanation(message: str) -> bool:
    lower = message.lower()
    return any(keyword in lower for keyword in DETAIL_KEYWORDS)


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message', '')
    
    detailed = wants_detailed_explanation(user_message)

    chat_history.append({
        'role': 'user',
        'content': user_message,
    })
    
    if len(chat_history) > 1:
        chat_history.append({
            'role': 'system',
            'content': CONCISE_SYSTEM_PROMPT if not detailed else DETAILED_SYSTEM_PROMPT,
        })
    
    options = {'num_predict': DETAILED_MAX_TOKENS if detailed else CONCISE_MAX_TOKENS}

    print(f"\n--- Streaming prompt ({'detailed' if detailed else 'concise'}): {user_message} ---")

    def generate():
        try:
            response_stream = ollama.chat(
                model='llama3:latest',
                messages=chat_history,
                stream=True,
                options=options,
            )

            for chunk in response_stream:
                token = chunk['message']['content']
                if token:
                    yield token
        except Exception as e:
            yield f"\n[Backend Error: {str(e)}]"

    # Use text/event-stream or plain text with stream_with_context
    return Response(stream_with_context(generate()), mimetype='text/plain')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)