#!/usr/bin/env python
"""
Seed script: Puebla la base de datos con productos reales
y las rutas correctas de imágenes (frontend/public/images/)
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "chat_history.db")

PRODUCTS = [
    {
        "name": "Laptop Pro 15\"",
        "price": 2499000,
        "originalPrice": 3299000,
        "discount": 24,
        "category": "Laptops",
        "image": "images/laptop_pro_1782767291645.png",
        "shipping": "Envío gratis",
        "stock": 15
    },
    {
        "name": "Smartphone Z Ultra",
        "price": 1899000,
        "originalPrice": 2499000,
        "discount": 24,
        "category": "Smartphones",
        "image": "images/smartphone_z_1782767299312.png",
        "shipping": "Envío gratis",
        "stock": 25
    },
    {
        "name": "Audífonos ANC Pro",
        "price": 349000,
        "originalPrice": 499000,
        "discount": 30,
        "category": "Audífonos",
        "image": "images/headphones_anc_1782767308266.png",
        "shipping": "Envío gratis",
        "stock": 40
    },
    {
        "name": "Smartwatch Sport X",
        "price": 599000,
        "originalPrice": 799000,
        "discount": 25,
        "category": "Smartwatches",
        "image": "images/smartwatch_sport_1782767319006.png",
        "shipping": "Envío gratis",
        "stock": 20
    },
    {
        "name": "Monitor Curved 27\"",
        "price": 1299000,
        "originalPrice": 1699000,
        "discount": 23,
        "category": "Monitores",
        "image": "images/monitor_curved_1782767330537.png",
        "shipping": "Envío gratis",
        "stock": 12
    },
    {
        "name": "Teclado Mecánico RGB",
        "price": 189000,
        "originalPrice": 289000,
        "discount": 34,
        "category": "Teclados",
        "image": "images/keyboard_rgb_1782767340966.png",
        "shipping": "Envío gratis",
        "stock": 35
    },
    {
        "name": "Mouse Ergonómico",
        "price": 149000,
        "originalPrice": 199000,
        "discount": 25,
        "category": "Mouses",
        "image": "images/mouse_ergo_1782767350326.png",
        "shipping": "Envío gratis",
        "stock": 50
    },
    {
        "name": "Tablet Pro 11\"",
        "price": 1799000,
        "originalPrice": 2299000,
        "discount": 21,
        "category": "Tablets",
        "image": "images/tablet_pro_1782767358547.png",
        "shipping": "Envío gratis",
        "stock": 18
    },
    {
        "name": "Smart Speaker AI",
        "price": 249000,
        "originalPrice": 349000,
        "discount": 28,
        "category": "Audio",
        "image": "images/smart_speaker_1782767389339.png",
        "shipping": "Envío gratis",
        "stock": 30
    },
    {
        "name": "Drone 4K Camera",
        "price": 899000,
        "originalPrice": 1299000,
        "discount": 30,
        "category": "Cámaras",
        "image": "images/drone_4k_1782767398887.png",
        "shipping": "Envío gratis",
        "stock": 8
    },
    {
        "name": "Consola NextGen",
        "price": 2999000,
        "originalPrice": 3999000,
        "discount": 25,
        "category": "Videojuegos",
        "image": "images/console_nextgen_1782767408794.png",
        "shipping": "Envío gratis",
        "stock": 10
    },
    {
        "name": "VR Headset Pro",
        "price": 699000,
        "originalPrice": 999000,
        "discount": 30,
        "category": "Videojuegos",
        "image": "images/vr_headset_1782767419832.png",
        "shipping": "Envío gratis",
        "stock": 6
    }
]


def seed():
    if not os.path.exists(DB_PATH):
        print(f"❌ Base de datos no encontrada en: {DB_PATH}")
        print("   Inicia primero el backend para que se cree la DB.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Limpiar productos existentes
    cursor.execute("DELETE FROM products")
    # Resetear auto-increment
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='products'")
    print("> Productos anteriores eliminados.")

    # Insertar nuevos productos
    for p in PRODUCTS:
        cursor.execute('''
            INSERT INTO products (name, price, originalPrice, discount, category, image, shipping, stock)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            p["name"], p["price"], p["originalPrice"], p["discount"],
            p["category"], p["image"], p["shipping"], p["stock"]
        ))
        print(f"  + {p['name']} - ${p['price']:,} - {p['image']}")

    conn.commit()
    conn.close()
    print(f"\n== {len(PRODUCTS)} productos insertados correctamente.")
    print("Las imagenes se sirven desde: http://localhost:5173/images/...")


if __name__ == "__main__":
    seed()
