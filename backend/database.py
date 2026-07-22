import sqlite3
import os
import logging
from datetime import datetime, timezone as dt_timezone, timedelta

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("techstore-db")

DB_PATH = os.getenv("DB_PATH", "chat_history.db")
DATA_RETENTION_DAYS = int(os.getenv("DATA_RETENTION_DAYS", "90"))  # Retención de 90 días


def _get_conn():
    """Obtiene una conexión con row_factory para diccionarios."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # Mejor rendimiento en lecturas concurrentes
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA secure_delete=ON")  # 2026 - Secure delete
    return conn


def init_db():
    """Inicializa la base de datos con todas las tablas necesarias."""
    with _get_conn() as conn:
        cursor = conn.cursor()

        # --- CHAT HISTORY ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)')

        # --- PRODUCTS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                originalPrice REAL,
                discount INTEGER,
                category TEXT NOT NULL,
                image TEXT NOT NULL,
                shipping TEXT NOT NULL,
                stock INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)')

        # --- ADMIN CONFIG ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admin_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # --- USERS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')

        # --- ORDERS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                total REAL NOT NULL,
                status TEXT DEFAULT 'Pendiente',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)')

        # --- ORDER ITEMS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                price REAL NOT NULL,
                FOREIGN KEY(order_id) REFERENCES orders(id),
                FOREIGN KEY(product_id) REFERENCES products(id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)')

        # --- REVIEWS ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                rating INTEGER NOT NULL,
                comment TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(product_id) REFERENCES products(id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id)')

        # --- AUDIT LOG (2026 - OWASP Logging) ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                username TEXT DEFAULT 'anonymous',
                details TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_log(event)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_audit_username ON audit_log(username)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(created_at)')

        conn.commit()

    # Aplicar política de retención al iniciar
    apply_retention_policy()


# ============================================
# POLÍTICA DE RETENCIÓN DE DATOS (2026)
# ============================================

def apply_retention_policy():
    """Elimina datos antiguos según la política de retención."""
    cutoff_date = datetime.now(dt_timezone.utc) - timedelta(days=DATA_RETENTION_DAYS)
    cutoff_str = cutoff_date.strftime("%Y-%m-%d %H:%M:%S")

    with _get_conn() as conn:
        # Eliminar mensajes antiguos
        deleted_messages = conn.execute(
            'DELETE FROM messages WHERE timestamp < ?', (cutoff_str,)
        ).rowcount

        # Eliminar logs de auditoría antiguos
        deleted_audit = conn.execute(
            'DELETE FROM audit_log WHERE created_at < ?', (cutoff_str,)
        ).rowcount

        conn.commit()

        if deleted_messages > 0 or deleted_audit > 0:
            logger.info(
                f"Política de retención aplicada: {deleted_messages} mensajes, "
                f"{deleted_audit} logs de auditoría eliminados (anteriores a {DATA_RETENTION_DAYS} días)"
            )


# ============================================
# AUDIT LOG
# ============================================

def log_audit_event(event: str, username: str = "anonymous", details: str = ""):
    """Registra un evento de auditoría."""
    try:
        with _get_conn() as conn:
            conn.execute(
                'INSERT INTO audit_log (event, username, details) VALUES (?, ?, ?)',
                (event, username, details[:500])  # Limitar detalles a 500 chars
            )
            conn.commit()
    except Exception as e:
        logger.error(f"Error registrando auditoría: {e}")


def get_audit_logs(limit: int = 100):
    """Obtiene los registros de auditoría más recientes."""
    with _get_conn() as conn:
        cursor = conn.execute(
            'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', (limit,)
        )
        return [dict(row) for row in cursor.fetchall()]


# ============================================
# CHAT HISTORY
# ============================================

def save_message(session_id: str, role: str, content: str):
    """Guarda un mensaje en la base de datos."""
    with _get_conn() as conn:
        conn.execute(
            'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
            (session_id, role, content[:5000])  # Limitar contenido a 5000 chars
        )
        conn.commit()


def get_chat_history(session_id: str):
    """Recupera el historial completo de un session_id específico."""
    with _get_conn() as conn:
        cursor = conn.execute(
            'SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC',
            (session_id,)
        )
        return [{"role": row["role"], "content": row["content"]} for row in cursor.fetchall()]


def delete_chat_session(session_id: str):
    """Elimina todo el historial de una sesión de chat."""
    with _get_conn() as conn:
        conn.execute('DELETE FROM messages WHERE session_id = ?', (session_id,))
        conn.commit()


def delete_old_messages(days: int = DATA_RETENTION_DAYS):
    """Elimina mensajes más antiguos que el número de días especificado."""
    cutoff = (datetime.now(dt_timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    with _get_conn() as conn:
        conn.execute('DELETE FROM messages WHERE timestamp < ?', (cutoff,))
        conn.commit()


# ============================================
# PRODUCTOS (INVENTARIO)
# ============================================

def get_all_products():
    """Obtiene todos los productos."""
    with _get_conn() as conn:
        cursor = conn.execute('SELECT * FROM products ORDER BY id ASC')
        return [dict(row) for row in cursor.fetchall()]


def get_product_by_id(product_id: int):
    """Obtiene un producto por su ID."""
    with _get_conn() as conn:
        cursor = conn.execute('SELECT * FROM products WHERE id = ?', (product_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def add_product(product: dict):
    """Agrega un nuevo producto."""
    with _get_conn() as conn:
        cursor = conn.execute('''
            INSERT INTO products (name, price, originalPrice, discount, category, image, shipping, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            product['name'], product['price'], product.get('originalPrice'),
            product.get('discount'), product['category'], product['image'],
            product['shipping'], product.get('stock', 0)
        ))
        conn.commit()
        return cursor.lastrowid


def update_product_stock(product_id: int, new_stock: int):
    """Actualiza el stock de un producto."""
    with _get_conn() as conn:
        conn.execute(
            'UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (new_stock, product_id)
        )
        conn.commit()


def update_product(product_id: int, product_data: dict):
    """Actualiza un producto completo."""
    with _get_conn() as conn:
        conn.execute('''
            UPDATE products SET name = ?, price = ?, originalPrice = ?, discount = ?,
            category = ?, image = ?, shipping = ?, stock = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (
            product_data['name'], product_data['price'], product_data.get('originalPrice'),
            product_data.get('discount'), product_data['category'], product_data['image'],
            product_data['shipping'], product_data.get('stock', 0), product_id
        ))
        conn.commit()


def delete_product(product_id: int):
    """Elimina un producto."""
    with _get_conn() as conn:
        conn.execute('DELETE FROM products WHERE id = ?', (product_id,))
        conn.commit()


# ============================================
# ADMIN CONFIGURATION
# ============================================

def get_admin_credentials():
    """Obtiene las credenciales del administrador."""
    with _get_conn() as conn:
        cursor = conn.execute('SELECT username, password_hash FROM admin_config WHERE id = 1')
        row = cursor.fetchone()
        if row:
            return {"username": row["username"], "password_hash": row["password_hash"]}
        return None


def set_admin_credentials(username: str, password_hash: str):
    """Establece o actualiza las credenciales del administrador."""
    with _get_conn() as conn:
        count = conn.execute(
            'SELECT COUNT(*) as cnt FROM admin_config WHERE id = 1'
        ).fetchone()["cnt"]
        if count == 0:
            conn.execute(
                'INSERT INTO admin_config (id, username, password_hash) VALUES (1, ?, ?)',
                (username, password_hash)
            )
        else:
            conn.execute(
                'UPDATE admin_config SET username = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
                (username, password_hash)
            )
        conn.commit()


# ============================================
# USERS (CLIENTS)
# ============================================

def create_user(username: str, password_hash: str):
    """Crea un nuevo usuario."""
    try:
        with _get_conn() as conn:
            conn.execute(
                'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                (username, password_hash)
            )
            conn.commit()
            return True
    except sqlite3.IntegrityError:
        return False


def get_user_by_username(username: str):
    """Obtiene un usuario por su nombre de usuario."""
    with _get_conn() as conn:
        cursor = conn.execute('SELECT * FROM users WHERE username = ?', (username,))
        row = cursor.fetchone()
        return dict(row) if row else None


def update_last_login(user_id: int):
    """Actualiza la fecha del último login."""
    with _get_conn() as conn:
        conn.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            (user_id,)
        )
        conn.commit()


# ============================================
# ORDERS
# ============================================

def create_order(user_id: int, total: float, items: list):
    """Crea una nueva orden con sus items."""
    with _get_conn() as conn:
        cursor = conn.execute(
            'INSERT INTO orders (user_id, total) VALUES (?, ?)',
            (user_id, total)
        )
        order_id = cursor.lastrowid

        for item in items:
            conn.execute(
                'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
                (order_id, item['product_id'], item['quantity'], item['price'])
            )

        conn.commit()
        return order_id


def get_orders_by_user(user_id: int):
    """Obtiene todas las órdenes de un usuario."""
    with _get_conn() as conn:
        cursor = conn.execute(
            'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
            (user_id,)
        )
        orders = [dict(row) for row in cursor.fetchall()]

        for order in orders:
            item_cursor = conn.execute('''
                SELECT oi.*, p.name, p.image FROM order_items oi
                JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id = ?
            ''', (order['id'],))
            order['items'] = [dict(item) for item in item_cursor.fetchall()]

        return orders


def get_all_orders():
    """Obtiene todas las órdenes (admin)."""
    with _get_conn() as conn:
        cursor = conn.execute('''
            SELECT o.*, u.username FROM orders o
            JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
        ''')
        return [dict(row) for row in cursor.fetchall()]


def update_order_status(order_id: int, status: str):
    """Actualiza el estado de una orden."""
    with _get_conn() as conn:
        conn.execute(
            'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (status, order_id)
        )
        conn.commit()


# ============================================
# REVIEWS
# ============================================

def create_review(product_id: int, user_id: int, rating: int, comment: str):
    """Crea una reseña para un producto."""
    with _get_conn() as conn:
        conn.execute(
            'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
            (product_id, user_id, rating, comment[:1000])  # Limitar comentario
        )
        conn.commit()


def get_reviews_by_product(product_id: int):
    """Obtiene todas las reseñas de un producto."""
    with _get_conn() as conn:
        cursor = conn.execute('''
            SELECT r.*, u.username FROM reviews r
            JOIN users u ON r.user_id = u.id
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
        ''', (product_id,))
        return [dict(row) for row in cursor.fetchall()]
