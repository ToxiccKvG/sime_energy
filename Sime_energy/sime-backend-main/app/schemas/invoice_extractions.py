"""
Schémas Pydantic pour les extractions de factures
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, date
from decimal import Decimal

class InvoiceExtractionRawBase(BaseModel):
    file_id: int = Field(..., description="ID du fichier")
    field_name: Optional[str] = Field(None, max_length=255, description="Nom du champ")
    extracted_value: Optional[str] = Field(None, max_length=50, description="Valeur extraite")
    confidence_score: Optional[Decimal] = Field(None, description="Score de confiance")
    status: Optional[str] = Field(None, max_length=50, description="Statut")

class InvoiceExtractionRawCreate(InvoiceExtractionRawBase):
    pass

class InvoiceExtractionRawResponse(InvoiceExtractionRawBase):
    inv_ext_raw_id: int
    created_at: date
    
    class Config:
        from_attributes = True

class InvoiceExtractionTempBase(BaseModel):
    file_id: int = Field(..., description="ID du fichier")
    invoice_date: Optional[date] = Field(None, description="Date de la facture")
    energy: Optional[Decimal] = Field(None, description="Énergie")
    total_ammount: Optional[Decimal] = Field(None, description="Montant total")
    confidence_global: Optional[Decimal] = Field(None, description="Confiance globale")

class InvoiceExtractionTempCreate(InvoiceExtractionTempBase):
    pass

class InvoiceExtractionTempResponse(InvoiceExtractionTempBase):
    inv_ext_tmp_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
