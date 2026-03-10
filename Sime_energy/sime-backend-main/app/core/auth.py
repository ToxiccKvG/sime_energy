from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthCredentials
from jose import JWTError, jwt
from config import settings

security = HTTPBearer()

async def verify_token(credentials: HTTPAuthCredentials = Depends(security)):
    """Vérifie le token JWT de Supabase"""
    token = credentials.credentials
    
    try:
        # Décode le token avec la clé secrète Supabase
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"]
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
        return {"user_id": user_id, "payload": payload}
    except JWTError:
        raise HTTPException(status_code=401, detail="Token expiré ou invalide")