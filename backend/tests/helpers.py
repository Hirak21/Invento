from app.core.config import get_settings
from app.db.mongo import get_mongo_client


async def make_item(
    client,
    owner_headers,
    bu_id,
    cat_id,
    name="Coke 750ml",
    sku="CK-750",
    opening=50,
    selling_price="45.00",
):
    resp = await client.post(
        "/api/inventory/items",
        json={
            "name": name,
            "sku": sku,
            "category_id": cat_id,
            "business_unit_id": bu_id,
            "item_type": "raw_material",
            "base_unit": "g",
            "purchase_price": "35.00",
            "selling_price": selling_price,
            "min_stock_level": 10,
            "opening_stock": opening,
        },
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def make_raw_item(
    client,
    owner_headers,
    bu_id,
    cat_id,
    name="Atta 1kg",
    sku="RAW-001",
    opening=5000,
    selling_price=None,
    base_unit="g",
    purchase_price="40.00",
):
    resp = await client.post(
        "/api/inventory/items",
        json={
            "name": name,
            "sku": sku,
            "category_id": cat_id,
            "business_unit_id": bu_id,
            "item_type": "raw_material",
            "base_unit": base_unit,
            "purchase_price": purchase_price,
            "selling_price": selling_price,
            "min_stock_level": 0,
            "opening_stock": opening,
        },
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()
