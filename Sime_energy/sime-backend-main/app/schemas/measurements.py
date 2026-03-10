"""
Schémas Pydantic pour les mesures
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, time
from decimal import Decimal

class MeasurementBase(BaseModel):
    building_id: int = Field(..., description="ID du bâtiment")
    timestamp: time = Field(..., description="Heure de la mesure")
    value: Decimal = Field(..., description="Valeur de la mesure")
    measure_type: str = Field(..., max_length=50, description="Type de mesure")
    comment: Optional[str] = Field(None, max_length=100, description="Commentaire")

class MeasurementCreate(MeasurementBase):
    pass

class MeasurementUpdate(BaseModel):
    building_id: Optional[int] = None
    timestamp: Optional[time] = None
    value: Optional[Decimal] = None
    measure_type: Optional[str] = Field(None, max_length=50)
    comment: Optional[str] = Field(None, max_length=100)

class MeasurementResponse(MeasurementBase):
    id_measurement: int
    created_at: datetime
    
    class Config:
        from_attributes = True
