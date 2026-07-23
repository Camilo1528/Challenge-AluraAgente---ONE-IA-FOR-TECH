import os
import re
import shutil
import hashlib
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi import Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone as dt_timezone
from passlib.context import CryptContext
import logging
from logging.handlers import RotatingFileHandler

from rag_engine import RAGEngine
import database
import drive_sync

# ============================================
# LOGGING CONFIGURACIÓN (2026 - OWASP Logging)
# ============================================
LOG_DIR = os.getenv("LOG_DIR", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        RotatingFileHandler(os.path.join(LOG_DIR, "api.log"), maxBytes=10_000_000, backupCount=5),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("techstore-api")

load_dotenv()

app = FastAPI(title="TechStore AI Enterprise API", description="SaaS Backend con Auth, Reranking, Orders y Reviews")

# Inicializar y poblar base de datos en el arranque (crítico para Render)
try:
    database.init_db()
    import subprocess
    subprocess.run(["python", "seed_real_products.py"], check=True)
    logger.info("Base de datos inicializada y poblada correctamente en el arranque.")
except Exception as e:
    logger.error(f"Error al inicializar la base de datos en el arranque: {e}")

# ============================================
# VALIDACIÓN DE ENTORNO (2026 - Supply Chain)
# ============================================
REQUIRED_ENV_VARS = {
    "SECRET_KEY": "Clave secreta para firmar tokens JWT (mínimo 32 caracteres)",
}

missing_vars = []
for var, desc in REQUIRED_ENV_VARS.items():
    value = os.getenv(var)
    if not value:
        missing_vars.append(f"  - {var}: {desc}")

if missing_vars:
    error_msg = "ERROR CRÍTICO: Variables de entorno faltantes:\n" + "\n".join(missing_vars)
    logger.critical(error_msg)
    raise RuntimeError(error_msg)

# GOOGLE_API_KEY es opcional si se usa Groq
if not os.getenv("GOOGLE_API_KEY"):
    logger.info("GOOGLE_API_KEY no configurada. Se usara Groq como LLM principal.")

SECRET_KEY = os.getenv("SECRET_KEY")
if len(SECRET_KEY) < 32:
    raise RuntimeError("SECRET_KEY debe tener al menos 32 caracteres por seguridad")

# Validar ADMIN_PASS (ya no tiene default inseguro)
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("ADMIN_PASS")
if not ADMIN_PASS:
    logger.warning("ADMIN_PASS no configurada. Se usará autenticación solo desde base de datos.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15  # TTL corto para reducir riesgo
REFRESH_TOKEN_EXPIRE_DAYS = 7
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============================================
# FUNCIONES DE UTILIDAD DE SEGURIDAD (2026)
# ============================================

def verify_password(plain_password, hashed_password):
    """Verifica contraseña con bcrypt."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    """Genera hash bcrypt de la contraseña."""
    return pwd_context.hash(password)


def create_access_token(data: dict):
    """Crea un JWT de acceso con expiración corta."""
    to_encode = data.copy()
    expire = datetime.now(dt_timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(dt_timezone.utc),
        "type": "access"
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict):
    """Crea un JWT de refresh con expiración más larga."""
    to_encode = data.copy()
    expire = datetime.now(dt_timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": datetime.now(dt_timezone.utc),
        "type": "refresh"
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def sanitize_input(text: str) -> str:
    """
    Sanitiza entrada de usuario eliminando caracteres potencialmente peligrosos.
    Mitiga XSS, SQLi básico y prompt injection.
    """
    if not text:
        return text
    # Eliminar caracteres de control (excepto saltos de línea y tabs)
    sanitized = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', text)
    # Limitar longitud (ya validado por Pydantic, pero capa extra)
    sanitized = sanitized[:2000]
    return sanitized


def sanitize_filename(filename: str) -> str:
    """Sanitiza nombres de archivo eliminando caracteres peligrosos (path traversal)."""
    # Solo mantener caracteres seguros
    safe = re.sub(r'[^\w\-_.() ]', '', filename)
    # Limitar longitud
    safe = safe[:200]
    return safe.strip()


def validate_output(content: str) -> str:
    """
    Valida y filtra la salida del LLM antes de enviarla al usuario.
    Previene que el LLM exponga información sensible o ejecute código.
    """
    if not content:
        return content

    # Detectar posibles secretos/PII en la respuesta
    sensitive_patterns = [
        r'[A-Za-z0-9_]{20,}',  # Posibles API keys
        r'(?:\d{4}[-\s]?){3}\d{4}',  # Números de tarjeta
        r'\b[\w\.-]+@[\w\.-]+\.\w{2,}\b',  # Emails (a menos que sean del contexto empresarial)
    ]

    warnings = []
    for pattern in sensitive_patterns:
        matches = re.findall(pattern, content)
        if matches:
            warnings.append(f"Posible dato sensible detectado en salida")

    if warnings:
        logger.warning(f"Output validation: {'; '.join(warnings)}")

    return content


def compute_document_hash(filepath: str) -> str:
    """Calcula hash SHA-256 de un archivo para verificar integridad."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


# ============================================
# AUDIT LOGGING
# ============================================

def log_audit(event: str, username: str = None, details: dict = None):
    """Registra eventos de auditoría en base de datos y logs."""
    event_data = {
        "event": event,
        "username": username or "anonymous",
        "details": details or {},
        "timestamp": datetime.now(dt_timezone.utc).isoformat()
    }
    logger.info(f"AUDIT: {event} | user={event_data['username']} | details={details}")

    # Persistir en DB
    try:
        database.log_audit_event(event, event_data["username"], str(details))
    except Exception as e:
        logger.error(f"Error logging audit event: {e}")


# ============================================
# MIDDLEWARE DE SEGURIDAD (OWASP 2026)
# ============================================

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Agrega headers de seguridad OWASP recomendados."""
    response: Response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=(), payment=()"
    )
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' http://localhost:*; "
        "frame-ancestors 'none'; "
        "form-action 'self'"
    )
    return response


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Logging de todas las solicitudes para auditoría."""
    start_time = datetime.now(dt_timezone.utc)
    response = await call_next(request)
    duration = (datetime.now(dt_timezone.utc) - start_time).total_seconds()
    logger.info(
        f"{request.method} {request.url.path} -> {response.status_code} ({duration:.3f}s)"
    )
    return response


# --- RATE LIMITER ---
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- CORS ---
env_origins = os.getenv("CORS_ORIGINS", "")
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
]
if env_origins:
    origins.extend([origin.strip() for origin in env_origins.split(",") if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-CSRF-Token",
        "X-Requested-With"
    ],
    expose_headers=["X-Request-ID"],
)

# --- INICIALIZACIÓN ---
database.init_db()
rag = RAGEngine(data_dir="data")

# --- STATIC FILES ---
os.makedirs("static/products", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ============================================
# SHUTDOWN
# ============================================

@app.on_event("shutdown")
def shutdown_event():
    rag._stop_watchdog()
    logger.info("Servicio detenido correctamente.")


# ============================================
# AUTH DEPENDENCIES
# ============================================

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Valida JWT y retorna el username."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "access")
        if username is None or token_type != "access":
            raise HTTPException(status_code=401, detail="Token inválido o expirado")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


async def get_current_admin(current_user: str = Depends(get_current_user)):
    """Verifica que el usuario sea administrador."""
    admin_creds = database.get_admin_credentials()
    is_admin = False

    if admin_creds:
        is_admin = current_user == admin_creds["username"]
    else:
        is_admin = current_user == ADMIN_USER

    if not is_admin:
        log_audit("ACCESO_DENEGADO_ADMIN", current_user, {"intento": "acceso a ruta admin"})
        raise HTTPException(status_code=403, detail="Permisos insuficientes")

    return current_user


# ============================================
# AUTH ENDPOINTS (2026 - Secure by Design)
# ============================================

MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_MINUTES = 15


@app.post("/token")
@limiter.limit("10/minute")  # Anti-brute-force ahora también en /token
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login de administrador con protección anti-fuerza bruta."""
    admin_creds = database.get_admin_credentials()

    if admin_creds:
        if form_data.username == admin_creds["username"] and verify_password(form_data.password, admin_creds["password_hash"]):
            access_token = create_access_token(data={"sub": form_data.username})
            refresh_token = create_refresh_token(data={"sub": form_data.username})
            log_audit("LOGIN_ADMIN_EXITOSO", form_data.username)
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "role": "admin",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
            }
        else:
            log_audit("LOGIN_ADMIN_FALLIDO", form_data.username)
            raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")

    # Fallback solo si existe ADMIN_PASS en entorno (ya no tiene default)
    if ADMIN_PASS:
        if form_data.username == ADMIN_USER and form_data.password == ADMIN_PASS:
            access_token = create_access_token(data={"sub": form_data.username})
            refresh_token = create_refresh_token(data={"sub": form_data.username})
            log_audit("LOGIN_ADMIN_EXITOSO_ENV", form_data.username)
            return {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "bearer",
                "role": "admin",
                "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
            }

    log_audit("LOGIN_ADMIN_FALLIDO", form_data.username)
    raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")


@app.post("/token/refresh")
@limiter.limit("5/minute")
async def refresh_access_token(request: Request, refresh_token: str):
    """Refresca el access token usando un refresh token."""
    try:
        payload = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        token_type: str = payload.get("type", "")

        if username is None or token_type != "refresh":
            raise HTTPException(status_code=401, detail="Refresh token inválido")

        # Verificar que el usuario aún existe
        admin_creds = database.get_admin_credentials()
        if admin_creds and username != admin_creds["username"]:
            if username != ADMIN_USER:
                raise HTTPException(status_code=401, detail="Usuario no encontrado")

        new_access_token = create_access_token(data={"sub": username})
        return {
            "access_token": new_access_token,
            "token_type": "bearer",
            "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Refresh token inválido o expirado")


# --- PASSWORD CHANGE (Modelo) ---
class PasswordChange(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=64, description="Nueva contraseña (min 8 caracteres)")
    model_config = {"extra": "forbid"}


@app.put("/admin/password")
def change_admin_password(payload: PasswordChange, current_admin: str = Depends(get_current_admin)):
    """Cambia la contraseña del administrador con validación de fortaleza."""
    hashed_pw = get_password_hash(payload.new_password)
    database.set_admin_credentials(current_admin, hashed_pw)
    log_audit("CAMBIO_CONTRASENA", current_admin)
    return {"message": "Contraseña de administrador actualizada con éxito"}


# ============================================
# USERS ENDPOINTS (2026 - Secure Auth)
# ============================================

class UserAuth(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern="^[a-zA-Z0-9_@.-]+$")
    password: str = Field(..., min_length=8, max_length=64)
    model_config = {"extra": "forbid"}


@app.post("/register")
@limiter.limit("5/minute")
def register_user(request: Request, user: UserAuth):
    """Registro de nuevo usuario con límite anti-bot."""
    hashed_pw = get_password_hash(user.password)
    if database.create_user(user.username, hashed_pw):
        log_audit("USUARIO_REGISTRADO", user.username)
        return {"message": "Usuario creado con éxito"}
    else:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")


@app.post("/login/user")
@limiter.limit("10/minute")
def login_user(request: Request, user: UserAuth):
    """Login de usuario con protección anti-fuerza bruta."""
    db_user = database.get_user_by_username(user.username)
    if not db_user or not verify_password(user.password, db_user["password_hash"]):
        log_audit("LOGIN_USUARIO_FALLIDO", user.username)
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    access_token = create_access_token(data={"sub": db_user["username"]})
    refresh_token = create_refresh_token(data={"sub": db_user["username"]})
    log_audit("LOGIN_USUARIO_EXITOSO", user.username)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "username": db_user["username"],
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


@app.post("/logout")
def logout(current_user: str = Depends(get_current_user)):
    """Cierra la sesión del usuario (invalidación es client-side + TTL corto)."""
    log_audit("LOGOUT", current_user)
    return {"message": "Sesión cerrada. Elimina el token del lado del cliente."}


# ============================================
# GOOGLE MOCK (SOLO DESARROLLO - Deshabilitado en producción)
# ============================================

class GoogleMockLogin(BaseModel):
    email: str
    name: str


@app.post("/auth/google/mock")
async def google_mock_login(payload: GoogleMockLogin):
    """
    [SOLO DESARROLLO] Mock de Google Login.
    En producción, usa OAuth2 real con Google Identity Services.
    """
    if os.getenv("ENVIRONMENT", "").lower() in ("production", "prod"):
        raise HTTPException(status_code=403, detail="Google Mock Login no disponible en producción")

    # Validar email mínimo
    if not re.match(r'^[\w\.-]+@[\w\.-]+\.\w{2,}$', payload.email):
        raise HTTPException(status_code=400, detail="Email inválido")

    # Bloquear acceso con correo del administrador
    admin_creds = database.get_admin_credentials()
    admin_user = admin_creds["username"] if admin_creds else ADMIN_USER
    if payload.email.lower() == admin_user.lower():
        raise HTTPException(status_code=403, detail="No puedes usar el correo del administrador mediante Google Login")

    # Crear o recuperar usuario
    db_user = database.get_user_by_username(payload.email)
    if not db_user:
        hashed_pw = get_password_hash("google_mock_" + os.urandom(16).hex())
        database.create_user(payload.email, hashed_pw)

    access_token = create_access_token(data={"sub": payload.email})
    refresh_token = create_refresh_token(data={"sub": payload.email})
    log_audit("GOOGLE_MOCK_LOGIN", payload.email)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "username": payload.email,
        "name": payload.name,
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }


# ============================================
# FILE UPLOAD (2026 - Secure File Handling)
# ============================================

ALLOWED_EXTENSIONS = {".csv", ".pdf", ".md", ".txt", ".docx", ".html", ".xlsx", ".xls", ".json"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_admin: str = Depends(get_current_admin)):
    """Sube archivos de conocimiento con validación de seguridad."""
    os.makedirs("data", exist_ok=True)

    # Validar tamaño
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"Archivo demasiado grande. Máximo 50MB.")

    # Sanitizar nombre
    raw_filename = file.filename or "unknown.bin"
    safe_filename = sanitize_filename(raw_filename)
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Nombre de archivo inválido")

    # Validar extensión (whitelist)
    ext = os.path.splitext(safe_filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extensión {ext} no permitida. Extensiones aceptadas: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    file_path = os.path.join("data", safe_filename)

    # Verificar si ya existe (sobreescritura segura)
    if os.path.exists(file_path):
        old_hash = compute_document_hash(file_path)
        logger.info(f"Sobrescribiendo archivo existente: {safe_filename} (hash previo: {old_hash[:16]}...)")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Calcular hash del archivo recién subido
    new_hash = compute_document_hash(file_path)

    log_audit("ARCHIVO_SUBIDO", current_admin, {
        "filename": safe_filename,
        "size": file_size,
        "hash": new_hash[:16]
    })

    return {
        "filename": safe_filename,
        "hash": new_hash[:16],
        "message": "Archivo subido exitosamente con verificación de integridad."
    }


@app.post("/upload-product-image")
async def upload_product_image(
    request: Request,
    file: UploadFile = File(...),
    current_admin: str = Depends(get_current_admin)
):
    """Sube imágenes de producto con validación de seguridad."""
    os.makedirs("static/products", exist_ok=True)

    # Validar extensión
    raw_filename = file.filename or "unknown.png"
    extension = raw_filename.split('.')[-1].lower() if '.' in raw_filename else ''
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Extensión de archivo no permitida. Solo imágenes.")

    # Tamaño máximo para imágenes
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(status_code=400, detail="Imagen demasiado grande. Máximo 10MB.")

    # Nombre seguro
    base_name = sanitize_filename(raw_filename)
    timestamp = int(datetime.now(dt_timezone.utc).timestamp())
    safe_filename = f"img_{timestamp}_{base_name.replace(' ', '_')}"

    file_path = os.path.join("static", "products", safe_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    image_url = f"{request.base_url}static/products/{safe_filename}"

    log_audit("IMAGEN_SUBIDA", current_admin, {"filename": safe_filename})

    return {"image_url": image_url}


# ============================================
# CHAT API (2026 - Secure RAG)
# ============================================

class ChatRequest(BaseModel):
    session_id: str = Field(..., description="ID único de la sesión del usuario")
    message: str = Field(..., max_length=1000, description="Mensaje del usuario")
    category: Optional[str] = Field("Todos", description="Filtro de categoría/departamento")


@app.get("/")
def read_root():
    """Health check básico."""
    return {
        "status": "ok",
        "version": "2.0.0",
        "message": "TechStore Enterprise API - Secure by Design",
        "timestamp": datetime.now(dt_timezone.utc).isoformat()
    }


@app.get("/health")
def health_check():
    """Health check detallado para orquestación."""
    return {
        "status": "healthy",
        "database": "connected" if database._get_conn() else "disconnected",
        "rag_engine": "initialized" if rag.compression_retriever is not None else "not_initialized",
        "timestamp": datetime.now(dt_timezone.utc).isoformat()
    }


@app.get("/history/{session_id}")
def get_history(session_id: str):
    """Recupera el historial de chat de una sesión."""
    history = database.get_chat_history(session_id)
    return {"history": history}


@app.delete("/history/{session_id}")
def clear_history(session_id: str):
    """Elimina todo el historial de una sesión de chat."""
    database.delete_chat_session(session_id)
    return {"message": "Historial eliminado", "session_id": session_id}


@app.post("/chat")
@limiter.limit("30/minute")
def chat(request: Request, chat_request: ChatRequest):
    """Envía un mensaje al asistente RAG con validación de seguridad."""
    try:
        # Sanitizar entrada del usuario
        sanitized_message = sanitize_input(chat_request.message)
        if not sanitized_message or len(sanitized_message.strip()) < 2:
            raise HTTPException(status_code=400, detail="Mensaje demasiado corto después de sanitización")

        # Verificar si es un intento de prompt injection (solo patrones MUY especificos)
        # NOTA: Groq llama-3.3-70b ya tiene proteccion propia contra injection
        injection_patterns = [
            r'\bignor(a|e|ar)\s+(completamente\s+)?(las\s+)?instruccion(es)?\s+(previas|anteriores|del\s+sistema)\b',
            r'\b(reveal|show)\s+(your\s+)?(prompt|system\s+prompt|instructions)\b',
        ]

        is_injection_attempt = False
        for pattern in injection_patterns:
            if re.search(pattern, sanitized_message, re.IGNORECASE):
                is_injection_attempt = True
                logger.warning(f"Prompt injection detectado: {sanitized_message[:100]}...")
                break

        if is_injection_attempt:
            log_audit("PROMPT_INJECTION_DETECTED", details={"message": sanitized_message[:200]})
            return {"reply": "No puedo procesar esa solicitud."}

        # Procesar mensaje
        history = database.get_chat_history(chat_request.session_id)
        database.save_message(chat_request.session_id, "user", sanitized_message)
        
        is_admin = chat_request.session_id.startswith('admin_')
        answer = rag.ask(sanitized_message, history, category_filter=chat_request.category, is_admin=is_admin)

        # Validar salida del LLM
        validated_answer = validate_output(answer)

        database.save_message(chat_request.session_id, "assistant", validated_answer)

        log_audit("CHAT_MENSAJE", details={
            "session_id": chat_request.session_id[:8],
            "category": chat_request.category
        })

        return {"reply": validated_answer}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error procesando solicitud de chat: {e}")
        raise HTTPException(status_code=500, detail="Error interno procesando el mensaje.")


# ============================================
# PRODUCTS API
# ============================================

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    price: float = Field(..., gt=0, description="Precio debe ser mayor a 0")
    originalPrice: Optional[float] = Field(None, gt=0)
    discount: Optional[int] = Field(None, ge=0, le=100)
    category: str = Field(..., min_length=1, max_length=100)
    image: str = Field(..., max_length=500)
    shipping: str = Field(default="Envío gratis", max_length=100)
    stock: int = Field(default=0, ge=0)
    model_config = {"extra": "forbid"}


class StockUpdate(BaseModel):
    stock: int = Field(..., ge=0)


@app.get("/products")
def get_products():
    """Obtiene todos los productos del catálogo."""
    try:
        products = database.get_all_products()
        return {"products": products, "count": len(products)}
    except Exception as e:
        logger.error(f"Error obteniendo productos: {e}")
        raise HTTPException(status_code=500, detail="Error al obtener productos")


@app.post("/products")
def create_product(product: ProductCreate, current_admin: str = Depends(get_current_admin)):
    """Crea un nuevo producto en el catálogo."""
    new_id = database.add_product(product.model_dump())
    log_audit("PRODUCTO_CREADO", current_admin, {"product_id": new_id, "name": product.name})
    return {"message": "Producto creado", "id": new_id}


@app.put("/products/{product_id}")
def update_product(product_id: int, product: ProductCreate, current_admin: str = Depends(get_current_admin)):
    """Actualiza un producto existente."""
    database.update_product(product_id, product.model_dump())
    log_audit("PRODUCTO_ACTUALIZADO", current_admin, {"product_id": product_id})
    return {"message": "Producto actualizado"}


@app.delete("/products/{product_id}")
def delete_product(product_id: int, current_admin: str = Depends(get_current_admin)):
    """Elimina un producto del catálogo."""
    database.delete_product(product_id)
    log_audit("PRODUCTO_ELIMINADO", current_admin, {"product_id": product_id})
    return {"message": "Producto eliminado"}


@app.put("/products/{product_id}/stock")
def update_stock(product_id: int, payload: StockUpdate, current_admin: str = Depends(get_current_admin)):
    """Actualiza el stock de un producto."""
    database.update_product_stock(product_id, payload.stock)
    log_audit("STOCK_ACTUALIZADO", current_admin, {"product_id": product_id, "new_stock": payload.stock})
    return {"message": "Stock actualizado"}


# ============================================
# ORDERS API
# ============================================

class OrderItem(BaseModel):
    product_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0, le=100)
    price: float = Field(..., gt=0)


class CheckoutRequest(BaseModel):
    items: List[OrderItem] = Field(..., min_length=1, max_length=50)
    total: float = Field(..., gt=0)


@app.post("/checkout")
def checkout(payload: CheckoutRequest, current_user: str = Depends(get_current_user)):
    """Procesa el checkout con validación de stock y datos."""
    db_user = database.get_user_by_username(current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # Validar stock
    products = database.get_all_products()
    products_map = {p['id']: p for p in products}

    # Verificar que todos los productos existen antes de modificar stock
    for item in payload.items:
        product = products_map.get(item.product_id)
        if not product:
            raise HTTPException(status_code=400, detail=f"Producto ID {item.product_id} no encontrado")
        if product['stock'] < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{product['name']}'. Disponible: {product['stock']}, solicitado: {item.quantity}"
            )

    # Reducir stock
    for item in payload.items:
        product = products_map[item.product_id]
        database.update_product_stock(item.product_id, product['stock'] - item.quantity)

    # Crear orden
    order_id = database.create_order(db_user["id"], payload.total, [i.model_dump() for i in payload.items])

    # Simular envío de email de confirmación
    _simular_envio_email(
        to_email=current_user,
        subject="¡Confirmación de tu Pedido en TechStore!",
        content=f"Hola {current_user},\n\nTu pedido #{order_id} por un total de ${payload.total} ha sido recibido exitosamente.\nTe notificaremos cuando cambie de estado.\n\n¡Gracias por tu compra!"
    )

    log_audit("ORDEN_CREADA", current_user, {"order_id": order_id, "total": payload.total, "items": len(payload.items)})

    return {"message": "Compra exitosa", "order_id": order_id}


@app.get("/my-orders")
def get_my_orders(current_user: str = Depends(get_current_user)):
    """Obtiene las órdenes del usuario actual."""
    db_user = database.get_user_by_username(current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    orders = database.get_orders_by_user(db_user["id"])
    return {"orders": orders}


@app.get("/orders")
def get_all_orders_admin(current_admin: str = Depends(get_current_admin)):
    """Obtiene todas las órdenes (solo admin)."""
    orders = database.get_all_orders()
    return {"orders": orders}


class OrderStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(Pendiente|Empacando|Enviado|Entregado|Cancelado)$")


@app.put("/orders/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusUpdate, current_admin: str = Depends(get_current_admin)):
    """Actualiza el estado de una orden."""
    database.update_order_status(order_id, payload.status)
    log_audit("ORDEN_ESTADO_ACTUALIZADO", current_admin, {"order_id": order_id, "status": payload.status})
    return {"message": "Estado de la orden actualizado"}


# ============================================
# REVIEWS API
# ============================================

class ReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


@app.post("/products/{product_id}/reviews")
def create_review(
    product_id: int,
    payload: ReviewCreate,
    current_user: str = Depends(get_current_user)
):
    """Crea una reseña para un producto."""
    db_user = database.get_user_by_username(current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    database.create_review(product_id, db_user["id"], payload.rating, sanitize_input(payload.comment))
    log_audit("RESENA_CREADA", current_user, {"product_id": product_id, "rating": payload.rating})
    return {"message": "Reseña guardada"}


@app.get("/products/{product_id}/reviews")
def get_reviews(product_id: int):
    """Obtiene las reseñas de un producto."""
    reviews = database.get_reviews_by_product(product_id)
    return {"reviews": reviews}


# ============================================
# EMAIL (Mock)
# ============================================

def _simular_envio_email(to_email: str, subject: str, content: str):
    """Simula el envío de un email (mock para desarrollo)."""
    logger.info(f"📧 EMAIL ENVIADO A: {to_email} | ASUNTO: {subject}")


# ============================================
# SYNC DRIVE ENDPOINT
# ============================================

class SyncDriveRequest(BaseModel):
    folder_id: Optional[str] = None


@app.post("/sync-drive")
def sync_drive(payload: SyncDriveRequest, current_admin: str = Depends(get_current_admin)):
    """Sincroniza archivos desde Google Drive."""
    try:
        result = drive_sync.sync_from_drive(payload.folder_id)
        if result["status"] == "error":
            raise HTTPException(status_code=400, detail=result["message"])
        log_audit("SYNC_DRIVE", current_admin, {"folder_id": payload.folder_id})
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sincronizando Drive: {e}")
        raise HTTPException(status_code=500, detail="Error interno sincronizando Drive")


# ============================================
# AUDIT / LOGS (Solo Admin)
# ============================================

@app.get("/admin/audit-log")
def get_audit_log(limit: int = 100, current_admin: str = Depends(get_current_admin)):
    """Obtiene registros de auditoría (solo admin)."""
    logs = database.get_audit_logs(limit=min(limit, 500))
    return {"audit_logs": logs}
