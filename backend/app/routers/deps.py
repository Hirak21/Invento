from typing import Annotated

from bson import ObjectId
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.security import InvalidTokenError, decode_access_token
from app.db.mongo import get_db
from app.models.user import UserRole, user_out_from_doc
from app.utils.errors import ForbiddenError, UnauthorizedError

bearer_scheme = HTTPBearer(auto_error=False)

DBDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


async def get_current_user(
    db: DBDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> dict:
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError
    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidTokenError:
        raise UnauthorizedError from None
    try:
        user_id = ObjectId(payload["sub"])
    except Exception:
        raise UnauthorizedError from None
    user = await db.users.find_one({"_id": user_id})
    if user is None or not user.get("active", False):
        raise UnauthorizedError
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]


async def require_owner(user: CurrentUser) -> dict:
    if UserRole(user["role"]) != UserRole.OWNER:
        raise ForbiddenError("Only owners can perform this action.")
    return user
