from datetime import datetime

from pydantic import BaseModel, Field


class BusinessSettingsOut(BaseModel):
    business_name: str
    has_logo: bool
    # Same-origin <img> src (or "data-uri-embedded" marker is never sent;
    # this is a usable URL or None).
    logo_url: str | None
    # Absolute URL for thermal/printed/shared receipts (None when no logo).
    logo_absolute_url: str | None
    logo_updated_at: datetime | None = None


class BusinessSettingsUpdate(BaseModel):
    business_name: str | None = Field(default=None, max_length=120)
    # Upload path: data:image/...;base64,... (preferred, travels with the DB).
    logo_data_uri: str | None = None
    # ...or an externally hosted absolute https URL.
    logo_url: str | None = None
    remove_logo: bool = False
