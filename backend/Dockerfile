# ============================================
# TechStore Backend 2026 - Docker Seguro
# ============================================
FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema (solo las necesarias)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copiar e instalar dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código fuente
COPY . .

# Crear directorios necesarios
RUN mkdir -p data logs static/products chroma_db

# Crear usuario no-root para seguridad
RUN groupadd -r techstore && useradd -r -g techstore -d /app -s /sbin/nologin techstore && \
    chown -R techstore:techstore /app
USER techstore

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Exponer puerto
EXPOSE 8000

# Comando de inicio con Workers para producción
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--limit-concurrency", "100"]
