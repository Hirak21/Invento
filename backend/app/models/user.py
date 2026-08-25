from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(UTC)


class UserRole(str, Enum):
    OWNER = "owner"
    STAFF = "staff"


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    full_name: str = Field(min_length=1, max_length=120)
    role: UserRole


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: UserRole | None = None
    active: bool | None = None


class PasswordChange(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(UserBase):
    id: str
    active: bool
    created_at: datetime


def user_out_from_doc(doc: dict[str, Any]) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        username=doc["username"],
        full_name=doc["full_name"],
        role=UserRole(doc["role"]),
        active=doc.get("active", True),
        created_at=doc["created_at"],
    )
