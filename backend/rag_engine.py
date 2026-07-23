import os
import sys
import random
import threading
import atexit
import hashlib
import json
import re
import logging
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timezone as dt_timezone

# Fix Windows console encoding
if sys.stdout.encoding != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1)

from langchain_community.document_loaders.csv_loader import CSVLoader
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader, BSHTMLLoader
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from langgraph.prebuilt import create_react_agent
from langchain_core.tools import tool

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# ============================================
# LOGGING
# ============================================
logger = logging.getLogger("techstore-rag")

# ============================================
# CONSTANTES DE SEGURIDAD (2026)
# ============================================
SENSITIVE_PATTERNS = [
    r'\b[A-Za-z0-9_]{20,}\b',           # API keys / tokens largos
    r'\b(?:\d{4}[-\s]?){3}\d{4}\b',      # Números de tarjeta
    r'\b(?:password|secret|token|apikey|api_key)\s*[=:]\s*\S+\b',  # Credenciales en texto
]
MAX_CHUNK_SIZE = 1500
CHUNK_OVERLAP = 200
RETRIEVAL_K = 15


# ============================================
# DOCUMENT INTEGRITY (SHA-256 HASHING)
# ============================================

class DocumentIntegrity:
    """Maneja la integridad de documentos mediante hashing SHA-256."""

    def __init__(self, integrity_file: str = "data/.integrity.json"):
        self.integrity_file = integrity_file
        self.hashes: Dict[str, str] = {}
        self._load()

    def _load(self):
        """Carga el registro de hashes desde disco."""
        if os.path.exists(self.integrity_file):
            try:
                with open(self.integrity_file, 'r', encoding='utf-8') as f:
                    self.hashes = json.load(f)
            except Exception as e:
                logger.warning(f"Error cargando registro de integridad: {e}")
                self.hashes = {}

    def _save(self):
        """Guarda el registro de hashes en disco."""
        os.makedirs(os.path.dirname(self.integrity_file), exist_ok=True)
        try:
            with open(self.integrity_file, 'w', encoding='utf-8') as f:
                json.dump(self.hashes, f, indent=2)
        except Exception as e:
            logger.error(f"Error guardando registro de integridad: {e}")

    def compute_hash(self, filepath: str) -> str:
        """Calcula hash SHA-256 de un archivo."""
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def register_file(self, filepath: str) -> str:
        """Registra un archivo y retorna su hash."""
        file_hash = self.compute_hash(filepath)
        rel_path = os.path.relpath(filepath)
        self.hashes[rel_path] = file_hash
        self._save()
        return file_hash

    def verify_file(self, filepath: str) -> bool:
        """Verifica que el hash de un archivo coincida con el registrado."""
        rel_path = os.path.relpath(filepath)
        if rel_path not in self.hashes:
            logger.warning(f"Archivo no registrado en integridad: {rel_path}")
            return False
        current_hash = self.compute_hash(filepath)
        stored_hash = self.hashes[rel_path]
        return current_hash == stored_hash

    def get_all_hashes(self) -> Dict[str, str]:
        """Retorna todos los hashes registrados."""
        return dict(self.hashes)


# ============================================
# CONTENT FILTER (Document Ingestion Security)
# ============================================

class ContentFilter:
    """Filtra contenido malicioso durante la ingesta de documentos."""

    MALICIOUS_PATTERNS = [
        r'\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directions|commands)\b',
        r'\bforget\s+(all\s+)?(previous|prior|above)\b',
        r'\byou\s+are\s+(now|not)\s+.*(assistant|chatbot|ai)\b',
        r'\bact\s+as\s+(if\s+)?you\s+are\b',
        r'(?:import\s+os|subprocess|eval\s*\(|exec\s*\()',
        r'(?:rm\s+-rf|format\s+|del\s+/f)',
        r'\b(?:BEGIN\s+(RSA|DSA|EC|PGP)\s+PRIVATE\s+KEY)\b',
    ]

    @classmethod
    def scan_document_content(cls, content: str, source: str = "unknown") -> bool:
        for pattern in cls.MALICIOUS_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                logger.warning(
                    f"[WARN] Contenido sospechoso detectado en {source}: "
                    f"patron '{pattern[:40]}...'"
                )
                return False
        return True

    @classmethod
    def sanitize_content(cls, content: str) -> str:
        sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', content)
        return sanitized


# ============================================
# OUTPUT VALIDATOR (LLM Response Safety)
# ============================================

