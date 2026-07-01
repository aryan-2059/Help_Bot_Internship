import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';

const MAX_TEXTAREA_HEIGHT = 160;

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  useEffect(()=>{
    let frameId;
    const handleMouseMove = (e) => {
      frameId = requestAnimationFrame(() => {
        setCoords({ x: e.clientX, y: e.clientY });
      });
    }

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
        cancelAnimationFrame(frameId);
    };
  }, []);

  // Auto-resize text area as the user types message
  useEffect(()=>{
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
    el.style.height = `${newHeight}px`;
  },[input])
  
  const handleSendMessage = async () => {
    const userText = input.trim();
    if (!userText || isStreaming) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setInput('');
    setIsStreaming(true);
    setMessages((prev) => [...prev, { sender: 'bot', text: '' }]);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported in this browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if(value && value.length > 0) {
          const chunkValue = decoder.decode(value, { stream : !doneReading});
        
          setMessages((prev) => {
          const updated = [...prev];
          const lastMsgIndex = updated.length - 1;
          if (lastMsgIndex >= 0 && updated[lastMsgIndex].sender === 'bot') {
            updated[lastMsgIndex] = {
              ...updated[lastMsgIndex],
              text: updated[lastMsgIndex].text + chunkValue,
            };
          }
          return updated;
          });
        }
      }
    } 
    catch (error) {
      console.error('Streaming error:', error);
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsgIndex = updated.length - 1;
        if (lastMsgIndex >= 0 && updated[lastMsgIndex].sender === 'bot') {
          updated[lastMsgIndex] = {
            ...updated[lastMsgIndex],
            text: `Failed to connect to streaming backend: ${error.message}`,
          };
        }
        return updated;
        
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleReset = async () => {
    try {
      await fetch('http://localhost:5000/api/reset', {method: 'POST'});
      setMessages([]);
    }
    catch(e){
      console.error('Reset failed:', e);
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
     <div 
      className="app"
      style={{
        '--mouse-x': `${coords.x}px`,
        '--mouse-y': `${coords.y}px`
      }}
    >
      <div className="cursor-glow-layer"/>
      <header className="app-header">
        <div className="app-header__brand">
          <div className="app-header__badge" aria-hidden="true">
            AI
          </div>
          <div>
            <h1 className="app-header__title">Power Intelligence</h1>
            <p className="app-header__subtitle">Powered by Llama 3</p>
          </div>
        </div>
        <a
          href="https://www.pfcindia.co.in"
          target="_blank"
          rel="noopener noreferrer"
          className="app-header__logo-link"
        >
        
        <img src="../logo/pfc_english_logo.png" 
        alt="Logo" 
        className="app-header__logo"
        />
        </a>
       
        <button
          className='reset-btn'
          onClick={handleReset}
          disabled={isStreaming || messages.length === 0}
          title='Clear Conversation'
        >
          Reset Chat
        </button>
      </header>

      <main className="chat-shell">
        <div className="messages" role="log" aria-live="polite" aria-relevant="additions">
          {messages.length === 0 && (
            <div className="empty-state">
              <h2 className="empty-state__title">Ask anything.</h2>
              <p className="empty-state__subtitle">
                Smart to the core. Direct answers — detail only when you ask for it.
              </p>
            </div>
          )}

          {messages.map((msg, index) => {
            const isLastBotStreaming =
              isStreaming &&
              index === messages.length - 1 &&
              msg.sender === 'bot';

            return (
              <div
                className={`message-row message-row--${msg.sender === 'user' ? 'user' : 'bot'}`}
                key={index}
              >
                <div
                  className={`message-bubble message-bubble--${msg.sender === 'user' ? 'user' : 'bot'}`}
                >
                  <div className="message-label">
                    {msg.sender === 'user' ? 'You' : 'Llama 3'}
                  </div>
                  {msg.sender === 'bot' ? (
                    <div className="message-content">
                      {msg.text ? (
                        <ReactMarkdown>{String(msg.text)}</ReactMarkdown>
                      ) : isLastBotStreaming ? null : (
                        <span className="thinking"> Thinking...</span>
                      )}
                      {isLastBotStreaming && <span className="streaming-cursor" aria-hidden="true" />}
                    </div>
                  ) : (
                    <p className="message-content">{msg.text}</p>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="composer">
          <div className="composer__inner">
            <textarea
              ref={textareaRef}
              className="composer__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Intelligence…"
              aria-label="Message"
              disabled={isStreaming}
              rows={1}
            />
            <button
              className="composer__send"
              type="button"
              onClick={handleSendMessage}
              disabled={isStreaming || !input.trim()}
            >
              {isStreaming ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
