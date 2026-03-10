"""
Schémas Pydantic pour les équipements
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date

class EquipmentTypeBase(BaseModel):
    label: str = Field(..., max_length=255, description="Libellé du type d'équipement")

class EquipmentTypeCreate(EquipmentTypeBase):
    pass

class EquipmentTypeResponse(EquipmentTypeBase):
    equip_tp_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class EquipmentBase(BaseModel):
    building_id: int = Field(..., description="ID du bâtiment")
    equipment_tp_id: int = Field(..., description="ID du type d'équipement")
    status: Optional[str] = Field(None, max_length=20, description="Statut de l'équipement")
    date_instaled: Optional[date] = Field(None, description="Date d'installation")
    description: Optional[str] = Field(None, max_length=100, description="Description")

class EquipmentCreate(EquipmentBase):
    pass

class EquipmentUpdate(BaseModel):
    building_id: Optional[int] = None
    equipment_tp_id: Optional[int] = None
    status: Optional[str] = Field(None, max_length=20)
    date_instaled: Optional[date] = None
    description: Optional[str] = Field(None, max_length=100)

class EquipmentResponse(EquipmentBase):
    equipment_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
