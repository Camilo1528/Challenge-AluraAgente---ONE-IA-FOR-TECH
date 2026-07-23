import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { BorderBeam } from '../components/magicui/border-beam';
import { ShimmerButton } from '../components/magicui/shimmer-button';
import { Particles } from '../components/magicui/particles';
import { MagicCard } from '../components/magicui/magic-card';
import { Meteors } from '../components/magicui/meteors';
import { NumberTicker } from '../components/magicui/number-ticker';
import { RainbowButton } from '../components/magicui/rainbow-button';
import { Confetti } from '../components/magicui/confetti';
import { ShoppingCart, Package, MapPin, Lightning, Star, X, Robot, Sun, Moon, SignOut, Receipt, ArrowRight, UserCircle, Plus, Minus, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Howl } from 'howler';
import * as Tooltip from '@radix-ui/react-tooltip';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTheme } from 'next-themes';
const ThreeScene = React.lazy(() => import('../components/ThreeScene'));

// Sounds
const sounds = {
  add: new Howl({ src: ['https://actions.google.com/sounds/v1/water/water_drop.ogg'], volume: 0.5 }),
  success: new Howl({ src: ['https://actions.google.com/sounds/v1/cartoon/clown_horn.ogg'], volume: 0.5 }),
  modal: new Howl({ src: ['https://actions.google.com/sounds/v1/cartoon/pop.ogg'], volume: 0.5 })
};

const API_URL = 'https://techstore-backend-7c2a.onrender.com';

const getImageUrl = (imageName) => {
  if (!imageName) return '';
  if (imageName.startsWith('http://') || imageName.startsWith('https://')) return imageName;
  if (imageName.startsWith('images/')) return `/${imageName}`;
  return `${API_URL}/static/products/${imageName}`;
};

const categoryEmojis = {
  'Laptops': '💻',
  'Audífonos': '🎧',
  'Teclados': '⌨️',
  'Monitores': '🖥️',
  'Mouses': '🖱️',
  'Tablets': '📱',
  'Accesorios': '🔌',
  'Almacenamiento': '💾',
  'Impresión': '🖨️',
  'Audio': '🔊',
  'Cámaras': '📷',
  'Redes': '🌐',
  'Videojuegos': '🎮',
};

const getCategoryEmoji = (category) => {
  return categoryEmojis[category] || '📦';
};

