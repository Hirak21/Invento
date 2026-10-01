from datetime import datetime

from pydantic import BaseModel, Field


class UnitType(str):
    RESTAURANT = "restaurant"
    RETAIL = "retail"


UNIT_TYPE_VALUES = (UnitType.RESTAURANT, UnitType.RETAIL)


class BusinessUnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    location: str | None = Field(default=None, max_length=200)
    # Safe default: retail (Items tab). Owners switch food units to
    # restaurant via Settings; the migration infers existing units from data.
    unit_type: str = Field(default=UnitType.RETAIL, pattern="^(restaurant|retail)$")


class BusinessUnitUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    location: str | None = Field(default=None, max_length=200)
    active: bool | None = None
    unit_type: str | None = Field(default=None, pattern="^(restaurant|retail)$")


class BusinessUnitOut(BaseModel):
    id: str
    name: str
    location: str | None
    active: bool
    unit_type: str
    created_at: datetime
