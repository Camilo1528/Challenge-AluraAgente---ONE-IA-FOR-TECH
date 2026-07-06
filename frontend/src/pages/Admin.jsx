import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Admin() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/login');
    }
  }, [navigate]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('admin_token');

    try {
      setMessage('Subiendo y reindexando... ⏳');
      const res = await fetch('http://localhost:8000/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('admin_token');
          navigate('/login');
          return;
        }
        throw new Error('Error subiendo el archivo');
      }
      
      const data = await res.json();
      setMessage('✅ ' + data.message);
      setFile(null);
    } catch (err) {
      setMessage('❌ ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  return (
    <div className="app-background">
      <div className="chat-container" style={{ padding: '30px', maxWidth: '600px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px', marginBottom: '20px' }}>
          <h2 style={{ color: '#f8fafc', margin: 0 }}>⚙️ Panel de Administración</h2>
          <div>
            <button onClick={() => navigate('/')} className="chip" style={{ marginRight: '10px' }}>🏠 Chat</button>
            <button onClick={handleLogout} className="chip" style={{ background: '#ef4444', borderColor: '#ef4444' }}>Salir</button>
          </div>
        </header>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '30px', borderRadius: '12px' }}>
          <h3 style={{ color: '#8b5cf6', marginTop: 0 }}>Subir Documentos a la Base de Conocimiento</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '20px' }}>
            Selecciona un archivo (PDF, CSV, XLSX, MD, JSON). Al subirlo, el motor RAG lo leerá e indexará automáticamente sin necesidad de reiniciar el servidor gracias a Watchdog.
          </p>

          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <input 
              type="file" 
              onChange={(e) => setFile(e.target.files[0])}
              style={{ color: 'white' }}
              accept=".pdf,.csv,.xlsx,.xls,.md,.txt,.json,.docx,.html"
            />
            <button 
              type="submit" 
              className="buy-button" 
              disabled={!file}
              style={{ padding: '15px', fontSize: '1.1rem', opacity: file ? 1 : 0.5 }}
            >
              Subir al Cerebro de la IA 🧠
            </button>
          </form>

          {message && (
            <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', color: '#f8fafc' }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Admin;
