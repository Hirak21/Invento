from fastapi import APIRouter
from fastapi.responses import RedirectResponse, Response

from app.models.business_settings import BusinessSettingsOut, BusinessSettingsUpdate
from app.routers.deps import CurrentUser, DBDep
from app.routers.deps import OwnerUser as OwnerDep
from app.services import settings_service
from app.utils.audit import log_audit


router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=BusinessSettingsOut)
async def get_settings_endpoint(db: DBDep, user: CurrentUser) -> BusinessSettingsOut:
    doc = await settings_service.get_settings_doc(db)
    return BusinessSettingsOut(**settings_service.settings_out(doc))


@router.put("", response_model=BusinessSettingsOut)
async def update_settings_endpoint(
    payload: BusinessSettingsUpdate, db: DBDep, user: OwnerDep
) -> BusinessSettingsOut:
    out = await settings_service.update_settings(
        db,
        business_name=payload.business_name,
        logo_data_uri=payload.logo_data_uri,
        logo_url=payload.logo_url,
        remove_logo=payload.remove_logo,
    )
    await log_audit(
        db,
        actor_id=str(user["_id"]),
        actor_username=user["username"],
        action="update",
        entity_type="business_settings",
        entity_id="global",
        after={"business_name": out["business_name"], "has_logo": out["has_logo"]},
    )
    return BusinessSettingsOut(**out)


@router.get("/logo")
async def public_logo(db: DBDep):
    """Stable PUBLIC logo route (no auth — receipts share/print it).

    - DB-embedded logo -> image bytes with content-type.
    - External logo URL -> 302 redirect (normalized off localhost).
    - No logo -> 404 JSON (templates show the business name instead).
    """
    redirect = await settings_service.logo_redirect(db)
    if redirect:
        return RedirectResponse(url=redirect, status_code=302)
    try:
        blob, content_type = await settings_service.logo_bytes(db)
    except Exception:
        from app.utils.errors import NotFoundError

        raise NotFoundError("No logo has been uploaded.") from None
    return Response(content=blob, media_type=content_type)
