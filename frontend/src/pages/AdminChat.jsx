import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TypingMessage } from './Chat';

const API_URL = 'https://camilo152893-techstore-api.hf.space';


const getAdminSessionId = () => {
  let sid = localStorage.getItem('admin_chat_session_id');
  if (!sid) {
    sid = 'admin_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    localStorage.setItem('admin_chat_session_id', sid);
  }
  return sid;
};

function AdminChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('Todos');
  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState(getAdminSessionId());

  const startNewConversation = async () => {
    try {
      await fetch(`${API_URL}/history/${sessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error limpiando historial:', e);
    }
    localStorage.removeItem('admin_chat_session_id');
    const newSid = getAdminSessionId();
    setSessionId(newSid);
    setMessages([]);
  };

  // Protect route
  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_URL}/history/${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          const loadedMsgs = data.history.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
            isHistory: true
          }));
          setMessages(loadedMsgs);
        }
      } catch (error) {
        console.error("No se pudo cargar el historial", error);
      }
    };
    fetchHistory();
  }, [sessionId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (text, overrideCategory = null) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text, isHistory: false };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: sessionId,
          message: text,
          category: overrideCategory || category
        }),
      });

      if (!response.ok) {
        throw new Error('Error de red');
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, isHistory: false }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Lo siento, ha ocurrido un error de conexión.', isHistory: false },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const renderMessageContent = (msg) => {
    const content = msg.content;
    const productRegex = /\[PRODUCT_CARD:\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\]/g;
    
    if (!productRegex.test(content)) {
      if (msg.role === 'assistant' && !msg.isHistory) {
        return <TypingMessage content={content} />;
      }
      return <span>{content}</span>;
    }

    const parts = [];
    let lastIndex = 0;
    productRegex.lastIndex = 0;
    let match;
    while ((match = productRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex, match.index)}</span>);
      }
      const [_, name, price, cat] = match;
      parts.push(
        <div key={`card-${match.index}`} className="product-card">
          <div className="product-image">📦</div>
          <div className="product-info">
            <span className="product-category">{cat}</span>
            <h4>{name}</h4>
            <p className="product-price">${price}</p>
          </div>
        </div>
      );
      lastIndex = productRegex.lastIndex;
    }
    
    if (lastIndex < content.length) {
      parts.push(<span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>);
    }
    return <>{parts}</>;
  };

  return (
    <div className="app-background">
      <div className="chat-container">
        <header className="chat-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="header-avatar">👔</div>
            <div className="header-info">
              <h1>TechStore Manager AI</h1>
              <p>Acceso Total Empresarial (Privado)</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option style={{color: 'black'}} value="Todos">Todos los Docs</option>
              <option style={{color: 'black'}} value="RRHH">RRHH</option>
              <option style={{color: 'black'}} value="Finanzas">Finanzas</option>
              <option style={{color: 'black'}} value="Inventario">Inventario</option>
            </select>
            <button onClick={startNewConversation} style={{ padding: '8px 15px', background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>
              🆕 Nueva
            </button>
            <Link to="/admin" style={{ padding: '8px 15px', background: 'rgba(255,255,255,0.2)', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
              ⬅ Volver a Admin
            </Link>
          </div>
        </header>

        <div className="chat-box">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="welcome-card">
                <h2>¡Hola Administrador! 👋</h2>
                <p>Soy tu asistente inteligente empresarial. Tengo acceso total a documentos de RRHH, Finanzas e Inventario.</p>
                <div className="quick-actions">
                  <button className="chip" onClick={() => { setCategory('RRHH'); handleSend("¿Cuáles son las políticas de vacaciones?", 'RRHH'); }}>
                    💼 Políticas de RRHH
                  </button>
                  <button className="chip" onClick={() => { setCategory('Finanzas'); handleSend("Resumen financiero trimestral", 'Finanzas'); }}>
                    💰 Revisar Finanzas
                  </button>
                  <button className="chip" onClick={() => { setCategory('Inventario'); handleSend("Reporte de laptops en stock", 'Inventario'); }}>
                    📦 Estado de Inventario
                  </button>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`message-wrapper ${msg.role}`}>
                {msg.role === 'assistant' && <div className="avatar">👔</div>}
                <div className="message-bubble">
                  {renderMessageContent(msg)}
                </div>
                {msg.role === 'user' && <div className="avatar user-avatar">👤</div>}
              </div>
            ))
          )}
          {loading && (
            <div className="message-wrapper assistant">
              <div className="avatar">👔</div>
              <div className="message-bubble loading">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); handleSend(input); }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Buscando en [${category}]... Pregunta lo que necesites:`}
            disabled={loading}
            maxLength={1000}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Consultar
          </button>
        </form>
      </div>
    </div>
  );
}

export default AdminChat;
