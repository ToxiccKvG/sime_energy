"""
Schémas Pydantic pour les factures
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal

class InvoiceBase(BaseModel):
    building_id: int = Field(..., description="ID du bâtiment")
    invoice_date: date = Field(..., description="Date de la facture")
    energy_month_khw: Optional[Decimal] = Field(None, description="Énergie mensuelle en kWh")
    amount: Optional[Decimal] = Field(None, description="Montant de la facture")
    details: Optional[str] = Field(None, max_length=200, description="Détails")

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    building_id: Optional[int] = None
    invoice_date: Optional[date] = None
    energy_month_khw: Optional[Decimal] = None
    amount: Optional[Decimal] = None
    details: Optional[str] = Field(None, max_length=200)

class InvoiceResponse(InvoiceBase):
    invoice_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
