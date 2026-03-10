"""
Schémas Pydantic pour les logs
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, time

class LogBase(BaseModel):
    file_id: int = Field(..., description="ID du fichier")
    user_id: int = Field(..., description="ID de l'utilisateur")
    action: Optional[str] = Field(None, max_length=50, description="Action effectuée")
    message: Optional[str] = Field(None, max_length=100, description="Message du log")

class LogCreate(LogBase):
    pass

class LogResponse(LogBase):
    log_id: int
    timestamp: time
    created_at: datetime
    
    class Config:
        from_attributes = True
