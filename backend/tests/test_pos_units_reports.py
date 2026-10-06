"""Task coverage: priced-item filter, recipes-only menu, decimal qty,
plate/cup units, and IST custom-range report totals (incl. midnight edge)."""

import os
from datetime import datetime

from app.db.mongo import get_mongo_client
from tests.test_master_data import setup_refs
from tests.test_purchases import get_item, make_item


def _db():
    return get_mongo_client()[os.environ["MONGO_DB"]]


# ---------- 1. undefined-price filter (backend query + endpoint) ----------


async def test_priced_filter_hides_null_empty_zero(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    priced = await make_item(client, owner_headers, bu_id, cat_id, name="Priced", sku="PRZ-1")
    raw = await make_item(
        client, owner_headers, bu_id, cat_id, name="Raw Null", sku="RAW-N",
        opening=10,
    )
    # Force the raw item's price to null explicitly (helper defaults sell 45).
    db = _db()
    from app.services.ledger import oid

    await db.inventory_items.update_one({"_id": oid(raw["id"])}, {"$set": {"selling_price": None}})
    # Legacy docs: empty-string and zero prices straight in the collection.
    await db.inventory_items.insert_many([
        {
            "name": "Legacy Empty", "sku": "LEG-E", "category_id": cat_id,
            "business_unit_id": bu_id, "item_type": "shop_product",
            "base_unit": "pcs", "purchase_price": "10.00", "selling_price": "",
            "min_stock_level": 0, "current_stock": 5, "active": True,
            "created_at": datetime.now(), "updated_at": datetime.now(),
        },
        {
            "name": "Legacy Zero", "sku": "LEG-Z", "category_id": cat_id,
            "business_unit_id": bu_id, "item_type": "shop_product",
            "base_unit": "pcs", "purchase_price": "10.00", "selling_price": "0.00",
            "min_stock_level": 0, "current_stock": 5, "active": True,
            "created_at": datetime.now(), "updated_at": datetime.now(),
        },
    ])

    filtered = (
        await client.get(
            "/api/inventory/items", params={"has_selling_price": "true"}, headers=owner_headers
        )
    ).json()
    names = {i["name"] for i in filtered["items"]}
    assert priced["name"] in names
    assert "Raw Null" not in names
    assert "Legacy Empty" not in names
    assert "Legacy Zero" not in names

    # No deletion: the unfiltered list still holds every record.
    everything = (await client.get("/api/inventory/items", headers=owner_headers)).json()
    assert {i["name"] for i in everything["items"]} >= {
        priced["name"], "Raw Null", "Legacy Empty", "Legacy Zero",
    }


# ---------- menu = recipes only ----------


async def test_menu_lists_recipes_only(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await make_item(
        client, owner_headers, bu_id, cat_id, name="Flour", sku="FLR-9",
        opening=5000,
    )
    shop = await make_item(
        client, owner_headers, bu_id, cat_id, name="Shop Cookie", sku="CK-9",
        opening=20,
    )
    assert shop["selling_price"] == "45.00"
    recipe = (
        await client.post(
            "/api/recipes",
            json={"name": "Flatbread", "business_unit_id": bu_id, "selling_price": "60.00"},
            headers=owner_headers,
        )
    ).json()
    rid = recipe["recipe"]["id"]
    ing = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": flour["id"], "quantity": 200},
        headers=owner_headers,
    )
    assert ing.status_code == 201, ing.text

    menu = (
        await client.get("/api/menu-items", params={"business_unit_id": bu_id}, headers=owner_headers)
    ).json()
    assert len(menu) >= 1
    assert {m["type"] for m in menu} == {"recipe"}
    assert "Flatbread" in {m["name"] for m in menu}
    assert "Shop Cookie" not in {m["name"] for m in menu}


# ---------- 5. decimal kg/g quantities ----------


async def test_decimal_kg_opening_purchase_sale_exact(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(
        client, owner_headers, bu_id, cat_id, name="Sugar", sku="SGR-D",
        opening=12.375,
    )
    assert item["current_stock"] == 12.375

    pur = await client.post(
        "/api/purchases",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 5.25, "unit_cost": "40.00"}],
            "payment_method": "cash", "payment_status": "paid",
            "idempotency_key": "dec-pur-0001",
        },
        headers=owner_headers,
    )
    assert pur.status_code == 201, pur.text

    sale = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 0.5, "unit_price": "50.00"}],
            "payment_method": "cash",
            "idempotency_key": "dec-sale-0001",
        },
        headers=owner_headers,
    )
    assert sale.status_code == 201, sale.text
    assert sale.json()["items"][0]["quantity"] == 0.5

    updated = await get_item(client, owner_headers, item["id"])
    # 12.375 + 5.25 - 0.5 = 17.125 exactly (Decimal128 storage, no float drift).
    assert abs(updated["current_stock"] - 17.125) < 1e-9


