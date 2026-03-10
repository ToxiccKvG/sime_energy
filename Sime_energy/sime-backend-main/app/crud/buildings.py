from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.buildings import Building, BuildingType
from app.schemas.buildings import BuildingCreate, BuildingUpdate, BuildingTypeCreate
from .base import CRUDBase


class CRUDBuilding(CRUDBase[Building, BuildingCreate, BuildingUpdate]):
    def get_by_id(self, db: Session, *, building_id: int) -> Optional[Building]:
        return db.query(Building).filter(Building.building_id == building_id).first()

    def get_by_organisation(self, db: Session, *, org_id: int, skip: int = 0, limit: int = 100) -> List[Building]:
        return db.query(Building).filter(Building.org_id == org_id).offset(skip).limit(limit).all()

    def get_by_type(self, db: Session, *, build_tp_id: int, skip: int = 0, limit: int = 100) -> List[Building]:
        return db.query(Building).filter(Building.build_tp_id == build_tp_id).offset(skip).limit(limit).all()


class CRUDBuildingType(CRUDBase[BuildingType, BuildingTypeCreate, BuildingTypeCreate]):
    def get_by_label(self, db: Session, *, label: str) -> Optional[BuildingType]:
        return db.query(BuildingType).filter(BuildingType.label == label).first()

    def get_by_id(self, db: Session, *, build_tp_id: int) -> Optional[BuildingType]:
        return db.query(BuildingType).filter(BuildingType.build_tp_id == build_tp_id).first()


building_crud = CRUDBuilding(Building, pk="building_id")
building_type_crud = CRUDBuildingType(BuildingType, pk="build_tp_id")


