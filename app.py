import os
import uvicorn
import sys

# Añadir la carpeta backend al path para que pueda encontrar los módulos
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# Importar la app de FastAPI desde tu archivo api.py
from backend.api import app

if __name__ == "__main__":
    # Hugging Face Spaces requiere que la aplicación escuche en el puerto 7860
    uvicorn.run(app, host="0.0.0.0", port=7860)
