"""
Schémas Pydantic pour les bâtiments
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal

class BuildingTypeBase(BaseModel):
    label: str = Field(..., max_length=50, description="Libellé du type de bâtiment")

class BuildingTypeCreate(BuildingTypeBase):
    pass

class BuildingTypeResponse(BuildingTypeBase):
    build_tp_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class BuildingBase(BaseModel):
    org_id: int = Field(..., description="ID de l'organisation")
    build_tp_id: int = Field(..., description="ID du type de bâtiment")
    adress: Optional[str] = Field(None, max_length=255, description="Adresse")
    latitude: Optional[Decimal] = Field(None, description="Latitude")
    longitude: Optional[Decimal] = Field(None, description="Longitude")
    name: str = Field(..., max_length=255, description="Nom du bâtiment")
    construction_year: int = Field(..., description="Année de construction")
    description: Optional[str] = Field(None, max_length=200, description="Description")

class BuildingCreate(BuildingBase):
    pass

class BuildingUpdate(BaseModel):
    org_id: Optional[int] = None
    build_tp_id: Optional[int] = None
    adress: Optional[str] = Field(None, max_length=255)
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    name: Optional[str] = Field(None, max_length=255)
    construction_year: Optional[int] = None
    description: Optional[str] = Field(None, max_length=200)

class BuildingResponse(BuildingBase):
    building_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
