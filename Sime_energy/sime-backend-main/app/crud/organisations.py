from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.organisations import Organisation
from app.schemas.organisations import OrganisationCreate, OrganisationUpdate
from .base import CRUDBase


class CRUDOrganisation(CRUDBase[Organisation, OrganisationCreate, OrganisationUpdate]):
    def get_by_name(self, db: Session, *, organisation_name: str) -> Optional[Organisation]:
        return db.query(Organisation).filter(Organisation.organisation_name == organisation_name).first()

    def get_by_id(self, db: Session, *, org_id: int) -> Optional[Organisation]:
        return db.query(Organisation).filter(Organisation.org_id == org_id).first()


organisation_crud = CRUDOrganisation(Organisation, pk="org_id")


