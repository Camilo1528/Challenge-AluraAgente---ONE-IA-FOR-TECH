# Challenge Alura Agente - TechStore Asistente Virtual 🤖 (Arquitectura React + Python)

Este repositorio contiene la solución al "Challenge Alura Agente", el cual consiste en desarrollar un asistente virtual inteligente basado en una arquitectura RAG (Retrieval-Augmented Generation).

## Descripción General del Proyecto
El proyecto implementa un asistente de Inteligencia Artificial para una tienda en línea ficticia llamada "TechStore". El agente está diseñado para responder preguntas de los clientes. 
Para asegurar un diseño moderno y escalable, el proyecto se divide en dos capas:
- **Backend:** Una API REST en Python con FastAPI y LangChain.
- **Frontend:** Una aplicación web en React construida con Vite.

El asistente lee esta información desde un archivo de conocimiento estructurado (`knowledge_base.csv`), previniendo alucinaciones y asegurando que las respuestas se basen exclusivamente en las reglas de la tienda.

## Arquitectura de la Solución
El sistema utiliza una arquitectura RAG clásica cliente-servidor, diseñada para el ámbito corporativo:
1. **Extracción Multiformato (Backend):** El sistema escanea la carpeta `data/` y utiliza cargadores de LangChain específicos (CSVLoader, PyPDFLoader, TextLoader, BSHTMLLoader, etc.) para procesar múltiples tipos de archivos de la empresa (`.pdf`, `.md`, `.csv`, `.docx`, `.html`, `.json`) simultáneamente.
2. **Indexación Vectorial (Embeddings):** Los textos extraídos se dividen en fragmentos y se convierten en vectores utilizando `GoogleGenerativeAIEmbeddings`. Estos se almacenan en una base de datos vectorial local con **ChromaDB**.
3. **Generación con Memoria (Backend):** El agente usa `create_history_aware_retriever` para mantener el contexto de la charla. Recupera fragmentos de diversos documentos y envía la pregunta al LLM (`gemini-1.5-flash`) a través de un prompt corporativo estricto.
4. **Interfaz de Usuario (Frontend):** Una aplicación interactiva construida con **React, Vite y Node.js** se comunica con el servidor Python a través del endpoint `/chat`, mostrando un diseño Glassmorphism premium.

## Tecnologías y Herramientas Utilizadas
- **Backend:** Python 3.10+, FastAPI, Uvicorn, LangChain, Google Gemini API, ChromaDB, PyPDF.
- **Frontend:** Node.js, React, Vite, CSS Vanilla.

## Instrucciones para Ejecutar el Proyecto (Localmente)

Dado que es una arquitectura separada, debes abrir **dos terminales**.

### 1. Iniciar el Backend (Servidor Python)
Abre la primera terminal en la raíz del proyecto (`challenge-alura-agente`), entra a la carpeta backend y ejecuta:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # En Windows: venv\Scripts\activate
pip install -r requirements.txt
```
Configura tu clave API:
- Renombra el archivo `.env.example` a `.env` y pega tu clave API de Google Gemini en la variable `GOOGLE_API_KEY`.

Ejecuta el servidor:
```bash
uvicorn api:app --reload
```
*El servidor estará corriendo en `http://localhost:8000`*.

### 2. Iniciar el Frontend (Aplicación React)
Abre una segunda terminal en la carpeta `frontend`:
```bash
cd frontend
npm install
npm run dev
```
*La aplicación web se abrirá en tu navegador (por defecto en `http://localhost:5173`). ¡Empieza a chatear!*

---
*Desarrollado para el Challenge AluraAgente de Alura Latam y Oracle.*
