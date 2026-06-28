import pandas as pd
from reportlab.pdfgen import canvas
import os

# Asegurar que el directorio exista
os.makedirs("data", exist_ok=True)

# 1. Crear Excel (.xlsx) con Pandas
data_excel = {
    "Producto": ["Laptop Pro X", "Teclado Mecánico RGB", "Monitor 4K Ultrasharp", "Mouse Inalámbrico Ergonómico"],
    "Categoria": ["Computadoras", "Periféricos", "Monitores", "Periféricos"],
    "Stock": [15, 45, 8, 120],
    "Precio_USD": [1299.99, 89.50, 499.00, 45.00]
}
df = pd.DataFrame(data_excel)
df.to_excel("data/inventario.xlsx", index=False)
print("Archivo Excel 'inventario.xlsx' creado con éxito.")

# 2. Crear PDF (.pdf) con ReportLab
pdf_path = "data/reglamento_seguridad.pdf"
c = canvas.Canvas(pdf_path)
c.setFont("Helvetica-Bold", 16)
c.drawString(100, 800, "Reglamento de Seguridad y Salud Ocupacional")

c.setFont("Helvetica", 12)
text = [
    "1. Uso Obligatorio de Equipo:",
    "   Todo el personal de almacén debe usar botas de seguridad, chaleco ",
    "   reflectante y guantes de protección en todo momento.",
    "",
    "2. Reporte de Incidentes:",
    "   Cualquier accidente o incidente debe ser reportado inmediatamente ",
    "   al supervisor de turno, sin importar su gravedad.",
    "",
    "3. Rutas de Evacuación:",
    "   Las rutas de evacuación deben permanecer completamente libres ",
    "   de cajas, carritos o cualquier otro obstáculo.",
    "",
    "4. Horarios de Descanso:",
    "   Por cada 4 horas de labor física continua, el colaborador tiene ",
    "   derecho a 15 minutos de descanso activo."
]

y_position = 750
for line in text:
    c.drawString(100, y_position, line)
    y_position -= 20

c.save()
print("Archivo PDF 'reglamento_seguridad.pdf' creado con éxito.")
