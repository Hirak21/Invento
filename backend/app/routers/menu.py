from typing import Any

from fastapi import APIRouter, Query

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.recipe import MenuItemOut
from app.routers.deps import CurrentUser, DBDep
from app.services.menu_service import list_menu_items


router = APIRouter(prefix="/menu-items", tags=["menu"])


@router.get("", response_model=list[MenuItemOut])
async def list_menu_items_endpoint(
    db: DBDep,
    user: CurrentUser,
    business_unit_id: str = Query(..., description="Business unit ID (required)"),
) -> list[MenuItemOut]:
    raw = await list_menu_items(db, business_unit_id=business_unit_id)
    return [MenuItemOut(**item) for item in raw]
