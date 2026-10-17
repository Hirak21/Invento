from pydantic import BaseModel, Field

from app.models.user import UserOut


class LoginRequest(BaseModel):
    username: str
    password: str


class BootstrapOwnerRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)


class ChangeCredentialsRequest(BaseModel):
    """Self-service username/password change (Settings → Account).

    Always re-authenticates with the current password. Username and
    password are each optional, but at least one must be provided.
    """

    current_password: str = Field(min_length=1, max_length=128)
    new_username: str | None = Field(default=None, min_length=3, max_length=32)
    new_password: str | None = Field(default=None, min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BootstrapStatus(BaseModel):
    needs_bootstrap: bool
