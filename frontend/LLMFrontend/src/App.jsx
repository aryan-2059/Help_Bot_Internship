import React, { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';
import Auth from './Auth.jsx';
import Toast from './Toast.jsx';
import AdminLogin from './Adminlogin.jsx'
import AdminDashboard from './AdminDashboard.jsx';

const MAX_TEXTAREA_HEIGHT = 160;

function SplashScreen(){
  return (
    <div className='splash-screen'>
      <img src=".\logo\Power_Finance_Corporation_Logo.png" alt="Logo" className='splash-screen__badge' />
      <h1 className='splash-screen__title'>Power Finance Intelligence</h1>
      <div className='splash-screen__loader'>
        <span></span><span></span><span></span>
      </div>
    </div>
  )
}

export default function App() {
  const[isAppReady, setIsAppReady] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const textareaRef = useRef(null);
  const [isDark, setIsDark] = useState(()=>{
    const stored = localStorage.getItem('pfc_theme');
    return stored ? stored === 'dark' : true;}) ; //default dark mode
  
  // conversation management
  const[conversations, setConversations] = useState([]);
  const[currentConvId, setCurrentConvId] = useState(null);
  const[sideBarOpen, setSidebarOpen] = useState(false);

  // auth
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [toast, setToast] = useState({msg: '', type: 'success'});

  // CHANGE: routing btw 3 pre-chat screens | auth -> default, dashboard -> admin db
  const[authView, setAuthView] = useState('auth');
  const[dashboardOpen, setDashboardOpen] = useState(false);

  const showToast = (msg, type = 'success') =>{
    setToast({msg, type});
  }
  const dismissToast = useCallback(()=>{
    setToast({msg: '', type:'success'});
  },[]);

  // restore session on reload
  useEffect(()=>{
    const stored = localStorage.getItem('pfc_user');
    if(stored){
      try{ setUser(JSON.parse(stored)); }catch{}
    }
  },[]);

  const handleAuthSuccess = (userData)=>{
    setUser(userData);
    localStorage.setItem('pfc_user', JSON.stringify(userData));
  };

  // CHANGE: separate success handlers for admin login
 const handleAdminAuthSuccess = (adminData) => {
    setUser(adminData);
    localStorage.setItem('pfc_user', JSON.stringify(adminData));
    setAuthView('auth'); // reset so a future logout doesn't land back on admin login
  };
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('pfc_user');
    setProfileOpen(false);
    setConversations([]);
    setCurrentConvId(null);
    setMessages([]);
    setDashboardOpen(false); // also close dash view on logout
  };

  // fetch conversations from backend on component mount
  useEffect(()=>{
    if (!user) return;
    fetch(`http://localhost:5000/api/conversations?user_id=${user.id}`)
      .then((res)=>res.json())
      .then((data)=>setConversations(data.conversations || []))
      .catch((err)=>console.error('Failed to fetch conversations:', err));
  }, [user]);

  // toggle dark mode
  useEffect(()=>{
    if(isDark){
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.add('light-mode');
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('pfc_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // scroll to bottom when new messages arrive or streaming state changes
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

  useEffect(()=>{
    const timer = setTimeout(()=>setIsAppReady(true), 2500);
    return ()=> clearTimeout(timer);
  },[]);

  // Handle new chat creation
  const handleNewChat = async () => {
    if (currentConvId && messages.length === 0) {
        return; // If there's an existing conversation with no messages, don't create a new one
      }

      // Reuse an existing empty chat
      const existingEmpty = conversations.find((c)=>c.title === 'New Chat');
      if(existingEmpty) {
        setCurrentConvId(existingEmpty.id);
        setMessages([]);
        return;
      }
    try {
      const res = await fetch('http://localhost:5000/api/conversations', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({user_id: user.id}), });
      const data = await res.json();
      if (!res.ok || !data.id) {
        showToast(data.error || 'Failed to create new chat.', 'error');
        return;
      }
      const newConv = { id: data.id, title: 'New Chat', created_at: new Date().toISOString() };
      setConversations((prev) => [newConv, ...prev]);
      setCurrentConvId(data.id);
      setMessages([]);
    } catch (error) {
      console.error('Failed to create new chat:', error);
      showToast('Could not reach server. Please try again.', 'error');
    }
  }

  // Handle conversation deletion
  const handleDeleteConversation = async (id, e) => {
    e.stopPropagation();
    if(!window.confirm('Delete this chat? Cannot be undone')) return;
    try {
      await fetch(`http://localhost:5000/api/conversations/${id}`, {method: 'DELETE'});
      setConversations((prev)=>prev.filter((c)=>c.id !== id));
      if(id===currentConvId) {
        setCurrentConvId(null);
        setMessages([]);
      }
    } catch (e){
      console.error('Failed to delete conversation: ', e);
    }
  }

  // Handle conversation selection
  const handleSelectConversation = async (id) => {
    if (id === currentConvId) return; // already selected
    try {
      setCurrentConvId(id);
      const res = await fetch(`http://localhost:5000/api/conversations/${id}/messages?user_id=${user.id}`);
      const data = await res.json();
      setMessages(data.messages.map((m)=>({ ...m, time: new Date(m.created_at)})));
    } catch (error) {
      console.error('Failed to fetch conversation:', error);
    }
  }
  
  const handleSendMessage = async () => {
    const userText = input.trim();
    if (!userText || isStreaming) return;

    let convId = currentConvId;
    // If there's no current conversation, create a new one
    if (!convId) {
          const res = await fetch('http://localhost:5000/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: user.id }),
          });
          const data = await res.json();
          convId = data.id;
          setConversations((prev) =>[{ id: convId, title: 'New Chat', created_at: new Date().toISOString() }, ...prev]);
          setCurrentConvId(convId);
    }
    setMessages((prev) => [...prev, { sender: 'user', text: userText, time: new Date() }]);
    setInput('');
    setIsStreaming(true);
    setMessages((prev) => [...prev, { sender: 'bot', text: '', time: new Date() }]);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, conversation_id: convId, user_id: user.id }),
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
      // After streaming is done, fetch the updated list of conversations to reflect any changes
      fetch(`http://localhost:5000/api/conversations?user_id=${user.id}`)
      .then((res)=>res.json())
      .then((data)=>setConversations(data.conversations))
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


  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if(!isAppReady) return <SplashScreen/>;

   const header = (
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
        <img src="../logo/pfc_english_logo.png" alt="Logo" className="app-header__logo" />
      </a>
 
      <button
        className='theme-toggle-btn'
        onClick={() => setIsDark(prev=> !prev)}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle Theme"
      >
        {isDark ? '☀️' : '🌙'}
      </button>
 
      {user && (
        <div className="profile-menu-wrapper">
          <button
            className="profile-icon-btn"
            onClick={() => setProfileOpen((p) => !p)}
            aria-label="Profile"
            title={user.first_name}
          >
            {user.first_name?.[0]?.toUpperCase() || '?'}
          </button>
          {profileOpen && (
            <>
              <div className="profile-backdrop" onClick={() => setProfileOpen(false)} />
              <div className="profile-dropdown">
                <p className="profile-dropdown__name">{user.first_name} {user.last_name}</p>
                <p className="profile-dropdown__email">{user.email}</p>
                <p className="profile-dropdown__meta">
                  Member since {user.created_at ? new Date(user.created_at).toLocaleDateString([], {month:'short', year:'numeric'}) : '—'}
                </p>
                {user.user_type === 'admin' && (
                  <button
                    className="profile-dropdown__dashboard"
                    onClick={() => { setDashboardOpen(true); setProfileOpen(false); }}
                  >
                    View Admin Dashboard
                  </button>
                )}
                <button className="profile-dropdown__logout" onClick={handleLogout}>
                  Log Out
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </header>
  );

  // change: routing block - shows auth or adminlogin depending on authview
  if(!user){
    if (authView === 'adminLogin') {
      return (
        <div className="app app--auth" style={{ '--mouse-x': `${coords.x}px`, '--mouse-y': `${coords.y}px` }}>
          <div className="cursor-glow-layer"/>
          {header}
          <AdminLogin
            onAdminAuthSuccess={handleAdminAuthSuccess}
            onGoBack={() => setAuthView('auth')}
            showToast={showToast}
          />
          <Toast msg={toast.msg} type={toast.type} onDone={dismissToast} />
        </div>
      );
    }
     return (
      <div className="app app--auth" style={{ '--mouse-x': `${coords.x}px`, '--mouse-y': `${coords.y}px` }}>
        <div className="cursor-glow-layer"/>
        {header}
        <Auth
          onAuthSuccess={handleAuthSuccess}
          showToast={showToast}
          onGoToAdminLogin={() => setAuthView('adminLogin')}
        />
        <Toast msg={toast.msg} type={toast.type} onDone={dismissToast} />
      </div>
    );
  }

    // admin dashboard
    if (dashboardOpen && user.user_type === 'admin') {
    return (
      <div className="app" style={{ '--mouse-x': `${coords.x}px`, '--mouse-y': `${coords.y}px` }}>
        <div className="cursor-glow-layer"/>
        <Toast msg={toast.msg} type={toast.type} onDone={dismissToast} />
        {header}
        <main className="chat-shell" style={{ marginTop: 'calc(var(--header-height) + 24px)' }}>
          <AdminDashboard
            admin={user}
            onBack={() => setDashboardOpen(false)}
            showToast={showToast}
          />
        </main>
      </div>
    );
  }
  return (
     <div 
      className="app"
      style={{
        '--mouse-x': `${coords.x}px`,
        '--mouse-y': `${coords.y}px`
      }}
    >
      <div className="cursor-glow-layer"/>
      <Toast msg={toast.msg} type={toast.type} onDone={dismissToast} />
      {/* Sidebar */}
      {sideBarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)}></div>
      )}
      <aside className={`sidebar ${sideBarOpen ? 'sidebar--open' : 'sidebar--closed'}`}>
        <div className="sidebar__header">
          <button className="sidebar__collapse-btn" onClick={() => setSidebarOpen(false)} title='Collapse Sidebar'>
            ☰
          </button>
          <button
            className={`sidebar__new-chat ${!currentConvId ? 'sidebar__new-chat--active' : ''}`}
            onClick={handleNewChat}
          >
            + New Chat
          </button>
        </div>
        <div className = 'sidebar__list'>
          {conversations.map((conv)=>(
            <div
              key={conv.id}
              className={`sidebar__item-row ${conv.id === currentConvId ? 'sidebar__item-row--active' : ''}`}
            >
              <button
                className={`sidebar__item ${conv.id === currentConvId ? 'sidebar__item--active' : ''}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                {conv.title}
              </button>
              <button
                className="sidebar__item-delete"
                onClick={(e) => handleDeleteConversation(conv.id, e)}
                title="Delete chat"
                aria-label="Delete chat"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      </aside>
      {!sideBarOpen && (
        <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)} title="Expand sidebar">
          ☰
        </button> 
      )}

      {header}
      
      <main className={`chat-shell ${sideBarOpen ? 'chat-shell--sidebar-open':''}`}>
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
              <div className={`message-row message-row--${msg.sender === 'user' ? 'user' : 'bot'}`} key={index} >
                <div className={`message-bubble message-bubble--${msg.sender === 'user' ? 'user' : 'bot'}`}>
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
                <span className="message-timestamp-tooltip">
                      {msg.time?.toLocaleDateString([], {month: 'short', day: 'numeric'})}
                      {' · '}
                      {msg.time?.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                    </span>
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

