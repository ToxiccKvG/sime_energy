from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.files import File, FileType
from app.schemas.files import FileCreate, FileUpdate, FileTypeCreate
from .base import CRUDBase


class CRUDFile(CRUDBase[File, FileCreate, FileUpdate]):
    def get_by_id(self, db: Session, *, file_id: int) -> Optional[File]:
        return db.query(File).filter(File.file_id == file_id).first()

    def get_by_filename(self, db: Session, *, filename: str) -> Optional[File]:
        return db.query(File).filter(File.filename == filename).first()

    def get_by_organisation(self, db: Session, *, org_id: int, skip: int = 0, limit: int = 100) -> List[File]:
        return db.query(File).filter(File.org_id == org_id).offset(skip).limit(limit).all()

    def get_by_type(self, db: Session, *, file_tp_id: int, skip: int = 0, limit: int = 100) -> List[File]:
        return db.query(File).filter(File.file_tp_id == file_tp_id).offset(skip).limit(limit).all()

    def get_by_status(self, db: Session, *, status: str, skip: int = 0, limit: int = 100) -> List[File]:
        return db.query(File).filter(File.status == status).offset(skip).limit(limit).all()

    def get_by_creator(self, db: Session, *, created_by: int, skip: int = 0, limit: int = 100) -> List[File]:
        return db.query(File).filter(File.created_by == created_by).offset(skip).limit(limit).all()


class CRUDFileType(CRUDBase[FileType, FileTypeCreate, FileTypeCreate]):
    def get_by_label(self, db: Session, *, label: str) -> Optional[FileType]:
        return db.query(FileType).filter(FileType.label == label).first()

    def get_by_id(self, db: Session, *, file_tp_id: int) -> Optional[FileType]:
        return db.query(FileType).filter(FileType.file_tp_id == file_tp_id).first()


file_crud = CRUDFile(File, pk="file_id")
file_type_crud = CRUDFileType(FileType, pk="file_tp_id")


