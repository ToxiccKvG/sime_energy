"""
Schémas Pydantic pour les fichiers
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, time
from decimal import Decimal

class FileTypeBase(BaseModel):
    label: str = Field(..., max_length=50, description="Libellé du type de fichier")

class FileTypeCreate(FileTypeBase):
    pass

class FileTypeResponse(FileTypeBase):
    file_tp_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class FileBase(BaseModel):
    org_id: int = Field(..., description="ID de l'organisation")
    file_tp_id: Optional[int] = Field(None, description="ID du type de fichier")
    created_by: int = Field(..., description="ID de l'utilisateur créateur")
    filename: str = Field(..., max_length=255, description="Nom du fichier")
    size: Optional[Decimal] = Field(None, description="Taille en MB")
    version: Optional[int] = Field(1, description="Version du fichier")
    status: Optional[str] = Field("pending", max_length=20, description="Statut du fichier")

class FileCreate(FileBase):
    pass

class FileUpdate(BaseModel):
    org_id: Optional[int] = None
    file_tp_id: Optional[int] = None
    created_by: Optional[int] = None
    filename: Optional[str] = Field(None, max_length=255)
    size: Optional[Decimal] = None
    version: Optional[int] = None
    status: Optional[str] = Field(None, max_length=20)

class FileResponse(FileBase):
    file_id: int
    created_at: time
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
