import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = 'http://localhost:8000';


function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    
    // FastAPI requiere formato form-urlencoded para OAuth2
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
      const res = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      if (!res.ok) throw new Error('Credenciales inválidas');
      
      const data = await res.json();
      localStorage.setItem('admin_token', data.access_token);
      // Limpiar sesiones de chat para empezar de cero
      localStorage.removeItem('chat_session_id');
      localStorage.removeItem('admin_chat_session_id');
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app-background">
      <div className="chat-container" style={{ alignItems: 'center', justifyContent: 'center', height: '60vh', maxWidth: '400px' }}>
        <h2 style={{ color: '#3b82f6', marginBottom: '20px' }}>🔐 Acceso Admin</h2>
        {error && <p style={{ color: '#ef4444', marginBottom: '10px' }}>{error}</p>}
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '80%' }}>
          <input 
            type="text" 
            placeholder="Usuario" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
          />
          <input 
            type="password" 
            placeholder="Contraseña" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.2)', color: 'white' }}
          />
          <button type="submit" className="buy-button" style={{ padding: '12px', marginTop: '10px' }}>Entrar</button>
        </form>
        <button 
          onClick={() => navigate('/')} 
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', marginTop: '20px', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Volver a la tienda
        </button>
      </div>
    </div>
  );
}

export default Login;
