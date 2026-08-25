from pydantic import BaseModel, Field

from app.models.user import UserOut


class LoginRequest(BaseModel):
    username: str
    password: str


class BootstrapOwnerRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BootstrapStatus(BaseModel):
    needs_bootstrap: bool
