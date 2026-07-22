import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';


function Admin() {
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  
  // Inventory state
  const [products, setProducts] = useState([]);
  const [invMessage, setInvMessage] = useState('');
  const [newProduct, setNewProduct] = useState({
    name: '', price: '', category: '', image: '', shipping: 'Envío gratis', stock: 10
  });
  const [productImageFile, setProductImageFile] = useState(null);

  // Orders state
  const [orders, setOrders] = useState([]);
  const [orderMessage, setOrderMessage] = useState('');

  // Security state
  const [newPassword, setNewPassword] = useState('');
  const [secMessage, setSecMessage] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (!token) {
      navigate('/login');
    } else {
      fetchProducts();
      fetchOrders();
    }
  }, [navigate]);

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/products`);
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrders = async () => {
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`${API_URL}/orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      console.error(err);
    }
  };

  const updateOrderStatus = async (orderId, newStatus) => {
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setOrderMessage(`✅ Estado de Orden #${orderId} actualizado a ${newStatus}`);
        fetchOrders();
      } else {
        setOrderMessage('❌ Error actualizando orden');
      }
    } catch (err) {
      setOrderMessage('❌ ' + err.message);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    
    const token = localStorage.getItem('admin_token');

    try {
      setMessage('Subiendo y reindexando... ⏳');
      const res = await fetch(`${API_URL}/upload`, {
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

  const handleDriveSync = async () => {
    const token = localStorage.getItem('admin_token');
    try {
      setMessage('Sincronizando con Drive... ⏳');
      const res = await fetch(`${API_URL}/sync-drive`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('✅ ' + data.message);
      } else {
        setMessage('❌ ' + (data.detail || 'Error sincronizando'));
      }
    } catch (err) {
      setMessage('❌ ' + err.message);
    }
  };

  const updateProductData = async (product) => {
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`${API_URL}/products/${product.id}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(product)
      });
      if (res.ok) {
        setInvMessage(`✅ Producto #${product.id} actualizado`);
        fetchProducts();
      } else {
        setInvMessage('❌ Error actualizando producto');
      }
    } catch (err) {
      setInvMessage('❌ ' + err.message);
    }
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("¿Seguro que deseas eliminar este producto definitivamente?")) return;
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`${API_URL}/products/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        setInvMessage(`✅ Producto #${id} eliminado`);
        fetchProducts();
      } else {
        setInvMessage('❌ Error eliminando producto');
      }
    } catch (err) {
      setInvMessage('❌ ' + err.message);
    }
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('admin_token');
    
    let finalImageUrl = newProduct.image;
    
    try {
      // 1. Si hay archivo, subirlo primero
      if (productImageFile) {
        setInvMessage('Subiendo imagen... ⏳');
        const formData = new FormData();
        formData.append('file', productImageFile);
        
        const uploadRes = await fetch(`${API_URL}/upload-product-image`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData
        });
        
        if (!uploadRes.ok) throw new Error('Error al subir la imagen del producto');
        const uploadData = await uploadRes.json();
        finalImageUrl = uploadData.image_url;
      }

      // 2. Crear producto
      setInvMessage('Creando producto... ⏳');
      const res = await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newProduct.name,
          price: parseFloat(newProduct.price),
          category: newProduct.category,
          image: finalImageUrl || 'https://loremflickr.com/600/600/tech?random=999',
          shipping: newProduct.shipping,
          stock: parseInt(newProduct.stock)
        })
      });
      if (res.ok) {
        setInvMessage('✅ Producto creado exitosamente');
        fetchProducts();
        setNewProduct({ name: '', price: '', category: '', image: '', shipping: 'Envío gratis', stock: 10 });
        setProductImageFile(null);
      } else {
        setInvMessage('❌ Error creando producto');
      }
    } catch (err) {
      setInvMessage('❌ ' + err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`${API_URL}/admin/password`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ new_password: newPassword })
      });
      if (res.ok) {
        setSecMessage('✅ Contraseña actualizada exitosamente');
        setNewPassword('');
      } else {
        setSecMessage('❌ Error actualizando contraseña');
      }
    } catch (err) {
      setSecMessage('❌ ' + err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/login');
  };

  return (
    <div className="app-background" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', overflowY: 'auto' }}>
      
      {/* HEADER */}
      <header style={{ width: '100%', maxWidth: '1200px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px', marginBottom: '30px' }}>
        <h2 style={{ color: 'var(--text-pure)', margin: 0, fontSize: '2rem', fontWeight: '800' }}>⚙️ Panel de Administración</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => navigate('/')} className="btn-login" style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}>🏠 Tienda</button>
          <button onClick={() => navigate('/admin/chat')} className="btn-login" style={{ background: 'var(--accent)' }}>💬 Chat Privado</button>
          <button onClick={handleLogout} className="btn-login" style={{ background: '#ef4444', color: 'white' }}>Salir</button>
        </div>
      </header>

      <div style={{ width: '100%', maxWidth: '1200px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '30px' }}>
        
        {/* IA Knowledge Upload */}
        <div className="glass-panel" style={{ padding: '30px', borderRadius: '24px' }}>
          <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: '1.4rem' }}>🧠 Base de Conocimiento IA</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px', lineHeight: '1.5' }}>
            Sube PDFs, Excel, MD o JSON para entrenar al Asistente virtual.
          </p>
          <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ padding: '15px', border: '1px dashed var(--accent)', borderRadius: '12px', background: 'var(--bg-surface)' }}>
              <input type="file" onChange={(e) => setFile(e.target.files[0])} className="admin-input" style={{ width: '100%', padding: '8px' }} />
            </div>
            <button type="submit" className="btn-buy" disabled={!file} style={{ padding: '12px', opacity: file ? 1 : 0.5 }}>Subir Archivo Manual</button>
          </form>
          <button onClick={handleDriveSync} className="btn-buy" style={{ padding: '12px', width: '100%', marginTop: '10px', background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            Sincronizar con Google Drive ☁️
          </button>
          {message && <div style={{ marginTop: '15px', color: message.includes('❌') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{message}</div>}
        </div>

        {/* Añadir Producto */}
        <div className="glass-panel" style={{ padding: '30px', borderRadius: '24px' }}>
          <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: '1.4rem' }}>📦 Crear Producto Nuevo</h3>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input placeholder="Nombre del Producto" value={newProduct.name} onChange={e=>setNewProduct({...newProduct, name: e.target.value})} className="admin-input" required />
            <div style={{ display: 'flex', gap: '12px' }}>
              <input placeholder="Precio (COP)" type="number" value={newProduct.price} onChange={e=>setNewProduct({...newProduct, price: e.target.value})} className="admin-input" style={{flex: 1}} required />
              <input placeholder="Stock Inicial" type="number" value={newProduct.stock} onChange={e=>setNewProduct({...newProduct, stock: e.target.value})} className="admin-input" style={{flex: 1}} required />
            </div>
            <input placeholder="Categoría (Ej: Periféricos)" value={newProduct.category} onChange={e=>setNewProduct({...newProduct, category: e.target.value})} className="admin-input" required />
            
            <div style={{ padding: '10px', border: '1px solid var(--border-subtle)', borderRadius: '10px', background: 'var(--bg-surface)' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imagen del Producto:</p>
              <input 
                type="file" 
                accept="image/*"
                onChange={(e) => {
                  setProductImageFile(e.target.files[0]);
                  setNewProduct({...newProduct, image: ''}); // Limpiar URL si sube archivo
                }}
                className="admin-input"
                style={{ marginBottom: '8px', padding: '8px' }} 
              />
              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '4px 0' }}>— O PEGA UNA URL —</div>
              <input 
                placeholder="https://..." 
                value={newProduct.image} 
                onChange={(e) => {
                  setNewProduct({...newProduct, image: e.target.value});
                  setProductImageFile(null); // Limpiar archivo si pone URL
                }} 
                className="admin-input"
              />
            </div>
            
            <button type="submit" className="btn-buy" style={{ padding: '12px', marginTop: '10px' }}>Añadir al Catálogo</button>
          </form>
        </div>

        {/* Seguridad */}
        <div className="glass-panel" style={{ padding: '30px', borderRadius: '24px' }}>
          <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: '1.4rem' }}>🔒 Seguridad del Sistema</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px', lineHeight: '1.5' }}>
            Cambia tu contraseña de administrador regularmente para mantener la plataforma segura.
          </p>
          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input type="password" placeholder="Nueva Contraseña" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="admin-input" required />
            <button type="submit" className="btn-buy" style={{ padding: '12px', marginTop: '10px' }}>Actualizar Contraseña</button>
          </form>
          {secMessage && <div style={{ marginTop: '15px', color: secMessage.includes('❌') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{secMessage}</div>}
        </div>

      </div>

      {/* Tabla de Inventario */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '1200px', padding: '30px', borderRadius: '24px', marginTop: '30px', marginBottom: '50px' }}>
        <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: '1.4rem' }}>📋 Gestión de Inventario Activo</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px' }}>
          Edita el nombre y el stock directamente. Si ya no vas a vender un producto, elimínalo permanentemente.
        </p>
        {invMessage && <div style={{ marginBottom: '15px', color: invMessage.includes('❌') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{invMessage}</div>}
        
        <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <table style={{ width: '100%', color: 'var(--text-primary)', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '15px' }}>ID</th>
                <th style={{ padding: '15px' }}>Producto</th>
                <th style={{ padding: '15px' }}>Categoría</th>
                <th style={{ padding: '15px' }}>Precio</th>
                <th style={{ padding: '15px' }}>Stock</th>
                <th style={{ padding: '15px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: 'var(--text-tertiary)' }}>#{p.id}</td>
                  <td style={{ padding: '15px' }}>
                    <input 
                      type="text" 
                      defaultValue={p.name} 
                      id={`name-${p.id}`}
                      className="admin-input"
                      style={{ width: '200px', padding: '8px' }} 
                    />
                  </td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {p.category}
                    </span>
                  </td>
                  <td style={{ padding: '15px' }}>${p.price.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '15px' }}>
                    <input 
                      type="number" 
                      defaultValue={p.stock} 
                      id={`stock-${p.id}`}
                      className="admin-input"
                      style={{ width: '70px', padding: '8px' }} 
                    />
                  </td>
                  <td style={{ padding: '15px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button 
                      onClick={() => {
                        const newName = document.getElementById(`name-${p.id}`).value;
                        const newStock = parseInt(document.getElementById(`stock-${p.id}`).value);
                        updateProductData({ ...p, name: newName, stock: newStock });
                      }}
                      className="btn-buy"
                      style={{ padding: '8px 16px', background: '#10b981' }}
                    >
                      Guardar
                    </button>
                    <button 
                      onClick={() => deleteProduct(p.id)}
                      className="btn-buy"
                      style={{ padding: '8px 16px', background: '#ef4444' }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de Órdenes */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '1200px', padding: '30px', borderRadius: '24px', marginBottom: '50px' }}>
        <h3 style={{ color: 'var(--accent)', marginTop: 0, fontSize: '1.4rem' }}>🛒 Pedidos Recientes</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '20px' }}>
          Gestiona el estado de los pedidos realizados por tus clientes.
        </p>
        {orderMessage && <div style={{ marginBottom: '15px', color: orderMessage.includes('❌') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{orderMessage}</div>}
        
        <div style={{ overflowX: 'auto', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <table style={{ width: '100%', color: 'var(--text-primary)', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.02)' }}>
                <th style={{ padding: '15px' }}>ID Pedido</th>
                <th style={{ padding: '15px' }}>Cliente</th>
                <th style={{ padding: '15px' }}>Fecha</th>
                <th style={{ padding: '15px' }}>Total</th>
                <th style={{ padding: '15px' }}>Estado</th>
                <th style={{ padding: '15px', textAlign: 'center' }}>Actualizar Estado</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && <tr><td colSpan="6" style={{ padding: '15px', textAlign: 'center' }}>No hay pedidos aún.</td></tr>}
              {orders.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '15px', fontWeight: 'bold', color: 'var(--text-tertiary)' }}>#{o.id}</td>
                  <td style={{ padding: '15px', fontWeight: '600' }}>{o.username}</td>
                  <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{new Date(o.created_at).toLocaleString()}</td>
                  <td style={{ padding: '15px', fontWeight: 'bold' }}>${o.total.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ 
                      background: o.status === 'Entregado' ? '#d1fae5' : o.status === 'Enviado' ? '#dbeafe' : '#fef3c7', 
                      color: o.status === 'Entregado' ? '#065f46' : o.status === 'Enviado' ? '#1e40af' : '#92400e', 
                      padding: '6px 10px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold' 
                    }}>
                      {o.status}
                    </span>
                  </td>
                  <td style={{ padding: '15px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <select 
                      id={`status-${o.id}`}
                      defaultValue={o.status}
                      className="admin-input"
                      style={{ padding: '8px', width: '130px' }}
                    >
                      <option value="Pendiente">Pendiente</option>
                      <option value="Empacando">Empacando</option>
                      <option value="Enviado">Enviado</option>
                      <option value="Entregado">Entregado</option>
                    </select>
                    <button 
                      onClick={() => updateOrderStatus(o.id, document.getElementById(`status-${o.id}`).value)}
                      className="btn-buy"
                      style={{ padding: '8px 16px', background: 'var(--accent)' }}
                    >
                      Aplicar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}

export default Admin;
