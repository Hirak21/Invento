from fastapi import APIRouter

from app.models.enums import ItemType, Unit
from app.routers.deps import CurrentUser

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/units")
async def list_units(user: CurrentUser) -> list[str]:
    return [unit.value for unit in Unit]


@router.get("/item-types")
async def list_item_types(user: CurrentUser) -> list[dict[str, str]]:
    return [
        {"value": item_type.value, "label": ITEM_TYPE_LABELS[item_type]}
        for item_type in ItemType
    ]


ITEM_TYPE_LABELS = {
    ItemType.SHOP_PRODUCT: "Shop Product",
    ItemType.RAW_MATERIAL: "Raw Material",
    ItemType.PACKAGING: "Packaging",
    ItemType.OTHER: "Other",
}
