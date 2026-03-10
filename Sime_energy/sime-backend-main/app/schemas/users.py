"""
Schémas Pydantic pour les utilisateurs
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from datetime import datetime, date

class RoleBase(BaseModel):
    label: str = Field(..., max_length=50, description="Libellé du rôle")

class RoleCreate(RoleBase):
    pass

class RoleResponse(RoleBase):
    role_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserBase(BaseModel):
    organisation_id: int = Field(..., description="ID de l'organisation")
    role_id: int = Field(..., description="ID du rôle")
    name: str = Field(..., max_length=50, description="Nom de l'utilisateur")
    login: str = Field(..., max_length=50, description="Login")
    email: EmailStr = Field(..., description="Email")
    lost_login: Optional[date] = Field(None, description="Date de dernière connexion")

class UserCreate(UserBase):
    password: str = Field(..., min_length=6, description="Mot de passe")

class UserUpdate(BaseModel):
    organisation_id: Optional[int] = None
    role_id: Optional[int] = None
    name: Optional[str] = Field(None, max_length=50)
    login: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6)
    lost_login: Optional[date] = None

class UserResponse(UserBase):
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
