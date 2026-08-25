from fastapi import APIRouter

from app.core.security import create_access_token, hash_password, verify_password
from app.models.auth import BootstrapOwnerRequest, BootstrapStatus, LoginRequest, TokenResponse
from app.models.user import UserRole, UserOut, utc_now, user_out_from_doc
from app.routers.deps import CurrentUser, DBDep
from app.utils.audit import log_audit
from app.utils.errors import BusinessRuleError, ConflictError, UnauthorizedError

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
async def login(payload: LoginRequest, db: DBDep) -> TokenResponse:
    username = payload.username.strip().lower()
    user = await db.users.find_one({"username": username})
    if user is None or not verify_password(payload.password, user.get("password_hash", "")):
        raise UnauthorizedError("Invalid username or password.")
    if not user.get("active", False):
        raise UnauthorizedError("This account has been deactivated.")
    token = create_access_token(subject=str(user["_id"]), role=user["role"])
    return TokenResponse(access_token=token, user=user_out_from_doc(user))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser) -> UserOut:
    return user_out_from_doc(user)
