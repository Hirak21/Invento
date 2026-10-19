from typing import Any

from fastapi import APIRouter, Request

from app.core.security import create_access_token, hash_password, verify_password
from app.models.auth import (
    BootstrapOwnerRequest,
    BootstrapStatus,
    ChangeCredentialsRequest,
    LoginRequest,
    TokenResponse,
)
from app.models.user import UserRole, UserOut, utc_now, user_out_from_doc
from app.routers.deps import CurrentUser, DBDep
from app.utils.audit import log_audit
from app.utils.errors import BusinessRuleError, ConflictError, ForbiddenError, UnauthorizedError
from app.utils.rate_limit import login_limiter

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/needs-bootstrap", response_model=BootstrapStatus)
async def needs_bootstrap(db: DBDep) -> BootstrapStatus:
    count = await db.users.count_documents({})
    return BootstrapStatus(needs_bootstrap=count == 0)


@router.post("/bootstrap-owner", response_model=TokenResponse)
async def bootstrap_owner(payload: BootstrapOwnerRequest, db: DBDep) -> TokenResponse:
    """Create the first owner account. Only allowed while no users exist."""
    if await db.users.count_documents({}) > 0:
        raise ConflictError("An owner account already exists.")

    username = payload.username.strip().lower()
    doc = {
        "username": username,
        "full_name": username.title(),
        "role": UserRole.OWNER.value,
        "password_hash": hash_password(payload.password),
        "active": True,
        "created_at": utc_now(),
    }
    result = await db.users.insert_one(doc)
    user = {**doc, "_id": result.inserted_id}

    await log_audit(
        db,
        actor_id=str(result.inserted_id),
        actor_username=username,
        action="create",
        entity_type="user",
        entity_id=str(result.inserted_id),
        notes="Bootstrap owner account",
    )

    token = create_access_token(subject=str(result.inserted_id), role=user["role"])
    return TokenResponse(access_token=token, user=user_out_from_doc(user))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: DBDep, request: Request) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    login_limiter.check(client_ip)

    username = payload.username.strip().lower()
    user = await db.users.find_one({"username": username})
    if user is None or not verify_password(payload.password, user.get("password_hash", "")):
        login_limiter.record_failure(client_ip)
        raise UnauthorizedError("Invalid username or password.")
    login_limiter.clear(client_ip)
    if not user.get("active", False):
        raise UnauthorizedError("This account has been deactivated.")
    token = create_access_token(subject=str(user["_id"]), role=user["role"])
    return TokenResponse(access_token=token, user=user_out_from_doc(user))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_out_from_doc(user)


@router.patch("/me", response_model=UserOut)
async def change_credentials(
    payload: ChangeCredentialsRequest, db: DBDep, user: CurrentUser
) -> UserOut:
    """Change your own username and/or password (Settings → Account).

    Re-authenticates with the current password. A wrong current password
    returns 403 (not 401) so the client does not treat it as an expired
    session and log the user out.
    """
    if payload.new_username is None and payload.new_password is None:
        raise BusinessRuleError("Provide a new username or a new password.")
    if not verify_password(payload.current_password, user.get("password_hash", "")):
        raise ForbiddenError("Current password is incorrect.")

    updates: dict[str, Any] = {}
    changed: list[str] = []
    if payload.new_username is not None:
        username = payload.new_username.strip().lower()
        existing = await db.users.find_one({"username": username})
        if existing is not None and str(existing["_id"]) != str(user["_id"]):
            raise ConflictError("That username is already taken.")
        if username != user["username"]:
            updates["username"] = username
            changed.append("username")
    if payload.new_password is not None:
        updates["password_hash"] = hash_password(payload.new_password)
        changed.append("password")

    if not updates:
        raise BusinessRuleError("Nothing to change.")

    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    updated = await db.users.find_one({"_id": user["_id"]})
    assert updated is not None
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=updated["username"],
        action="update",
        entity_type="user",
        entity_id=str(user["_id"]),
        notes=f"Changed {' & '.join(changed)} (self-service)",
    )
    return user_out_from_doc(updated)
