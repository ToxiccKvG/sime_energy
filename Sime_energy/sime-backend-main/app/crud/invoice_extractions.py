from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.invoice_extractions import InvoiceExtractionRaw, InvoiceExtractionTemp
from app.schemas.invoice_extractions import (
    InvoiceExtractionRawCreate,
    InvoiceExtractionTempCreate,
)
from .base import CRUDBase


class CRUDInvoiceExtractionRaw(CRUDBase[InvoiceExtractionRaw, InvoiceExtractionRawCreate, InvoiceExtractionRawCreate]):
    def get_by_id(self, db: Session, *, inv_ext_raw_id: int) -> Optional[InvoiceExtractionRaw]:
        return db.query(InvoiceExtractionRaw).filter(InvoiceExtractionRaw.inv_ext_raw_id == inv_ext_raw_id).first()

    def get_by_file(self, db: Session, *, file_id: int, skip: int = 0, limit: int = 100) -> List[InvoiceExtractionRaw]:
        return db.query(InvoiceExtractionRaw).filter(InvoiceExtractionRaw.file_id == file_id).offset(skip).limit(limit).all()


class CRUDInvoiceExtractionTemp(CRUDBase[InvoiceExtractionTemp, InvoiceExtractionTempCreate, InvoiceExtractionTempCreate]):
    def get_by_id(self, db: Session, *, inv_ext_tmp_id: int) -> Optional[InvoiceExtractionTemp]:
        return db.query(InvoiceExtractionTemp).filter(InvoiceExtractionTemp.inv_ext_tmp_id == inv_ext_tmp_id).first()

    def get_by_file(self, db: Session, *, file_id: int, skip: int = 0, limit: int = 100) -> List[InvoiceExtractionTemp]:
        return db.query(InvoiceExtractionTemp).filter(InvoiceExtractionTemp.file_id == file_id).offset(skip).limit(limit).all()


invoice_extraction_raw_crud = CRUDInvoiceExtractionRaw(InvoiceExtractionRaw, pk="inv_ext_raw_id")
invoice_extraction_temp_crud = CRUDInvoiceExtractionTemp(InvoiceExtractionTemp, pk="inv_ext_tmp_id")


