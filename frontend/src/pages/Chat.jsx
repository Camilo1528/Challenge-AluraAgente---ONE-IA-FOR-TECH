import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


// Sanitiza entrada de usuario para prevenir XSS e inyecciones
const sanitizeInput = (text) => {
  if (!text) return '';
  // Eliminar caracteres de control peligrosos
  return text.replace(/[<>&"'\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim();
};

const getSessionId = () => {
  let sid = localStorage.getItem('chat_session_id');
  if (!sid) {
    sid = 'session_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now();
    localStorage.setItem('chat_session_id', sid);
  }
  return sid;
};

export { getSessionId };

const TypingMessage = ({ content }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayedText(prev => {
        if (prev.length < content.length) {
          return prev + content.charAt(prev.length);
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 15);
    return () => clearInterval(interval);
  }, [content]);
  
  return <span>{displayedText}</span>;
};

export { TypingMessage };

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const category = 'Inventario'; // Público: Forzado a Inventario
  const messagesEndRef = useRef(null);
  const [sessionId, setSessionId] = useState(getSessionId());

  const startNewConversation = async () => {
    // Limpiar historial en el backend
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      await fetch(`${apiUrl}/history/${sessionId}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error limpiando historial:', e);
    }
    // Generar nuevo session ID
    localStorage.removeItem('chat_session_id');
    const newSid = getSessionId();
    setSessionId(newSid);
    setMessages([]);
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/history/${sessionId}`);
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

  const handleSend = useCallback(async (text) => {
    const cleanText = sanitizeInput(text);
    if (!cleanText || cleanText.length < 2) return;

    // Detección básica de prompt injection (lado cliente)
    const injectionPatterns = [
      /ignora\s*(instrucciones|reglas|sistema)/i,
      /olvida\s*(todo|instrucciones)/i,
      /act[úu]a\s*como/i,
      /eres\s*(ahora|realmente)/i,
      /reve[láa]|muestra|dice\s*(prompt|password|token)/i,
    ];
    for (const pattern of injectionPatterns) {
      if (pattern.test(cleanText)) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: '⚠️ No puedo procesar esa solicitud. Estoy aquí para ayudarte con productos y servicios de TechStore. ¿En qué más puedo ayudarte?',
          isHistory: false
        }]);
        return;
      }
    }

    const userMessage = { role: 'user', content: cleanText, isHistory: false };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          session_id: sessionId,
          message: cleanText,
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
  }, [sessionId, category]);

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
              <h1>Asistente de Compras</h1>
              <p>Tu ayudante virtual personal</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={startNewConversation} className="btn-login" style={{ background: 'transparent', color: 'var(--text-pure)', border: '1px solid var(--border-subtle)', boxShadow: 'none', cursor: 'pointer', fontSize: '14px' }}>
              🆕 Nueva
            </button>
            <Link to="/" className="btn-login" style={{ background: 'transparent', color: 'var(--text-pure)', border: '1px solid var(--border-subtle)', boxShadow: 'none' }}>
              ⬅ Tienda
            </Link>
            <Link to="/admin" className="btn-login">
              Administración
            </Link>
          </div>
        </header>

        <div className="chat-box">
          {messages.length === 0 ? (
            <div className="empty-chat">
              <div className="welcome-card">
                <h2>¡Hola! 👋</h2>
                <p>Soy tu Asistente de Compras Virtual. Estoy aquí para ayudarte a encontrar el producto perfecto en nuestra tienda.</p>
                <div className="quick-actions">
                  <button className="chip" onClick={() => handleSend("¿Qué laptops me recomiendas para trabajar?")}>
                    💻 Buscar Laptops
                  </button>
                  <button className="chip" onClick={() => handleSend("Busco unos audífonos con cancelación de ruido")}>
                    🎧 Buscar Audífonos
                  </button>
                  <button className="chip" onClick={() => handleSend("¿Cuánto tardan los envíos a mi ciudad?")}>
                    📦 Tiempos de Envío
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
            placeholder="Pregúntame sobre cualquier producto..."
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
