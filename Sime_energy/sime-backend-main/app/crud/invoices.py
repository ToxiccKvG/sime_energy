from typing import List, Optional
from datetime import date
from sqlalchemy.orm import Session
from app.models.invoices import Invoice
from app.schemas.invoices import InvoiceCreate, InvoiceUpdate
from .base import CRUDBase


class CRUDInvoice(CRUDBase[Invoice, InvoiceCreate, InvoiceUpdate]):
    def get_by_id(self, db: Session, *, invoice_id: int) -> Optional[Invoice]:
        return db.query(Invoice).filter(Invoice.invoice_id == invoice_id).first()

    def get_by_building(self, db: Session, *, building_id: int, skip: int = 0, limit: int = 100) -> List[Invoice]:
        return db.query(Invoice).filter(Invoice.building_id == building_id).offset(skip).limit(limit).all()

    def get_by_date_range(
        self,
        db: Session,
        *,
        start_date: date,
        end_date: date,
        skip: int = 0,
        limit: int = 100
    ) -> List[Invoice]:
        return db.query(Invoice).filter(
            Invoice.invoice_date >= start_date,
            Invoice.invoice_date <= end_date
        ).offset(skip).limit(limit).all()


invoice_crud = CRUDInvoice(Invoice, pk="invoice_id")