async def test_sale_quantity_zero_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id, name="Tea", sku="TEA-0")
    resp = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 0, "unit_price": "10.00"}],
            "payment_method": "cash",
            "idempotency_key": "zero-sale-0001",
        },
        headers=owner_headers,
    )
    assert resp.status_code == 422


# ---------- 4. plate / cup base units ----------


async def test_plate_cup_units_accepted_unknown_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    for unit, sku in (("plate", "PLT-1"), ("cup", "CUP-1")):
        resp = await client.post(
            "/api/inventory/items",
            json={
                "name": f"Serving {unit}", "sku": sku, "category_id": cat_id,
                "business_unit_id": bu_id, "item_type": "shop_product",
                "base_unit": unit, "purchase_price": "20.00",
                "selling_price": "49.00", "min_stock_level": 0, "opening_stock": 10,
            },
            headers=owner_headers,
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["base_unit"] == unit

    bad = await client.post(
        "/api/inventory/items",
        json={
            "name": "Bowl Thing", "sku": "BWL-1", "category_id": cat_id,
            "business_unit_id": bu_id, "item_type": "shop_product",
            "base_unit": "bowl", "purchase_price": "20.00",
            "selling_price": "49.00", "min_stock_level": 0, "opening_stock": 10,
        },
        headers=owner_headers,
    )
    assert bad.status_code == 422

    plate = (
        await client.get("/api/inventory/items", params={"search": "Serving plate"}, headers=owner_headers)
    ).json()["items"][0]
    compat = (
        await client.get(
            f"/api/inventory/items/{plate['id']}/compatible-units", headers=owner_headers
        )
    ).json()
    assert compat["compatible_units"] == ["plate"]


# ---------- 6. report totals on custom range + midnight edge ----------


def test_custom_ist_range_boundaries():
    from app.services.dashboard_service import resolve_custom_ist_range

    start, end = resolve_custom_ist_range("2026-01-02", "2026-01-02")
    # Single IST day: exactly 24h, midnight-to-midnight Asia/Kolkata.
    assert (end - start).total_seconds() == 86400
    from zoneinfo import ZoneInfo

    ist = ZoneInfo("Asia/Kolkata")
    assert start.astimezone(ist).hour == 0
    assert start.astimezone(ist).minute == 0
    # 00:00:00.000 IST .. 23:59:59.999 IST == half-open [start, end):
    # 2026-01-02 00:00 IST is 2026-01-01 18:30 UTC.
    assert (start.year, start.month, start.day, start.hour, start.minute) == (2026, 1, 1, 18, 30)
    assert (end.year, end.month, end.day, end.hour, end.minute) == (2026, 1, 2, 18, 30)


async def test_reports_summary_custom_range_totals_match_rows(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id, name="Samosa", sku="SAM-1", opening=50)
    sale = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 2, "unit_price": "30.00"}],
            "discount": "5.00",
            "payment_method": "cash",
            "idempotency_key": "rep-sale-0001",
        },
        headers=owner_headers,
    )
    assert sale.status_code == 201, sale.text

    today = datetime.now().strftime("%Y-%m-%d")
    body = (
        await client.get(
            "/api/reports/summary",
            params={"period": "custom", "from": "2020-01-01", "to": "2020-01-02"},
            headers=owner_headers,
        )
    ).json()
    # Empty range: zeros, not NaN/None.
    assert body["totals"] == {
        "gross": "0.00", "discounts": "0.00", "tax": "0.00",
        "net": "0.00", "orders": 0, "quantity": 0,
    }
    assert body["items"] == []

    wide = (
        await client.get(
            "/api/reports/summary",
            params={"period": "custom", "from": "2020-01-01", "to": today},
            headers=owner_headers,
        )
    ).json()
    assert wide["totals"]["gross"] == "60.00"
    assert wide["totals"]["discounts"] == "5.00"
    assert wide["totals"]["net"] == "55.00"
    assert wide["totals"]["orders"] == 1
    assert wide["totals"]["quantity"] == 2
    # Top totals equal the sum of the rows.
    assert sum(float(r["revenue"]) for r in wide["items"]) == float(wide["totals"]["gross"])
    assert sum(r["quantity_sold"] for r in wide["items"]) == wide["totals"]["quantity"]