class OutputValidator:
    """Valida y filtra la salida del LLM."""

    FORBIDDEN_OUTPUT_PATTERNS = [
        r'(?:system\s+)?prompt\s+(?:is|contains|says)',
        r'you\s+(?:are|were)\s+(?:told|instructed|programmed)',
        r'instructions?\s+(?:were|are|given)',
        r'<script[^>]*>.*?</script>',
        r'javascript\s*:\s*',
        r'on\w+\s*=\s*',
    ]

    @classmethod
    def validate(cls, content: str) -> bool:
        for pattern in cls.FORBIDDEN_OUTPUT_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                logger.warning(f"Output validation: patron prohibido detectado: {pattern[:40]}...")
                return False
        return True

    @classmethod
    def sanitize(cls, content: str) -> str:
        content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
        content = re.sub(r'javascript\s*:\s*', '', content, flags=re.IGNORECASE)
        return content


# ============================================
# TOOLS
# ============================================

@tool
def rastrear_pedido(numero_guia: str) -> str:
    """Usa esta herramienta SOLO cuando el usuario pregunte por el estado de su pedido o numero de guia."""
    if not re.match(r'^[A-Za-z0-9\-_]{4,30}$', numero_guia):
        return "El numero de guia proporcionado no tiene un formato valido."
    estados = ["En reparto (Llegara hoy)", "Procesado en almacen", "En transito", "Entregado"]
    _rng = random.Random(numero_guia)
    estado = _rng.choice(estados)
    return f"El paquete con guia {numero_guia} actualmente se encuentra: {estado}."


# ============================================
# WATCHDOG
# ============================================

class DataFolderHandler(FileSystemEventHandler):
    def __init__(self, engine):
        self.engine = engine
        self._debounce_timer = None

    def on_any_event(self, event):
        if event.is_directory:
            return
        if getattr(self.engine, '_initializing', False):
            return
        # Ignorar archivos ocultos (como .integrity.json) para evitar bucles infinitos
        if os.path.basename(event.src_path).startswith('.'):
            return
        if self._debounce_timer is not None:
            self._debounce_timer.cancel()
        self._debounce_timer = threading.Timer(2.0, lambda: self.engine.reindex(force=True))
        self._debounce_timer.start()


# ============================================
# RAG ENGINE (2026 - Secure RAG)
# ============================================

