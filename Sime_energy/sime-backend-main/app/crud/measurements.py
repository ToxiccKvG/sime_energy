from typing import List, Optional
from datetime import time
from sqlalchemy.orm import Session
from app.models.measurements import Measurement
from app.schemas.measurements import MeasurementCreate, MeasurementUpdate
from .base import CRUDBase


class CRUDMeasurement(CRUDBase[Measurement, MeasurementCreate, MeasurementUpdate]):
    def get_by_id(self, db: Session, *, id_measurement: int) -> Optional[Measurement]:
        return db.query(Measurement).filter(Measurement.id_measurement == id_measurement).first()

    def get_by_building(self, db: Session, *, building_id: int, skip: int = 0, limit: int = 100) -> List[Measurement]:
        return db.query(Measurement).filter(Measurement.building_id == building_id).offset(skip).limit(limit).all()

    def get_by_type(self, db: Session, *, measure_type: str, skip: int = 0, limit: int = 100) -> List[Measurement]:
        return db.query(Measurement).filter(Measurement.measure_type == measure_type).offset(skip).limit(limit).all()

    def get_by_timestamp_range(
        self,
        db: Session,
        *,
        start_time: time,
        end_time: time,
        skip: int = 0,
        limit: int = 100
    ) -> List[Measurement]:
        return db.query(Measurement).filter(
            Measurement.timestamp >= start_time,
            Measurement.timestamp <= end_time
        ).offset(skip).limit(limit).all()


measurement_crud = CRUDMeasurement(Measurement, pk="id_measurement")


