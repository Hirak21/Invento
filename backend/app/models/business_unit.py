from datetime import datetime

from pydantic import BaseModel, Field


class BusinessUnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    location: str | None = Field(default=None, max_length=200)


class BusinessUnitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    location: str | None = Field(default=None, max_length=200)
    active: bool | None = None


class BusinessUnitOut(BaseModel):
    id: str
    name: str
    location: str | None
    active: bool
    created_at: datetime
