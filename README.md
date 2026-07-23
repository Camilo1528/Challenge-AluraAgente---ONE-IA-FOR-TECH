# 🚀 TechStore - Asistente Virtual 3D con RAG & ReAct (Challenge Alura Agente)

![Estado: Completado](https://img.shields.io/badge/Estado-Completado-success)
![Despliegue: En%20Vivo](https://img.shields.io/badge/Despliegue-En_Vivo-brightgreen)

## 🌐 Pruebas en Vivo (Live Demo)
Puedes probar el proyecto completamente funcional en la nube a través de los siguientes enlaces:
* 🛒 **TechStore Público (Ventas & Clientes):** [https://neon-hamster-4ebf49.netlify.app/](https://neon-hamster-4ebf49.netlify.app/)
* 🔒 **Dashboard Admin Corporativo:** [https://neon-hamster-4ebf49.netlify.app/admin/chat](https://neon-hamster-4ebf49.netlify.app/admin/chat)
  * **Usuario:** `admin`
  * **Contraseña:** `admin123`

*(Nota: Al estar hospedado el backend en Render gratuito, el primer mensaje puede tardar hasta ~50 segundos en responder mientras el contenedor "despierta" de su estado de hibernación).*

## 📸 Demostración Visual y Funcionalidad

> **Para el evaluador / visitante:** A continuación se evidencia el funcionamiento del proyecto y su robusta interfaz Premium.

### Interfaz del Store
*(Añade aquí una captura de pantalla de la página principal del Store con productos)*
![Store UI](./assets/demo_store.jpg) <!-- Reemplaza esto subiendo tu propia imagen a una carpeta assets/ -->

### Dashboard Privado Admin
*(Añade aquí una captura del Admin Chat realizando consultas sobre inventario)*
![Admin UI](./assets/demo_admin.jpg) <!-- Reemplaza esto subiendo tu propia imagen a una carpeta assets/ -->

### 🎥 Video Demostrativo
En el siguiente video se puede evidenciar el funcionamiento completo:
- Cambio de ventanas (Store a Admin).
- El Assistant IA consultando productos de SQLite.
- El RAG trayendo documentos privados para el Admin.

<video src="https://github.com/Camilo1528/Challenge-AluraAgente---ONE-IA-FOR-TECH/raw/main/assets/challenge_demo.mp4" controls="controls" muted="muted" style="max-height:640px;">
  Tu navegador no soporta el tag de video.
</video>

---

¡Bienvenido al repositorio oficial de **TechStore**! Este proyecto es una solución hiper-escalable y de calidad Enterprise para el "Challenge Alura Agente". Implementa un Asistente Virtual Inteligente dual (Atención a Clientes y Panel de Administrador) potenciado por Inteligencia Artificial Generativa.

El proyecto está diseñado bajo una arquitectura de microservicios separando el **Backend (FastAPI + LangChain)** y el **Frontend (React + Three.js + MagicUI)**, asegurando un diseño premium, una respuesta ultrarrápida y un robusto aislamiento de datos corporativos.

## 🌟 Características Principales

*   **Arquitectura RAG (Retrieval-Augmented Generation) Multiformato:** El motor procesa e indexa documentos empresariales de manera simultánea en 7 formatos distintos (`.pdf`, `.json`, `.csv`, `.docx`, `.txt`, `.xlsx`, `.md`) desde la carpeta de datos corporativos (`/backend/data`), previniendo alucinaciones y asegurando que las respuestas se basen exclusivamente en las reglas internas.
*   **Enrutamiento Inteligente (ReAct vs Simple RAG):** El sistema utiliza un pipeline RAG simple ultrarrápido para preguntas generales, y delega consultas complejas o que requieran uso de herramientas a un agente **ReAct (Reasoning and Acting)**.
*   **Prompt Routing Dual (Cliente vs Admin):** 
    *   **Chat Público (Tienda):** Entrenado para ser un vendedor estrella, sugerir productos, generar tarjetas de producto (Product Cards visuales) e impulsar ventas.
    *   **Chat Privado (Admin):** Entrenado con un tono corporativo y estricto, capaz de consultar finanzas, recursos humanos e inventarios internos sin revelar secretos comerciales a usuarios no autorizados.
*   **Interfaz Premium Glassmorphism & 3D:** El Frontend utiliza **Three.js** para modelos espaciales dinámicos y librerías como **Framer Motion** y **MagicUI** para proveer una experiencia visual "WOW" con micro-animaciones, destellos espaciales y tarjetas holográficas.
*   **Gestión Segura de Estado & Auto-Seeding en la Nube:** Las sesiones y los productos de la tienda de eCommerce se administran vía SQLite. El backend está optimizado para entornos de servidores efímeros (como Render.com) ya que auto-inicializa y puebla la base de datos dinámica y automáticamente en cada arranque.

## 🏗 Arquitectura de la Solución

El sistema emplea un flujo de datos asíncrono y desacoplado, listo para Producción:

1.  **Ingesta Vectorial en Memoria:** Un script inteligente carga los archivos corporativos, los divide con `RecursiveCharacterTextSplitter`, y los indexa en **ChromaDB en Memoria RAM** (optimizando espacio y velocidad) usando Embeddings de Google Generative AI (modelo `text-embedding-004`).
2.  **API RESTful en la Nube (Render):** `FastAPI` maneja las solicitudes asíncronamente en un contenedor de Render. Sanitiza los inputs contra inyecciones y valida la estructura RAG antes de pasarlo al LLM principal ultrarrápido (vía Groq API).
3.  **Frontend Serverless (Netlify):** Aplicación de `React` servida globalmente desde la CDN de Netlify. Consume los endpoints del backend en vivo a través de CORS de manera segura, renderizando componentes interactivos en vez de solo texto.

## 💻 Tecnologías y Herramientas

### Backend (Cerebro IA)
*   **Python 3.10+** (FastAPI, Uvicorn)
*   **LangChain** (Agentes, Prompts, Tools, Retrievers, TextLoaders)
*   **Bases de Datos Vectoriales:** ChromaDB (In-Memory)
*   **Modelos LLM:** LLaMA 3 / Mixtral (vía Groq API) y Google Gemini 1.5 Embeddings.
*   **Base de Datos Relacional:** SQLite3

### Frontend (Interfaz Gráfica)
*   **React 18** (Vite, Hooks, Context API, React Router)
*   **CSS Vanilla & Tailwind CSS** (Estilos y variables de diseño)
*   **Three.js / React Three Fiber** (Gráficos interactivos 3D en WebGL)
*   **Framer Motion & MagicUI** (Animaciones cinéticas y diseño holográfico)

## ⚙️ Instrucciones de Ejecución Local

Si deseas probar el entorno de desarrollo en tu propia máquina:

### 1. Iniciar el Backend (Servidor Python)
Abre una terminal y dirígete al backend:
```bash
cd backend
python -m venv venv

# En Mac/Linux:
source venv/bin/activate
# En Windows:
venv\Scripts\activate

pip install -r requirements.txt
```
**Configura tu entorno:** Renombra el archivo `.env.example` a `.env` y añade tus variables:
*   `GROQ_API_KEY`: Tu clave de Groq (para el motor de texto)
*   `GOOGLE_API_KEY`: Tu clave de Google AI Studio (para embeddings, modelo `text-embedding-004`)

Arranca la API local:
```bash
uvicorn api:app --reload
```
*El servidor correrá en `http://localhost:8000` y auto-creará los productos en SQLite al iniciar.*

### 2. Iniciar el Frontend (Aplicación Web React)
Abre otra terminal en la carpeta frontend:
```bash
cd frontend
npm install
npm run dev
```
*El sitio estará disponible en `http://localhost:5173`. Para que se conecte localmente en vez de ir al backend en producción de Render, debes cambiar temporalmente la variable `API_URL` en los archivos `.jsx`.*

## ☁️ Despliegue en la Nube (Producción)
Este proyecto está preparado para hacer un despliegue CI/CD automático:
- **Backend**: Despliegue usando el archivo `render.yaml` como "Web Service" en **Render**.
- **Frontend**: Vincula la carpeta `frontend/` en **Netlify** o Vercel (`npm run build`).

---
*Desarrollado y pulido por Camilo para el Challenge AluraAgente de Alura Latam y Oracle ONE.*
