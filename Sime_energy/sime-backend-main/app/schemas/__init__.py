"""
Schémas Pydantic pour la validation des données
"""

from .organisations import OrganisationCreate, OrganisationUpdate, OrganisationResponse
from .buildings import BuildingCreate, BuildingUpdate, BuildingResponse, BuildingTypeCreate, BuildingTypeResponse
from .equipments import EquipmentCreate, EquipmentUpdate, EquipmentResponse, EquipmentTypeCreate, EquipmentTypeResponse
from .users import UserCreate, UserUpdate, UserResponse, RoleCreate, RoleResponse
from .files import FileCreate, FileUpdate, FileResponse, FileTypeCreate, FileTypeResponse
from .measurements import MeasurementCreate, MeasurementUpdate, MeasurementResponse
from .invoices import InvoiceCreate, InvoiceUpdate, InvoiceResponse
from .logs import LogCreate, LogResponse
from .invoice_extractions import (
    InvoiceExtractionRawCreate, InvoiceExtractionRawResponse,
    InvoiceExtractionTempCreate, InvoiceExtractionTempResponse
)

__all__ = [
    # Organisations
    "OrganisationCreate", "OrganisationUpdate", "OrganisationResponse",
    # Buildings
    "BuildingCreate", "BuildingUpdate", "BuildingResponse", 
    "BuildingTypeCreate", "BuildingTypeResponse",
    # Equipments
    "EquipmentCreate", "EquipmentUpdate", "EquipmentResponse",
    "EquipmentTypeCreate", "EquipmentTypeResponse",
    # Users
    "UserCreate", "UserUpdate", "UserResponse",
    "RoleCreate", "RoleResponse",
    # Files
    "FileCreate", "FileUpdate", "FileResponse",
    "FileTypeCreate", "FileTypeResponse",
    # Measurements
    "MeasurementCreate", "MeasurementUpdate", "MeasurementResponse",
    # Invoices
    "InvoiceCreate", "InvoiceUpdate", "InvoiceResponse",
    # Logs
    "LogCreate", "LogResponse",
    # Invoice Extractions
    "InvoiceExtractionRawCreate", "InvoiceExtractionRawResponse",
    "InvoiceExtractionTempCreate", "InvoiceExtractionTempResponse"
]
