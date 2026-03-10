from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.logs import Log
from app.schemas.logs import LogCreate
from .base import CRUDBase


class CRUDLog(CRUDBase[Log, LogCreate, LogCreate]):
    def get_by_id(self, db: Session, *, log_id: int) -> Optional[Log]:
        return db.query(Log).filter(Log.log_id == log_id).first()

    def get_by_file(self, db: Session, *, file_id: int, skip: int = 0, limit: int = 100) -> List[Log]:
        return db.query(Log).filter(Log.file_id == file_id).offset(skip).limit(limit).all()

    def get_by_user(self, db: Session, *, user_id: int, skip: int = 0, limit: int = 100) -> List[Log]:
        return db.query(Log).filter(Log.user_id == user_id).offset(skip).limit(limit).all()

    def get_by_action(self, db: Session, *, action: str, skip: int = 0, limit: int = 100) -> List[Log]:
        return db.query(Log).filter(Log.action == action).offset(skip).limit(limit).all()


log_crud = CRUDLog(Log, pk="log_id")


