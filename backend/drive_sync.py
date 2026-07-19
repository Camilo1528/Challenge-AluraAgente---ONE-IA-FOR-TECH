import os
import io
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Define los permisos (scopes) necesarios para leer de Google Drive
SCOPES = ['https://www.googleapis.com/auth/drive.readonly']
DATA_DIR = "data"

def authenticate_drive():
    creds = None
    # El archivo token.json almacena los tokens de acceso y actualización del usuario,
    # y se crea automáticamente cuando el flujo de autorización se completa por primera vez.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    
    # Si no hay credenciales (inválidas o expiradas), pide al usuario que inicie sesión.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                raise FileNotFoundError("No se encontró 'credentials.json'. Descárgalo desde Google Cloud Console e inclúyelo en la carpeta backend.")
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Guardar las credenciales para la próxima vez
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
            
    return creds

def sync_from_drive(folder_id=None):
    """
    Sincroniza los archivos desde Google Drive a la carpeta data/ local.
    Si se pasa folder_id, descarga solo de esa carpeta, sino descarga los archivos más recientes.
    """
    try:
        creds = authenticate_drive()
        service = build('drive', 'v3', credentials=creds)

        query = "mimeType != 'application/vnd.google-apps.folder'"
        if folder_id:
            query += f" and '{folder_id}' in parents"
            
        results = service.files().list(
            q=query,
            pageSize=20, 
            fields="nextPageToken, files(id, name, mimeType)",
            orderBy="modifiedTime desc"
        ).execute()
        
        items = results.get('files', [])

        if not items:
            return {"status": "success", "message": "No se encontraron archivos en Drive.", "downloaded": []}

        os.makedirs(DATA_DIR, exist_ok=True)
        downloaded_files = []

        for item in items:
            file_id = item['id']
            file_name = item['name']
            mime_type = item['mimeType']
            
            print(f"Descargando {file_name} ({file_id})...")
            
            # Manejar Google Docs nativos exportándolos a texto o PDF
            request = None
            if "application/vnd.google-apps" in mime_type:
                if mime_type == "application/vnd.google-apps.document":
                    request = service.files().export_media(fileId=file_id, mimeType='text/plain')
                    file_name += ".txt"
                elif mime_type == "application/vnd.google-apps.spreadsheet":
                    request = service.files().export_media(fileId=file_id, mimeType='text/csv')
                    file_name += ".csv"
                else:
                    print(f"Saltando archivo nativo no soportado: {file_name}")
                    continue
            else:
                request = service.files().get_media(fileId=file_id)
                
            file_path = os.path.join(DATA_DIR, file_name)
            fh = io.FileIO(file_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                
            downloaded_files.append(file_name)
            
        return {"status": "success", "message": f"Sincronizados {len(downloaded_files)} archivos exitosamente.", "downloaded": downloaded_files}

    except FileNotFoundError as fnf_error:
        return {"status": "error", "message": str(fnf_error)}
    except Exception as e:
        return {"status": "error", "message": f"Error conectando con Drive: {str(e)}"}

