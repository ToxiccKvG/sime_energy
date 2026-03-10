from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.equipments import Equipment, EquipmentType
from app.schemas.equipments import EquipmentCreate, EquipmentUpdate, EquipmentTypeCreate
from .base import CRUDBase


class CRUDEquipment(CRUDBase[Equipment, EquipmentCreate, EquipmentUpdate]):
    def get_by_id(self, db: Session, *, equipment_id: int) -> Optional[Equipment]:
        return db.query(Equipment).filter(Equipment.equipment_id == equipment_id).first()

    def get_by_building(self, db: Session, *, building_id: int, skip: int = 0, limit: int = 100) -> List[Equipment]:
        return db.query(Equipment).filter(Equipment.building_id == building_id).offset(skip).limit(limit).all()

    def get_by_type(self, db: Session, *, equipment_tp_id: int, skip: int = 0, limit: int = 100) -> List[Equipment]:
        return db.query(Equipment).filter(Equipment.equipment_tp_id == equipment_tp_id).offset(skip).limit(limit).all()


class CRUDEquipmentType(CRUDBase[EquipmentType, EquipmentTypeCreate, EquipmentTypeCreate]):
    def get_by_label(self, db: Session, *, label: str) -> Optional[EquipmentType]:
        return db.query(EquipmentType).filter(EquipmentType.label == label).first()

    def get_by_id(self, db: Session, *, equip_tp_id: int) -> Optional[EquipmentType]:
        return db.query(EquipmentType).filter(EquipmentType.equip_tp_id == equip_tp_id).first()


equipment_crud = CRUDEquipment(Equipment, pk="equipment_id")
equipment_type_crud = CRUDEquipmentType(EquipmentType, pk="equip_tp_id")


