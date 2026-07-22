# 🚀 TechStore - Asistente Virtual 3D con RAG & ReAct (Challenge Alura Agente)

¡Bienvenido al repositorio oficial de **TechStore**! Este proyecto es una solución hiper-escalable y de calidad Enterprise para el "Challenge Alura Agente". Implementa un Asistente Virtual Inteligente dual (Atención a Clientes y Panel de Administrador) potenciado por Inteligencia Artificial Generativa.

El proyecto está diseñado bajo una arquitectura de microservicios separando el **Backend (FastAPI + LangChain)** y el **Frontend (React + Three.js + MagicUI)**, asegurando un diseño premium, una respuesta ultrarrápida y un robusto aislamiento de datos corporativos.

## 🌟 Características Principales

*   **Arquitectura RAG (Retrieval-Augmented Generation) Multiformato:** El motor procesa e indexa documentos empresariales de manera simultánea en 7 formatos distintos (`.pdf`, `.json`, `.csv`, `.docx`, `.txt`, `.xlsx`, `.md`) desde la carpeta de datos corporativos (`/backend/data`), previniendo alucinaciones y asegurando que las respuestas se basen exclusivamente en las reglas internas.
*   **Enrutamiento Inteligente (ReAct vs Simple RAG):** El sistema utiliza un pipeline RAG simple ultrarrápido para preguntas generales, y delega consultas complejas o que requieran uso de herramientas a un agente **ReAct (Reasoning and Acting)**.
*   **Prompt Routing Dual (Cliente vs Admin):** 
    *   **Chat Público (Tienda):** Entrenado para ser un vendedor estrella, sugerir productos, generar tarjetas de producto (Product Cards visuales) e impulsar ventas.
    *   **Chat Privado (Admin):** Entrenado con un tono corporativo y estricto, capaz de consultar finanzas, recursos humanos e inventarios internos sin revelar secretos comerciales a usuarios no autorizados.
*   **Interfaz Premium Glassmorphism & 3D:** El Frontend utiliza **Three.js** para modelos espaciales dinámicos y librerías como **Framer Motion** y **MagicUI** para proveer una experiencia visual "WOW" con micro-animaciones, destellos espaciales y tarjetas holográficas.
*   **Gestión Segura de Estado:** Las sesiones se administran vía SQLite de manera local, manteniendo un historial contextual completo (Memory Buffer) para que el asistente recuerde el hilo de la conversación.

## 🏗 Arquitectura de la Solución

El sistema emplea un flujo de datos asíncrono y desacoplado:

1.  **Ingesta Vectorial:** Un script lee los archivos de RRHH, Finanzas e Inventario, extrae su texto usando cargadores nativos de LangChain, los divide con `RecursiveCharacterTextSplitter`, y los indexa en **ChromaDB** usando Embeddings de Google Generative AI.
2.  **API RESTful:** `FastAPI` maneja las solicitudes del cliente de forma asíncrona, sanitizando los inputs para prevenir inyecciones y validando la estructura RAG antes de interactuar con el LLM (`Groq` o `Gemini`).
3.  **Frontend Cliente:** `React` renderiza la UI usando `Vite`. Consume el endpoint `/chat` pasándole el `session_id`, interpretando las *Product Cards* que envía el backend para dibujar tarjetas interactivas de compras en lugar de texto plano.

## 💻 Tecnologías y Herramientas

### Backend (Cerebro IA)
*   **Python 3.10+** (FastAPI, Uvicorn)
*   **LangChain** (Agentes, Prompts, Tools, Retrievers, TextLoaders)
*   **Bases de Datos Vectoriales:** ChromaDB
*   **Modelos LLM:** LLaMA 3 / Mixtral (vía Groq API) y Google Gemini 1.5.
*   **Bases de Datos Relacionales:** SQLite3 (Para historiales y metadata de eCommerce).

### Frontend (Interfaz Gráfica)
*   **React 18** (Vite, Hooks, Context API)
*   **CSS Vanilla & Tailwind CSS** (Estilos y variables de diseño)
*   **Three.js / React Three Fiber** (Gráficos interactivos 3D en WebGL)
*   **Framer Motion & MagicUI** (Animaciones cinéticas y diseño premium holográfico)

## ⚙️ Instrucciones de Ejecución Local

Este repositorio está dividido en dos partes. Necesitas abrir dos terminales para correr ambos entornos de forma simultánea.

### 1. Iniciar el Backend (Servidor Python)
Abre la primera terminal y dirígete al backend:
```bash
cd backend
python -m venv venv

# En Mac/Linux:
source venv/bin/activate
# En Windows:
venv\Scripts\activate

pip install -r requirements.txt
```
**Configura tu entorno:** Renombra el archivo `.env.example` a `.env` y pega tus claves API (GROQ_API_KEY o GOOGLE_API_KEY).

Arranca la API:
```bash
uvicorn api:app --reload
```
*El servidor correrá en `http://localhost:8000`.*

### 2. Iniciar el Frontend (Aplicación Web React)
Abre una segunda terminal en la carpeta frontend:
```bash
cd frontend
npm install
npm run dev
```
*El sitio estará disponible en `http://localhost:5173`.*

> **Tip para Testing:** En la página principal del Frontend encontrarás dos botones. Uno te lleva al **Store Chat** (versión pública/ventas) y el otro al **Admin Dashboard** (versión corporativa). Cada interfaz le inyecta una semilla distinta al Backend para cambiar el comportamiento y permisos de la Inteligencia Artificial.

---
*Desarrollado y pulido por Camilo para el Challenge AluraAgente de Alura Latam y Oracle ONE.*
