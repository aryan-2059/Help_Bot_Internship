import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';

export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

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

      if (!response.body) {
        throw new Error('ReadableStream not supported by backend response.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value, { stream: !doneReading });

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
    } catch (error) {
      setMessages((prev) => {
        const updated = [...prev];
        const lastMsgIndex = updated.length - 1;
        if (lastMsgIndex >= 0 && updated[lastMsgIndex].sender === 'bot') {
          updated[lastMsgIndex].text = 'Failed to connect to streaming backend.';
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

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
        <div className="app-header__badge" aria-hidden="true">
          AI
        </div>
        <div>
          <h1 className="app-header__title">Power Intelligence</h1>
          <p className="app-header__subtitle">Powered by Llama 3</p>
        </div>
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
              msg.sender === 'bot' &&
              !msg.text;

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
                      ) : null}
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
            <input
              className="composer__input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Intelligence…"
              aria-label="Message"
            />
            <button
              className="composer__send"
              type="button"
              onClick={handleSendMessage}
              disabled={isStreaming || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
