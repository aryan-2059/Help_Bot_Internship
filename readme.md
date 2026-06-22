# Power Intelligence

Power Intelligence is a full-stack, streaming-capable AI chat interface built during my internship. It leverages a Flask backend integrated with Ollama to serve a highly responsive local Llama 3 instance, paired with a React frontend featuring cursor-tracking visual aesthetic accents.

The assistant is engineered with a split-personality strategy: it delivers lightning-fast, concise, and satirical answers by default, while dynamically pivoting to comprehensive, deeply structured explanations when explicit triggers are detected in the user's prompt.

---

## 🏗️ Architecture & Features

### Backend (`/backend`)

* **Flask Server:** Lightweight API management handling incoming requests on port `5000`.
* **Ollama Integration:** Executes streaming inferences locally using the `llama3` model.
* **Dynamic Prompt Routing:** Evaluates incoming user text against a strict tuple of `DETAIL_KEYWORDS` to switch between a micro-response layout (`max_tokens: 80`) and an exhaustive layout (`max_tokens: 1024`).
* **Session Memory:** Retains raw local conversational context over the application runtime life-cycle using structured role objects.

### Frontend (`/frontend/LLMFrontend`)

* **Vite + React:** Modern, high-velocity frontend pipeline.
* **ReadableStream Fetching:** Decodes incoming server chunks token-by-token using `TextDecoder` and JS Streams for immediate UI updates without blocking.
* **Markdown Rendering:** Integrates `react-markdown` inside message bubbles to neatly format code blocks, bold text, and lists emitted by the backend.
* **Fluid UI & Cursor Glow:** Uses an optimized `requestAnimationFrame` loop to map absolute mouse positions directly to custom CSS variables (`--mouse-x`, `--mouse-y`) for dynamic interactive layers.

---

## 🚀 Getting Started

### Prerequisites

1. **Ollama:** Ensure Ollama is installed and running locally. Run the model ahead of time:

   ```bash
   ollama run llama3

2. **Node.js** (v18+ recommended) installed.

3. **Python** Python 3.10+ installed.

## Installation setup

1.**Backend setup:**
Navigate to the root directory and initialize your virtual environment:

``` bash
cd llm 
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install flask flask-cors ollama
```

Run the server:

```bash
cd backend
python main.py
```

The server will boot up in debug mode on ```http://localhost:5000.```
2. **Frontend Setup:**
Open a secondary terminal and navigate to your React workspace:

```bash
cd frontend/LLMFrontend

# Install node dependencies
npm install

# Start the Vite development build server
npm run dev
```

The UI can be accessed directly at ```http://localhost:5173```.