class RAGEngine:
    def __init__(self, data_dir: str = "data"):
        self.data_dir = data_dir
        self.lock = threading.Lock()

        self.integrity = DocumentIntegrity(os.path.join(data_dir, ".integrity.json"))
        self.content_filter = ContentFilter()
        self.output_validator = OutputValidator()

        logger.info("Cargando modelo de Embeddings ligero (Google Gemini API)...")
        self.embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")

        self.llm, self.using_huggingface = self._init_llm_with_fallback()
        self.document_provenance: Dict[str, Dict[str, Any]] = {}

        logger.info("Usando Chroma en memoria (sin persistencia en disco)")

        self._initializing = True
        self.reindex()
        self._start_watchdog()
        self._initializing = False

    def _init_llm_with_fallback(self):
        """
        Inicializa el LLM con fallback:
        1. Groq (API rapida, gratis) - RECOMENDADO
        2. Gemini (Google API - 20 solicitudes/dia)
        3. HuggingFace local (flan-t5-small, lento)
        Retorna: (llm, using_huggingface: bool)
        """
        # 1. Intentar Groq primero
        try:
            logger.info("Intentando inicializar Groq como LLM principal...")
            groq_llm = ChatGroq(
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                max_tokens=2048,
                max_retries=2,  # Permitir reintentos en caso de fallo de red
            )
            test = groq_llm.invoke("OK")
            if test and test.content:
                logger.info("Groq LLM conectado correctamente.")
                return groq_llm, False
        except Exception as e:
            logger.warning(f"Groq no disponible: {e}")

        # 2. Intentar Gemini como respaldo (con timeout rapido)
        try:
            logger.info("Intentando inicializar Gemini como LLM...")
            gemini_llm = ChatGoogleGenerativeAI(
                model="gemini-2.0-flash",
                temperature=0.2,
                max_tokens=2048,
                max_retries=2,  # Permitir reintentos
                request_timeout=10,  # Timeout de 10s (minimo permitido por Gemini)
            )
            test = gemini_llm.invoke("OK")
            if test and test.content:
                logger.info("Gemini LLM conectado correctamente.")
                return gemini_llm, False
        except Exception as e:
            logger.warning(f"Gemini no disponible: {e}")

        # 3. Sin mas opciones - iniciamos sin LLM
        logger.warning("Groq y Gemini no disponibles. Iniciando sin LLM.")
        logger.warning("Si es Groq, el rate limit se renueva cada hora (TPM) o cada dia (TPD).")
        return None, True

    # ---------------------------------------------------------------
    # WATCHDOG
    # ---------------------------------------------------------------

    def _start_watchdog(self):
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
        self.observer = Observer()
        event_handler = DataFolderHandler(self)
        self.observer.schedule(event_handler, self.data_dir, recursive=False)
        self.observer.start()
        atexit.register(self._stop_watchdog)
        logger.info("Vigilante de archivos (Watchdog) activado en la carpeta data/")

    def _stop_watchdog(self):
        if hasattr(self, 'observer') and self.observer:
            self.observer.stop()
            self.observer.join(timeout=2)
            logger.info("Watchdog detenido correctamente.")

    # ---------------------------------------------------------------
    # INDEXACION CON SEGURIDAD (2026)
    # ---------------------------------------------------------------

    def reindex(self, force: bool = False):
        with self.lock:
            logger.info("=== INICIANDO REINDEXACION SEGURA (en memoria) ===")
            try:
                documents = self._load_documents_with_security()
                if not documents:
                    logger.warning("No se encontraron documentos seguros para indexar.")
                    self.vector_store = None
                    self.compression_retriever = None
                    return

                text_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=MAX_CHUNK_SIZE,
                    chunk_overlap=CHUNK_OVERLAP,
                )
                splits = text_splitter.split_documents(documents)

                safe_splits = []
                for split in splits:
                    if ContentFilter.scan_document_content(
                        split.page_content,
                        source=split.metadata.get("source", "unknown")
                    ):
                        safe_splits.append(split)

                if not safe_splits:
                    logger.warning("Todos los chunks fueron filtrados por contenido sospechoso.")
                    self.vector_store = None
                    self.compression_retriever = None
                    return

                logger.info(f"Chunks seguros: {len(safe_splits)} (de {len(splits)} totales)")

                try:
                    self.vector_store = Chroma.from_documents(
                        safe_splits,
                        self.embeddings,
                    )
                    self.compression_retriever = self.vector_store.as_retriever(
                        search_kwargs={"k": RETRIEVAL_K}
                    )
                    logger.info("Base de conocimientos indexada correctamente en memoria.")
                except Exception as e:
                    logger.error(f"Fallo la indexacion en memoria: {e}")
                    self.vector_store = None
                    self.compression_retriever = None
                    return

                self._build_agent()
                logger.info("=== REINDEXACION COMPLETADA EXITOSAMENTE ===")

            except Exception as e:
                logger.error(f"Error critico en reindexacion: {e}")

    def _load_documents_with_security(self) -> List[Document]:
        docs = []
        if not os.path.exists(self.data_dir):
            os.makedirs(self.data_dir)
            return docs

        for filename in os.listdir(self.data_dir):
            if filename.startswith('.') or filename == 'desktop.ini':
                continue
            filepath = os.path.join(self.data_dir, filename)
            if not os.path.isfile(filepath):
                continue
            ext = Path(filepath).suffix.lower()
            try:
                if self.integrity.verify_file(filepath):
                    logger.info(f"[OK] Integridad verificada: {filename}")
                else:
                    logger.info(f"[NEW] Nuevo archivo o modificado: {filename}")
                file_hash = self.integrity.register_file(filepath)
                loaded_docs = self._load_single_file(filepath, ext)
                for doc in loaded_docs:
                    doc.page_content = ContentFilter.sanitize_content(doc.page_content)
                    if not ContentFilter.scan_document_content(doc.page_content, source=filename):
                        logger.warning(f"[BLOCKED] Documento filtrado por contenido sospechoso: {filename}")
                        continue
                    doc.metadata["integrity_hash"] = file_hash[:16]
                    doc.metadata["ingested_at"] = datetime.now(dt_timezone.utc).isoformat()
                    doc.metadata["verified"] = True
                    doc.metadata["category"] = self._infer_category(filename)
                    docs.append(doc)
                self.document_provenance[filename] = {
                    "hash": file_hash[:16],
                    "path": filepath,
                    "ingested_at": datetime.now(dt_timezone.utc).isoformat(),
                    "chunks": len(loaded_docs),
                    "safe_chunks": sum(
                        1 for d in loaded_docs
                        if ContentFilter.scan_document_content(d.page_content, source=filename)
                    )
                }
            except Exception as e:
                logger.error(f"Error cargando {filename} con seguridad: {e}")
        logger.info(f"Documentos cargados de forma segura: {len(docs)}")
        return docs

    def _load_single_file(self, filepath: str, ext: str) -> List[Document]:
        try:
            if ext == '.csv':
                loader = CSVLoader(file_path=filepath, encoding='utf-8')
                return loader.load()
            elif ext == '.pdf':
                loader = PyPDFLoader(file_path=filepath)
                return loader.load()
            elif ext in ['.txt', '.md']:
                loader = TextLoader(file_path=filepath, encoding='utf-8')
                return loader.load()
            elif ext == '.docx':
                loader = Docx2txtLoader(file_path=filepath)
                return loader.load()
            elif ext == '.html':
                loader = BSHTMLLoader(file_path=filepath)
                return loader.load()
            elif ext in ['.xls', '.xlsx']:
                import pandas as pd
                df = pd.read_excel(filepath)
                docs = []
                for index, row in df.iterrows():
                    content = " ".join([f"{col}: {val}" for col, val in row.items()])
                    docs.append(Document(
                        page_content=content,
                        metadata={"source": filepath, "row": index}
                    ))
                return docs
            elif ext == '.json':
                with open(filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                text_content = json.dumps(data, indent=2, ensure_ascii=False)
                return [Document(page_content=text_content, metadata={"source": filepath})]
            else:
                logger.warning(f"Extension no soportada: {ext}")
                return []
        except Exception as e:
            logger.error(f"Error cargando {filepath}: {e}")
            return []

    # ---------------------------------------------------------------
    # AGENTE CON SEGURIDAD (2026)
    # ---------------------------------------------------------------

    def _build_agent(self):
        @tool("buscar_base_conocimiento")
        def retriever_tool(query: str) -> str:
            """Busca informacion de productos, politicas, finanzas y documentos de la empresa."""
            if not self.compression_retriever:
                return "La base de conocimiento no esta disponible."
            docs = self.compression_retriever.invoke(query)
            if not docs:
                return "No se encontro informacion relevante en la base de conocimiento."
            context_parts = []
            for i, doc in enumerate(docs):
                source = doc.metadata.get("source", "Fuente desconocida")
                filename = os.path.basename(source) if source != "Fuente desconocida" else "Desconocida"
                context_parts.append(
                    f"[DOCUMENTO {i + 1} - Fuente: {filename}]\n{doc.page_content}\n[/DOCUMENTO {i + 1}]"
                )
            return "\n\n".join(context_parts)

        tools = [retriever_tool, rastrear_pedido]
        self.agent_tools = tools
        self.agent_system_prompt = """Eres el Asistente Virtual Inteligente de TechStore, una tienda en línea premium de tecnología.

Tu objetivo principal es ayudar a los clientes respondiendo sus preguntas basadas EXCLUSIVAMENTE en el contexto proporcionado, el cual proviene del inventario y base de conocimiento de la tienda.

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. Responde de forma natural, conversacional y muy amable. Eres un experto en tecnología y ventas.
2. NUNCA menciones las palabras "contexto", "documento", "JSON", "CSV" o "base de datos". Habla como si lo supieras por ser el encargado de la tienda.
3. Si la pregunta es sobre productos, stock o precios y están en tu contexto, responde directamente.
4. Para recomendar un producto de manera interactiva, DEBES usar EXACTAMENTE este formato en algún lugar de tu respuesta (el frontend lo convertirá en una tarjeta visual):
   [PRODUCT_CARD: Nombre del Producto | Precio sin símbolo $ | Categoría]
   Ejemplo: Te recomiendo nuestro modelo más vendido: [PRODUCT_CARD: Laptop Pro X | 1299.99 | Computadoras]
5. Si no encuentras la respuesta en el contexto, di amablemente que no tienes esa información o sugiere contactar a soporte humano. NO inventes datos.
6. Si es un saludo o pregunta casual, responde cordialmente.

Estas filtrando por categoría: {category_filter}

Contexto actual recuperado de la base de conocimientos:
{context}

Historial reciente de la conversación:
{history}
"""

        self.admin_system_prompt = """Eres el Asistente Corporativo para el Administrador de TechStore.
Tu función es proporcionar resúmenes, análisis y respuestas precisas basadas EXCLUSIVAMENTE en los documentos internos de la empresa (RRHH, Finanzas, Inventario).

REGLAS ESTRICTAS DE COMPORTAMIENTO:
1. Eres un asistente interno y corporativo. Responde con un tono profesional y analítico.
2. NUNCA intentes vender productos ni recomendar compras. NO uses el formato [PRODUCT_CARD].
3. Si la pregunta es sobre datos de la empresa, responde con claridad basándote solo en el contexto.
4. Si no encuentras la respuesta en el contexto, di amablemente que no tienes esa información corporativa. NO inventes datos.
5. Puedes mencionar que obtuviste la información de los documentos o reportes internos proporcionados.

Estas filtrando por categoría: {category_filter}

Contexto actual recuperado de los documentos internos:
{context}

Historial reciente de la conversación:
{history}
"""

    # ---------------------------------------------------------------
    # MAPA DE CATEGORIAS (2026)
    # ---------------------------------------------------------------

    CATEGORY_MAP = {
        "rh": "RRHH",
        "rrhh": "RRHH",
        "empleado": "RRHH",
        "asistencia": "RRHH",
        "finanzas": "Finanzas",
        "finanza": "Finanzas",
        "venta": "Finanzas",
        "reporte": "Finanzas",
        "inventario": "Inventario",
        "proveedor": "Inventario",
        "bodega": "Inventario",
    }

    def _infer_category(self, filename: str) -> str:
        """Infiera la categoría de un documento basado en su nombre de archivo."""
        name_lower = filename.lower()
        for keyword, category in self.CATEGORY_MAP.items():
            if keyword in name_lower:
                return category
        return "General"

    # ---------------------------------------------------------------
    # PIPELINE RAG SIMPLE (UNA sola llamada al LLM - sin rate limits)
    # ---------------------------------------------------------------

    def _simple_rag(self, query: str, category_filter: str, history: list = None, is_admin: bool = False) -> str:
        """
        Pipeline RAG simple: recupera documentos + UNA sola llamada al LLM.
        Esto evita los rate limits de Groq (el ReAct agent hace multiples llamadas).
        """
        try:
            # Recuperar mas documentos (15) para poder filtrar por categoria
            retrieved = self.compression_retriever.invoke(query) if self.compression_retriever else []

            # Filtrar por categoria si no es "Todos"
            if category_filter != "Todos" and retrieved:
                filtered = [d for d in retrieved if d.metadata.get('category', '') == category_filter]
                if filtered:
                    retrieved = filtered
                else:
                    # Si no se encontraron docs de la categoria, expandir la consulta
                    # con terminos especificos de la categoria
                    category_expansion = {
                        "Inventario": "productos stock laptop teclado mouse monitor audifonos tablet cargador webcam disponible",
                        "RRHH": "recursos humanos vacaciones empleados licencia enfermedad politicas",
                        "Finanzas": "financiero gastos ingresos presupuesto balance",
                        "General": "informacion politica preguntas frecuentes",
                    }
                    extra_terms = category_expansion.get(category_filter, category_filter.lower())
                    expanded_query = f"{query} {extra_terms}"
                    logger.info(f"Expandiendo consulta para categoria {category_filter}: {expanded_query[:80]}...")
                    retrieved2 = self.compression_retriever.invoke(expanded_query) if self.compression_retriever else []
                    filtered2 = [d for d in retrieved2 if d.metadata.get('category', '') == category_filter]
                    if filtered2:
                        retrieved = filtered2
                        logger.info(f"Expansion encontro {len(filtered2)} docs de {category_filter}")
                    else:
                        # Si no hay documentos de la categoria, vaciar la lista recuperada
                        retrieved = []

            # Para "Todos", no filtramos por categoría ni expandimos la consulta forzosamente,
            # lo que permite que el administrador consulte PDFs, Excels, y políticas de RRHH sin sesgo de inventario.
            if category_filter == "Todos":
                retrieved = self.compression_retriever.invoke(query) if self.compression_retriever else []

            context = ""
            if retrieved:
                context = "\n".join([d.page_content[:500] for d in retrieved[:3]])

            # Seleccionar el prompt correcto según si es admin o no
            base_prompt = self.admin_system_prompt if is_admin else self.agent_system_prompt
            prompt_text = base_prompt.replace("{category_filter}", category_filter)

            # Agregar historial si existe (ultimos 2 intercambios)
            history_text = ""
            if history:
                last_msgs = history[-4:]  # ultimos 4 mensajes = ~2 intercambios
                history_lines = []
                for msg in last_msgs:
                    role = "Usuario" if msg.get('role') == 'user' else "Asistente"
                    history_lines.append(f"{role}: {msg.get('content', '')}")
                if history_lines:
                    history_text = "\n".join(history_lines) + "\n"

            full_prompt = f"{prompt_text}\n\nContexto:\n{context}\n\nHistorial reciente:\n{history_text}\nPregunta: {query}\n\nRespuesta:"
            response = self.llm.invoke(full_prompt)

            if hasattr(response, 'content'):
                answer = response.content
            else:
                answer = str(response)

            if not self.output_validator.validate(answer):
                answer = self.output_validator.sanitize(answer)
            return answer

        except Exception as e:
            import traceback
            tb_str = traceback.format_exc()
            logger.error(f"Error en pipeline RAG simple: {e}\n{tb_str}")
            raise

    def _react_agent_ask(self, query: str, chat_history: list, category_filter: str, is_admin: bool = False) -> str:
        """Usa el agente ReAct (multiples llamadas) - solo para consultas que necesitan herramientas."""
        base_prompt = self.admin_system_prompt if is_admin else self.agent_system_prompt
        prompt_with_category = base_prompt.replace("{category_filter}", category_filter)
        
        agent_executor = create_react_agent(self.llm, self.agent_tools, prompt=prompt_with_category)
        chat_history.append(HumanMessage(content=query))

        response = agent_executor.invoke({"messages": chat_history})
        answer = response["messages"][-1].content

        if not self.output_validator.validate(answer):
            answer = self.output_validator.sanitize(answer)
        return answer

    # ---------------------------------------------------------------
    # METODO PRINCIPAL: ASK
    # ---------------------------------------------------------------

    def ask(self, query: str, history: List[Dict[str, str]] = None, category_filter: str = "Todos", is_admin: bool = False) -> str:
        """
        Procesa una consulta del usuario utilizando el historial, filtro de categoría y RAG.
        Retorna la respuesta generada por el LLM.
        """
        if not hasattr(self, 'agent_tools') or self.agent_tools is None:
            return "El asistente no tiene documentos cargados o esta reindexando."

        # Verificar si hay LLM disponible
        if self.llm is None:
            return "El servicio de IA no esta disponible en este momento. Por favor, intenta mas tarde."

        query = ContentFilter.sanitize_content(query)
        if not query or len(query.strip()) < 2:
            return "Por favor, haz una pregunta mas especifica."

        # Construir chat_history para el agente ReAct
        chat_history = []
        if history:
            for msg in history:
                content = ContentFilter.sanitize_content(msg.get('content', ''))
                if msg.get('role') == 'user':
                    chat_history.append(HumanMessage(content=content))
                else:
                    chat_history.append(AIMessage(content=content))

        # Detectar si necesita el agente ReAct (solo para rastrear pedidos)
        # Solo usar ReAct si el usuario EXPLICITAMENTE pregunta por rastreo de pedidos
        # (con numero de guia o palabra clave especifica de seguimiento)
        necesita_react = bool(re.search(
            r'(rastrear?\s*(mi\s*)?pedido|tracking|track\s*(my\s*)?order|num(ero)?\s*(de\s*)?(guia|pedido|seguimiento)|como\s*.*(va|esta)\s*(mi\s*)?pedido)',
            query, re.IGNORECASE
        ))

        if necesita_react:
            try:
                logger.info("Usando agente ReAct para consulta con herramientas...")
                return self._react_agent_ask(query, chat_history, category_filter, is_admin)
            except Exception as e:
                logger.warning(f"Agente ReAct fallo ({e}), usando pipeline simple...")

        # Pipeline RAG simple (UNA sola llamada al LLM - incluye historial)
        try:
            return self._simple_rag(query, category_filter, history, is_admin)
        except Exception as e:
            logger.error(f"Pipeline RAG simple fallo: {e}")
            return "Lo siento, ha ocurrido un error de conexión o la API está saturada (límite de peticiones alcanzado). Por favor, intenta de nuevo en unos minutos."

    # ---------------------------------------------------------------
    # METODOS DE CONSULTA
    # ---------------------------------------------------------------

    def get_provenance_report(self) -> Dict[str, Any]:
        return {
            "total_documents": len(self.document_provenance),
            "documents": self.document_provenance,
            "integrity_hashes": self.integrity.get_all_hashes()
        }

    def get_document_count(self) -> int:
        if self.compression_retriever:
            return len(self.document_provenance)
        return 0
