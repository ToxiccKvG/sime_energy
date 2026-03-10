from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.users import User, Role
from app.schemas.users import UserCreate, UserUpdate, RoleCreate
from .base import CRUDBase


class CRUDUser(CRUDBase[User, UserCreate, UserUpdate]):
    def get_by_id(self, db: Session, *, user_id: int) -> Optional[User]:
        return db.query(User).filter(User.user_id == user_id).first()

    def get_by_email(self, db: Session, *, email: str) -> Optional[User]:
        return db.query(User).filter(User.email == email).first()

    def get_by_login(self, db: Session, *, login: str) -> Optional[User]:
        return db.query(User).filter(User.login == login).first()

    def get_by_organisation(self, db: Session, *, organisation_id: int, skip: int = 0, limit: int = 100) -> List[User]:
        return db.query(User).filter(User.organisation_id == organisation_id).offset(skip).limit(limit).all()

    def get_by_role(self, db: Session, *, role_id: int, skip: int = 0, limit: int = 100) -> List[User]:
        return db.query(User).filter(User.role_id == role_id).offset(skip).limit(limit).all()


class CRUDRole(CRUDBase[Role, RoleCreate, RoleCreate]):
    def get_by_label(self, db: Session, *, label: str) -> Optional[Role]:
        return db.query(Role).filter(Role.label == label).first()

    def get_by_id(self, db: Session, *, role_id: int) -> Optional[Role]:
        return db.query(Role).filter(Role.role_id == role_id).first()


user_crud = CRUDUser(User, pk="user_id")
role_crud = CRUDRole(Role, pk="role_id")