// Sortable Cart Item Component
function SortableCartItem({ item, updateQuantity }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative',
    touchAction: 'none'
  };

  return (
    <div ref={setNodeRef} style={style} className="cart-item" {...attributes} {...listeners}>
      <img src={getImageUrl(item.image)} alt={item.name} onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/100x100/1a1a2e/6366f1?text=${encodeURIComponent('📦')}`; }} className="cart-item-img" />
      <div className="cart-item-info">
        <h4>{item.name}</h4>
        <p>{item.price.toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '8px' }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => updateQuantity(item.id, -1)} style={{ padding: '4px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', background: '#fff', cursor: 'pointer', color: '#333', display: 'flex', alignItems: 'center' }}>
            {item.quantity === 1 ? <Trash weight="bold" /> : <Minus weight="bold" />}
          </button>
          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-pure)' }}>{item.quantity}</span>
          <button onClick={() => updateQuantity(item.id, 1)} disabled={item.quantity >= item.stock} style={{ padding: '4px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', background: item.quantity >= item.stock ? '#f5f5f7' : '#fff', cursor: item.quantity >= item.stock ? 'not-allowed' : 'pointer', color: item.quantity >= item.stock ? '#999' : '#333', display: 'flex', alignItems: 'center' }}>
            <Plus weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Store() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutSuccess, setIsCheckoutSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [isLoading, setIsLoading] = useState(true);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const carouselRef = useRef(null);
  const { theme, setTheme } = useTheme();

  // DndKit sensors for cart reordering
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setCart((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const scrollCarousel = (direction) => {
    if (carouselRef.current) {
      const scrollAmount = 600; // Ancho de un par de tarjetas
      carouselRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };
  const [userLocation, setUserLocation] = useState(localStorage.getItem('user_location') || '');
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationInput, setLocationInput] = useState('');

  const [currentBanner, setCurrentBanner] = useState(0);
  const bannerColors = [
    'linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #1d4ed8 100%)',
    'linear-gradient(135deg, #064e3b 0%, #059669 50%, #047857 100%)',
    'linear-gradient(135deg, #7f1d1d 0%, #dc2626 50%, #b91c1c 100%)'
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner(prev => (prev + 1) % bannerColors.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Authentication State for Customers
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');

  // Orders State
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [myOrders, setMyOrders] = useState([]);

  // Product Details & Reviews
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState({ rating: 5, comment: '' });
  const [reviewMessage, setReviewMessage] = useState('');

  const fetchProducts = () => {
    fetch(`${API_URL}/products`)
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching products:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('user_token');
    const username = localStorage.getItem('user_name');
    if (token && username) {
      setCurrentUser(username);
    }

    fetchProducts();
  }, []);

  const updateQuantity = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.id === productId) {
        const newQty = item.quantity + delta;
        if (newQty > item.stock) return item; 
        if (newQty <= 0) return null; 
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };

  const addToCart = (product) => {
    setCart(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        if (exists.quantity >= product.stock) {
          toast.error('Sin stock suficiente');
          return prev;
        }
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    sounds.add.play();
    toast.success('Agregado al carrito', { description: product.name });
  };

    const handleGPSLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    
    setLocationInput("Buscando tu ubicación...");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Usar API gratuita de Nominatim para obtener ciudad/barrio
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          
          let address = "Ubicación detectada";
          if (data && data.address) {
            address = data.address.city || data.address.town || data.address.village || data.address.suburb || data.address.country || address;
          }
          
          setLocationInput(address);
          localStorage.setItem('user_location', address);
          setUserLocation(address);
          setTimeout(() => setShowLocationModal(false), 1000);
          
        } catch (error) {
          setLocationInput("Coordenadas obtenidas");
          localStorage.setItem('user_location', "Ubicación GPS");
          setUserLocation("Ubicación GPS");
          setTimeout(() => setShowLocationModal(false), 1000);
        }
      },
      (error) => {
        alert("No pudimos obtener tu ubicación. Por favor, asegúrate de dar permisos.");
        setLocationInput("");
      }
    );
  };

  const handleCheckout = async () => {
    if (!currentUser) {
      setIsCartOpen(false);
      setShowAuthModal(true);
      return;
    }

    const token = localStorage.getItem('user_token');
    const items = cart.map(item => ({ product_id: item.id, quantity: item.quantity, price: item.price }));
    const total = cart.reduce((total, item) => total + (item.price * item.quantity), 0);

    try {
      const res = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ items, total })
      });
      
      if (res.ok) {
        setCart([]);
        setIsCheckoutSuccess(true);
        sounds.success.play();
        toast.success('¡Compra Exitosa!');
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Error en el checkout');
      }
    } catch (err) {
      toast.error('Error de conexión');
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    const endpoint = authMode === 'login' ? 'login/user' : 'register';
    
    try {
      const res = await fetch(`${API_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Error en autenticación');
      }

      if (authMode === 'register') {
        setAuthMode('login');
        setAuthError('✅ Cuenta creada, ahora inicia sesión');
      } else {
        localStorage.setItem('user_token', data.access_token);
        localStorage.setItem('user_name', data.username);
        setCurrentUser(data.username);
        setShowAuthModal(false);
        // We do NOT open cart here to allow standard browsing, user can open it if they want
      }
    } catch (err) {
      setAuthError('❌ ' + err.message);
    }
  };

  const handleGoogleMockLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/google/mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'usuario@gmail.com', name: 'Usuario Demo' })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('user_token', data.access_token);
        localStorage.setItem('user_name', data.username);
        setCurrentUser(data.username);
        setShowAuthModal(false);
      }
    } catch (err) {
      setAuthError('❌ Error conectando con Google');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_name');
    setCurrentUser(null);
  };

  const fetchMyOrders = async () => {
    const token = localStorage.getItem('user_token');
    try {
      const res = await fetch(`${API_URL}/my-orders`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setMyOrders(data.orders || []);
      setShowOrdersModal(true);
    } catch (err) {
      console.error(err);
    }
  };

  const openProductDetails = async (product) => {
    setSelectedProduct(product);
    setReviewMessage('');
    try {
      const res = await fetch(`${API_URL}/products/${product.id}/reviews`);
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch (err) {
      console.error(err);
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setReviewMessage('❌ Debes iniciar sesión para comentar');
      return;
    }
    const token = localStorage.getItem('user_token');
    try {
      const res = await fetch(`${API_URL}/products/${selectedProduct.id}/reviews`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(newReview)
      });
      if (res.ok) {
        setReviewMessage('✅ Reseña publicada!');
        setNewReview({ rating: 5, comment: '' });
        openProductDetails(selectedProduct); // refresh
      } else {
        setReviewMessage('❌ Error al publicar');
      }
    } catch (err) {
      setReviewMessage('❌ Error al publicar');
    }
  };

  const categories = ['Todas', ...new Set(products.map(p => p.category))];

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Tooltip.Provider delayDuration={300}>
      <header className="ml-header">
        <div className="ml-header-container">
          <Link to="/" className="ml-logo">
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Lightning weight="fill" color="var(--accent)" /> TechStore</span>
          </Link>
          
          <div className="ml-search-bar">
            <input 
              type="text" 
              placeholder="Buscar productos, marcas y más..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="ml-search-btn" onClick={() => setSearchQuery('')}><X size={16} /></button>
          </div>
          
          <div className="ml-promo">
            <span>HASTA 40% OFF</span>
          </div>
        </div>

        <div className="ml-nav-container">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className="ml-location" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }} onClick={() => { setShowLocationModal(true); sounds.modal.play(); }}>
                <MapPin size={24} color="var(--text-secondary)" />
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{userLocation ? 'Enviar a' : 'Ingresa tu'}</span><br/>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{userLocation || 'ubicación'}</strong>
                </div>
              </div>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="tooltip-content" sideOffset={5}>
                Cambiar ubicación de entrega
                <Tooltip.Arrow className="tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <div className="ml-categories">
            {categories.map(cat => (
              <button 
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`ml-nav-link ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="ml-user-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              title="Cambiar tema"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <UserCircle size={20} /> {currentUser}
                </span>
                <button onClick={fetchMyOrders} className="ml-nav-link" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Receipt size={16} /> Mis compras</button>
                <button onClick={handleLogout} className="ml-nav-link" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><SignOut size={16} /> Salir</button>
              </div>
            ) : (
              <button onClick={() => { setShowAuthModal(true); sounds.modal.play(); }} className="btn-login">Ingresar</button>
            )}
            
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <div className="ml-cart-icon" onClick={() => { setIsCartOpen(true); sounds.modal.play(); }} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                  <ShoppingCart size={24} weight="duotone" />
                  {cart.length > 0 && <span className="ml-cart-badge">{cart.reduce((total, item) => total + item.quantity, 0)}</span>}
                </div>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip-content" sideOffset={5}>
                  Ver carrito ({cart.length} items)
                  <Tooltip.Arrow className="tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>
      </header>

      <main className="ml-main">
        <section className="ml-hero" style={{ position: 'relative', overflow: 'hidden' }}>
          <Suspense fallback={null}>
            <ThreeScene className="z-[1] opacity-40 hidden md:block" />
          </Suspense>
          <div className="particles-overlay" style={{ zIndex: 2 }}>
            <Particles className="absolute inset-0" quantity={80} color="#6366f1" size={0.5} />
            <Meteors number={15} />
          </div>
          <div className="ml-hero-slider" style={{ transform: `translateX(-${currentBanner * 100}%)` }}>
            {bannerColors.map((gradient, idx) => (
              <div key={idx} className="ml-hero-slide" style={{ background: gradient }}>
                <div className="ml-hero-content">
                  {idx === 0 && (
                    <>
                      <div className="hero-badge-animated">⚡ Ofertas Especiales</div>
                      <h1 className="hero-title-animated">
                        Tecnología <span>de vanguardia</span> al mejor precio
                      </h1>
                      <p className="hero-subtitle-animated">Descubre los últimos lanzamientos en electrónica, computación y accesorios con envío gratis.</p>
                      <div className="hero-cta-animated">
                        <button onClick={() => document.querySelector('.ml-section-container')?.scrollIntoView({ behavior: 'smooth' })}>
                          Ver productos →
                        </button>
                      </div>
                    </>
                  )}
                  {idx === 1 && (
                    <>
                      <div className="hero-badge-animated" style={{ animationDelay: '0.2s' }}>🚚 Envío Gratis</div>
                      <h1 className="hero-title-animated" style={{ animationDelay: '0.4s' }}>
                        Envío gratis en <span>compras superiores</span>
                      </h1>
                      <p className="hero-subtitle-animated" style={{ animationDelay: '0.6s' }}>Aprovecha el envío gratuito a todo el país en pedidos desde $50.000 COP.</p>
                    </>
                  )}
                  {idx === 2 && (
                    <>
                      <div className="hero-badge-animated" style={{ animationDelay: '0.2s' }}>🔥 Hasta 40% OFF</div>
                      <h1 className="hero-title-animated" style={{ animationDelay: '0.4s' }}>
                        Grandes descuentos en <span>productos seleccionados</span>
                      </h1>
                      <p className="hero-subtitle-animated" style={{ animationDelay: '0.6s' }}>No te pierdas nuestras ofertas exclusivas con hasta 40% de descuento.</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="ml-features">
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><Package size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Envío gratis</h3>
            <p>Beneficio por tu compra</p>
          </div>
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><UserCircle size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Ingresa a tu cuenta</h3>
            <p>Disfruta de ofertas y compras</p>
          </div>
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><MapPin size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Ingresa tu ubicación</h3>
            <p>Consulta costos y entregas</p>
          </div>
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><Receipt size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Medios de pago</h3>
            <p>Paga rápido y seguro</p>
          </div>
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><Lightning size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Menos de $40.000</h3>
            <p>Descubre precios bajos</p>
          </div>
          <div className="ml-feature-card">
            <div className="ml-feature-icon"><Star size={32} weight="duotone" color="var(--accent)" /></div>
            <h3>Más vendidos</h3>
            <p>Explora las tendencias</p>
          </div>
        </section>

        {isLoading ? (
          <>
            <div className="ml-section-container">
              <div className="ml-section-header">
                <h2>Cargando productos...</h2>
              </div>
              <SkeletonTheme baseColor={theme === 'dark' ? '#1f1f35' : '#e2e8f0'} highlightColor={theme === 'dark' ? '#2d2d3d' : '#f1f5f9'}>
                <div className="ml-product-carousel">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="skeleton-card" style={{ background: 'transparent', padding: '15px' }}>
                      <Skeleton height={200} style={{ borderRadius: '8px', marginBottom: '15px' }} />
                      <div className="skeleton-text">
                        <Skeleton count={2} style={{ marginBottom: '8px' }} />
                        <Skeleton width="40%" height={24} />
                      </div>
                    </div>
                  ))}
                </div>
              </SkeletonTheme>
            </div>
          </>
        ) : (
          <>
          <div className="ml-section-container">
            <div className="ml-section-header">
              <h2>Más vendidos de la semana</h2>
              <a href="#">Ir a Más vendidos</a>
            </div>
            <div className="ml-carousel-wrapper">
              <button className="ml-carousel-btn left" onClick={() => scrollCarousel('left')}>&lt;</button>
              <button className="ml-carousel-btn right" onClick={() => scrollCarousel('right')}>&gt;</button>
              <div className="ml-product-carousel" ref={carouselRef}>
              {products.slice(0, 15).map((product) => {
                // Mock some MercadoLibre style data
                const discount = Math.floor(Math.random() * 40) + 10; // 10% to 50%
                const originalPrice = Math.floor(product.price / (1 - discount / 100));
                const cuotas = Math.floor(product.price / 12);

                return (
                  <MagicCard key={product.id} className="ml-card-exact magic-border-beam !rounded-none" gradientColor="#6366f1" gradientOpacity={0.08}>
                    <article onClick={() => openProductDetails(product)}>
                      <div className="ml-card-img-container">
                        <img src={getImageUrl(product.image)} alt={product.name} onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/224x224/1a1a2e/6366f1?text=${encodeURIComponent(getCategoryEmoji(product.category))}`; }} />
                        <BorderBeam size={120} duration={6} borderWidth={1} colorFrom="#6366f1" colorTo="#a855f7" />
                      </div>
                      <div className="ml-card-details">
                        <h3 className="ml-card-title">{product.name}</h3>
                        <p className="ml-card-original-price">${originalPrice.toLocaleString('es-CO')}</p>
                        <div className="ml-card-price-row">
                          <span className="ml-card-price">$<NumberTicker value={product.price} /></span>
                          <span className="ml-card-discount">{discount}% OFF</span>
                        </div>
                        <p className="ml-card-installments">12 cuotas de $ {cuotas.toLocaleString('es-CO')} sin interés</p>
                        <p className="ml-card-shipping">Envío gratis ⚡FULL <span>por ser tu primera compra</span></p>
                      </div>
                    </article>
                  </MagicCard>
                );
              })}
              </div>
            </div>
          </div>
          
          {/* GENERAL PRODUCT GRID */}
          <div className="ml-section-container" style={{ marginTop: '40px', background: 'transparent', boxShadow: 'none', padding: '0' }}>
            <div className="ml-section-header">
              <h2>Descubre más productos</h2>
            </div>
            
            <div className="ml-product-grid">
              {(showAllProducts ? filteredProducts : filteredProducts.slice(0, 10)).map(product => {
                const discount = Math.floor(Math.random() * 40) + 10;
                const originalPrice = Math.floor(product.price / (1 - discount / 100));
                const cuotas = Math.floor(product.price / 12);
                
                return (
                  <MagicCard key={'grid-'+product.id} className="ml-card-exact stagger-item magic-border-beam !rounded-none" gradientColor="#a855f7" gradientOpacity={0.08}>
                    <article onClick={() => openProductDetails(product)}>
                      <div className="ml-card-img-container">
                        <img src={getImageUrl(product.image)} alt={product.name} onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/224x224/1a1a2e/6366f1?text=${encodeURIComponent(getCategoryEmoji(product.category))}`; }} />
                        <BorderBeam size={120} duration={6} borderWidth={1} colorFrom="#a855f7" colorTo="#ec4899" delay={1} />
                      </div>
                      <div className="ml-card-details">
                        <h3 className="ml-card-title">{product.name}</h3>
                        <p className="ml-card-original-price">${originalPrice.toLocaleString('es-CO')}</p>
                        <div className="ml-card-price-row">
                          <span className="ml-card-price">$<NumberTicker value={product.price} /></span>
                          <span className="ml-card-discount">{discount}% OFF</span>
                        </div>
                        <p className="ml-card-installments">12 cuotas de $ {cuotas.toLocaleString('es-CO')} sin interés</p>
                        <p className="ml-card-shipping">Envío gratis</p>
                      </div>
                    </article>
                  </MagicCard>
                );
              })}
            </div>
            
            {!showAllProducts && filteredProducts.length > 10 && (
              <div className="ml-view-all-container">
                <RainbowButton onClick={() => setShowAllProducts(true)} className="ml-btn-view-all !bg-transparent !text-white !border !border-white/20 h-auto px-8 py-3">
                  ✨ Ver todos los productos
                </RainbowButton>
              </div>
            )}
          </div>
          </>
        )}
      </main>
      
      <Link to="/chat" className="floating-chat-btn">
        <span className="chat-icon">▲</span>
        Asistente
      </Link>

      {/* PRODUCT DETAILS & REVIEWS MODAL */}
      {selectedProduct && (
        <div className="cart-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="cart-modal glass-panel" style={{ maxWidth: '600px', width: '90%', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>{selectedProduct.name}</h2>
              <button className="btn-close" onClick={() => setSelectedProduct(null)}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
              <img src={getImageUrl(selectedProduct.image)} alt="" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/300x300/1a1a2e/6366f1?text=${encodeURIComponent(getCategoryEmoji(selectedProduct.category))}`; }} style={{ width: '150px', height: '150px', objectFit: 'cover', borderRadius: '12px' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>${selectedProduct.price.toLocaleString('es-CO')}</p>
                <p style={{ color: 'var(--text-secondary)' }}>Categoría: {selectedProduct.category}</p>
                <p style={{ color: 'var(--text-secondary)' }}>Envío: {selectedProduct.shipping}</p>
                <ShimmerButton
                  shimmerColor="rgba(255,255,255,0.3)"
                  shimmerDuration="3s"
                  borderRadius="8px"
                  background="var(--accent)"
                  onClick={() => addToCart(selectedProduct)}
                  style={{ marginTop: 'auto', padding: '10px 20px' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingCart size={20} weight="bold" /> Agregar al Carrito
                  </span>
                </ShimmerButton>
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />
            
            <h3>⭐ Reseñas de Clientes</h3>
            <div style={{ background: 'rgba(255,255,255,0.4)', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
              <form onSubmit={submitReview} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label>Tu Calificación:</label>
                  <select value={newReview.rating} onChange={e=>setNewReview({...newReview, rating: parseInt(e.target.value)})} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ccc' }}>
                    <option value="5">⭐⭐⭐⭐⭐ (5)</option>
                    <option value="4">⭐⭐⭐⭐ (4)</option>
                    <option value="3">⭐⭐⭐ (3)</option>
                    <option value="2">⭐⭐ (2)</option>
                    <option value="1">⭐ (1)</option>
                  </select>
                </div>
                <textarea 
                  placeholder="¿Qué te pareció el producto?" 
                  value={newReview.comment} 
                  onChange={e=>setNewReview({...newReview, comment: e.target.value})}
                  rows="3" 
                  style={{ padding: '10px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', resize: 'none' }}
                  required
                ></textarea>
                <button type="submit" className="btn-buy">Publicar Reseña</button>
                {reviewMessage && <div style={{ fontWeight: 'bold', color: reviewMessage.includes('❌') ? '#ef4444' : '#10b981' }}>{reviewMessage}</div>}
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {reviews.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>Sé el primero en dejar una reseña.</p> : null}
              {reviews.map(r => (
                <div key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                    <span style={{ fontWeight: 'bold' }}>{r.username}</span>
                    <span>{'⭐'.repeat(r.rating)}</span>
                  </div>
                  <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.9rem' }}>"{r.comment}"</p>
                  <small style={{ color: '#999' }}>{new Date(r.created_at).toLocaleDateString()}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MY ORDERS MODAL */}
      {showOrdersModal && (
        <div className="cart-overlay" onClick={() => setShowOrdersModal(false)}>
          <div className="cart-modal glass-panel" style={{ maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>📦 Mis Compras</h2>
              <button className="btn-close" onClick={() => setShowOrdersModal(false)}>✕</button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {myOrders.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Aún no has realizado ninguna compra.</p>
              ) : (
                myOrders.map(order => (
                  <div key={order.id} style={{ background: 'rgba(255,255,255,0.6)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '15px' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>Pedido #{order.id}</h3>
                        <small style={{ color: 'var(--text-secondary)' }}>{new Date(order.created_at).toLocaleString()}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <h3 style={{ margin: 0, color: 'var(--accent)' }}>${order.total.toLocaleString('es-CO')}</h3>
                        <span style={{ display: 'inline-block', marginTop: '5px', background: order.status === 'Entregado' ? '#d1fae5' : order.status === 'Enviado' ? '#dbeafe' : '#fef3c7', color: order.status === 'Entregado' ? '#065f46' : order.status === 'Enviado' ? '#1e40af' : '#92400e', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
                      {order.items.map(item => (
                        <div key={item.id} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <img src={getImageUrl(item.image)} alt="" onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/100x100/1a1a2e/6366f1?text=${encodeURIComponent('📦')}`; }} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                          <div>
                            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>{item.name}</p>
                            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cant: {item.quantity} - ${(item.price * item.quantity).toLocaleString('es-CO')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

            {/* LOCATION MODAL */}
      {showLocationModal && (
        <div className="cart-overlay" onClick={() => setShowLocationModal(false)}>
          <div className="cart-modal glass-panel" style={{ maxWidth: '400px', height: 'fit-content', maxHeight: '90vh', margin: 'auto', borderRadius: '12px' }} onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>Elige dónde recibir tus compras</h2>
              <button className="btn-close" onClick={() => setShowLocationModal(false)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Podrás ver costos y tiempos de entrega precisos en todo lo que busques.</p>
            <div style={{ marginTop: '20px' }}>
              <input 
                type="text" 
                placeholder="Ej: Bogotá, Chapinero o C.P. 110221" 
                value={locationInput}
                onChange={e => setLocationInput(e.target.value)}
                style={{ padding: '12px', width: '100%', borderRadius: '8px', border: '1px solid #ccc', outline: 'none', background: 'rgba(0,0,0,0.03)' }}
              />
              <button 
                className="btn-login" 
                style={{ width: '100%', marginTop: '15px', padding: '12px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)' }}
                onClick={handleGPSLocation}
              >
                📍 Usar mi ubicación actual por GPS
              </button>
              
              <button 
                className="btn-buy" 
                style={{ width: '100%', marginTop: '10px', padding: '12px' }}
                onClick={() => {
                  if (locationInput.trim()) {
                    localStorage.setItem('user_location', locationInput.trim());
                    setUserLocation(locationInput.trim());
                    setShowLocationModal(false);
                  }
                }}
              >
                Usar esta ubicación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE AUTENTICACION DE USUARIO */}
      {showAuthModal && (
        <div className="cart-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="cart-modal glass-panel" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>{authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
              <button className="btn-close" onClick={() => setShowAuthModal(false)}>✕</button>
            </div>
            
            {/* GOOGLE MOCK BUTTON */}
            <div style={{ marginBottom: '20px' }}>
              <button onClick={handleGoogleMockLogin} style={{ width: '100%', padding: '12px', background: 'white', border: '1px solid #ddd', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20C44 22.659 43.862 21.35 43.611 20.083z"/><path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-0.792 2.237-2.231 4.166-4.087 5.571c0.001-0.001 0.002-0.001 0.003-0.002l6.19 5.238C36.971 39.205 44 34 44 24C44 22.659 43.862 21.35 43.611 20.083z"/></svg>
                Continuar con Google
              </button>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div style={{ flex: 1, height: '1px', background: '#ddd' }}></div>
              <span style={{ color: '#999', fontSize: '0.9rem' }}>O con email</span>
              <div style={{ flex: 1, height: '1px', background: '#ddd' }}></div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button 
                onClick={() => { setAuthMode('login'); setAuthError(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: authMode === 'login' ? 'var(--accent)' : '#eee', color: authMode === 'login' ? '#fff' : '#333', cursor: 'pointer', fontWeight: 'bold' }}
              >Login</button>
              <button 
                onClick={() => { setAuthMode('register'); setAuthError(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: authMode === 'register' ? 'var(--accent)' : '#eee', color: authMode === 'register' ? '#fff' : '#333', cursor: 'pointer', fontWeight: 'bold' }}
              >Registro</button>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <input 
                type="text" 
                placeholder="Nombre de usuario" 
                value={authForm.username} 
                onChange={e => setAuthForm({...authForm, username: e.target.value})}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none' }}
                required 
              />
              <input 
                type="password" 
                placeholder="Contraseña" 
                value={authForm.password} 
                onChange={e => setAuthForm({...authForm, password: e.target.value})}
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ccc', outline: 'none' }}
                required 
              />
              <button type="submit" className="btn-buy" style={{ padding: '15px', marginTop: '10px' }}>
                {authMode === 'login' ? 'Entrar a la tienda' : 'Registrarme'}
              </button>
            </form>
            {authError && <div style={{ marginTop: '15px', textAlign: 'center', color: authError.includes('❌') ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{authError}</div>}
          </div>
        </div>
      )}

      {/* MODAL DEL CARRITO */}
      {isCartOpen && (
        <div className="cart-overlay" onClick={() => { setIsCartOpen(false); setIsCheckoutSuccess(false); }}>
          <div className="cart-modal glass-panel" onClick={e => e.stopPropagation()}>
            <div className="cart-header">
              <h2>Tu Carrito</h2>
              <button className="btn-close" onClick={() => { setIsCartOpen(false); setIsCheckoutSuccess(false); }}>✕</button>
            </div>
            
            <Confetti active={isCheckoutSuccess} particleCount={120} />
            {isCheckoutSuccess ? (
              <div className="cart-success-message">
                <div className="success-icon-wrapper">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5"></path></svg>
                </div>
                <h3>🎉 ¡Compra Exitosa, {currentUser}!</h3>
                <p>Tu pedido ha sido procesado y está en camino.</p>
                <p style={{ color: '#10b981', fontSize: '0.9rem', marginTop: '10px' }}>📧 Te hemos enviado un email con el recibo.</p>
                <RainbowButton onClick={() => { setIsCartOpen(false); setIsCheckoutSuccess(false); fetchProducts(); }} className="mt-5 !bg-transparent !text-white px-6 py-3 h-auto">
                  🛍️ Volver a la tienda
                </RainbowButton>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.length === 0 ? (
                    <div className="cart-empty">
                      <p>Tu carrito está vacío.</p>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={cart.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        {cart.map((item) => (
                          <SortableCartItem key={item.id} item={item} updateQuantity={updateQuantity} />
                        ))}
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="cart-footer">
                    <div className="cart-total">
                      <span>Total:</span>
                      <span>{cart.reduce((total, item) => total + (item.price * item.quantity), 0).toLocaleString('es-CO', {style: 'currency', currency: 'COP', minimumFractionDigits: 0})}</span>
                    </div>
                    <ShimmerButton
                      shimmerColor="rgba(255,255,255,0.3)"
                      shimmerDuration="4s"
                      borderRadius="0px"
                      background="var(--accent)"
                      className="btn-checkout"
                      onClick={handleCheckout}
                    >
                      {currentUser ? '✨ Finalizar Compra Segura' : '🔐 Iniciar Sesión para Comprar'}
                    </ShimmerButton>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Tooltip.Provider>
  );
}

export default Store;
