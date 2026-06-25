import os
import shutil
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from jose import JWTError, jwt
from datetime import datetime, timedelta

from rag_engine import RAGEngine
import database

load_dotenv()

app = FastAPI(title="TechStore AI Enterprise API", description="SaaS Backend con Auth, Reranking y Uploads")

origins = [
    "http://localhost:5173",
    "http://localhost",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

database.init_db()
rag = RAGEngine(data_dir="data")

# --- AUTHENTICATION CONFIG ---
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-for-challenge")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Dummy user for challenge
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None or username != ADMIN_USER:
            raise HTTPException(status_code=401, detail="Credenciales inválidas")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    if form_data.username != ADMIN_USER or form_data.password != ADMIN_PASS:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    access_token = create_access_token(data={"sub": form_data.username})
    return {"access_token": access_token, "token_type": "bearer"}

# --- FILE UPLOAD ---
@app.post("/upload")
async def upload_file(file: UploadFile = File(...), current_user: str = Depends(get_current_user)):
    os.makedirs("data", exist_ok=True)
    file_path = os.path.join("data", file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    # The watchdog in RAGEngine will detect this and automatically re-index
    return {"filename": file.filename, "message": "Archivo subido exitosamente. El Agente lo indexará en breve."}

# --- CHAT API ---
class ChatRequest(BaseModel):
    session_id: str = Field(..., description="ID único de la sesión del usuario para persistencia")
    message: str = Field(..., max_length=1000, description="Mensaje del usuario")
    category: Optional[str] = Field("Todos", description="Filtro de categoría/departamento")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Enterprise API online."}

@app.get("/history/{session_id}")
def get_history(session_id: str):
    history = database.get_chat_history(session_id)
    return {"history": history}

@app.post("/chat")
def chat(request: ChatRequest):
    try:
        history = database.get_chat_history(request.session_id)
        database.save_message(request.session_id, "user", request.message)
        
        # Pasamos el filtro de categoría al motor
        answer = rag.ask(request.message, history, category_filter=request.category)
        
        database.save_message(request.session_id, "assistant", answer)
        return {"reply": answer}
    except Exception as e:
        print(f"Error procesando la solicitud: {e}")
        raise HTTPException(status_code=500, detail="Error interno procesando el mensaje.")
