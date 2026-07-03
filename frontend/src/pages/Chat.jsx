import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const getSessionId = () => {
  let sid = localStorage.getItem('chat_session_id');
  if (!sid) {
    sid = 'session_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('chat_session_id', sid);
  }
  return sid;
};

const TypingMessage = ({ content }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < content.length) {
        setDisplayedText(prev => prev + content.charAt(i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [content]);
  
  return <span>{displayedText}</span>;
};

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('Todos');
  const messagesEndRef = useRef(null);
  const sessionId = getSessionId();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`http://localhost:8000/history/${sessionId}`);
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

  const handleSend = async (text) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text, isHistory: false };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: sessionId,
          message: text,
          category: category
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
            <button className="buy-button" onClick={() => alert(`¡Añadido al carrito: ${name}!`)}>
              Añadir al Carrito
            </button>
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
            <div className="header-avatar">🤖</div>
            <div className="header-info">
              <h1>TechStore AI</h1>
              <p>Asistente Autónomo Enterprise</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              style={{ padding: '8px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <option style={{color: 'black'}} value="Todos">Todos los Docs</option>
              <option style={{color: 'black'}} value="Recursos Humanos">RRHH</option>
              <option style={{color: 'black'}} value="Finanzas">Finanzas</option>
              <option style={{color: 'black'}} value="Inventario">Inventario</option>
            </select>
            <Link to="/admin" style={{ padding: '8px 15px', background: '#3b82f6', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold' }}>
              Admin
            </Link>
          </div>
        </header>

        <div className="chat-box">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="welcome-card">
                <h2>¡Hola! 👋</h2>
                <p>Soy el Agente Autónomo de TechStore. Puedo rastrear envíos, consultar productos y leer políticas.</p>
                <div className="quick-actions">
                  <button className="chip" onClick={() => handleSend("¿Qué laptops tienen en el inventario?")}>
                    💻 Ver Laptops
                  </button>
                  <button className="chip" onClick={() => handleSend("Rastrear mi pedido 555-XYZ")}>
                    📦 Rastrear Pedido
                  </button>
                  <button className="chip" onClick={() => handleSend("¿Cuáles son las políticas de vacaciones?")}>
                    🏖️ Reglas de RH
                  </button>
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={index} className={`message-wrapper ${msg.role}`}>
                {msg.role === 'assistant' && <div className="avatar">🤖</div>}
                <div className="message-bubble">
                  {renderMessageContent(msg)}
                </div>
                {msg.role === 'user' && <div className="avatar user-avatar">👤</div>}
              </div>
            ))
          )}
          {loading && (
            <div className="message-wrapper assistant">
              <div className="avatar">🤖</div>
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
            placeholder="Pregunta lo que necesites (Max 1000 chars)..."
            disabled={loading}
            maxLength={1000}
          />
          <button type="submit" disabled={loading || !input.trim()}>
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}

export default Chat;
