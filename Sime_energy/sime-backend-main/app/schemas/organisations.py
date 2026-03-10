"""
Schémas Pydantic pour les organisations
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class OrganisationBase(BaseModel):
    organisation_name: str = Field(..., max_length=50, description="Nom de l'organisation")
    location: Optional[str] = Field(None, max_length=50, description="Localisation")
    contact_info: Optional[str] = Field(None, max_length=50, description="Informations de contact")

class OrganisationCreate(OrganisationBase):
    pass

class OrganisationUpdate(BaseModel):
    organisation_name: Optional[str] = Field(None, max_length=50)
    location: Optional[str] = Field(None, max_length=50)
    contact_info: Optional[str] = Field(None, max_length=50)

class OrganisationResponse(OrganisationBase):
    org_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
