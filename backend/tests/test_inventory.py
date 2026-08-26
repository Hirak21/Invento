from app.core.config import get_settings
from app.db.mongo import get_mongo_client
from tests.test_master_data import setup_refs


async def item_payload(bu_id: str, cat_id: str, **overrides):
    base = {
        "name": "Rice (Basmati) 5kg",
        "sku": "RM-RICE-5K",
        "category_id": cat_id,
        "business_unit_id": bu_id,
        "item_type": "raw_material",
        "base_unit": "pcs",
        "purchase_price": "480.00",
        "selling_price": None,
        "min_stock_level": 5,
        "opening_stock": 25,
    }
    base.update(overrides)
    return {k: v for k, v in base.items() if v is not None}


async def test_create_item_with_opening_stock_creates_movement(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id, opening_stock=25),
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    item = resp.json()
    assert item["current_stock"] == 25
    assert item["status"] == "healthy"

    movements = await client.get(
        f"/api/inventory/items/{item['id']}/movements", headers=owner_headers
    )
    assert movements.status_code == 200
    data = movements.json()
    assert data["total"] == 1
    mv = data["movements"][0]
    assert mv["movement_type"] == "ADJUSTMENT_IN"
    assert mv["quantity"] == "25"
    assert mv["reference_type"] == "opening"


async def test_create_item_zero_opening_has_no_movement(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id, opening_stock=0),
        headers=owner_headers,
    )
    assert resp.status_code == 201
    item = resp.json()
    assert item["current_stock"] == 0
    assert item["status"] == "out"

    movements = await client.get(
        f"/api/inventory/items/{item['id']}/movements", headers=owner_headers
    )
    assert movements.json()["total"] == 0


async def test_item_invalid_category_rejected(client, owner_headers, staff_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    fake_cat = "0" * 24
    payload = await item_payload(bu_id, fake_cat)
    resp = await client.post("/api/inventory/items", json=payload, headers=owner_headers)
    assert resp.status_code == 422


async def test_item_invalid_unit_rejected_by_validation(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    payload = await item_payload(bu_id, cat_id, base_unit="bananas")
    resp = await client.post("/api/inventory/items", json=payload, headers=owner_headers)
    assert resp.status_code == 422


async def test_item_bad_money_format_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    payload = await item_payload(bu_id, cat_id, purchase_price="12.345")
    resp = await client.post("/api/inventory/items", json=payload, headers=owner_headers)
    assert resp.status_code == 422


async def test_duplicate_sku_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    first = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id),
        headers=owner_headers,
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id, name="Another rice"),
        headers=owner_headers,
    )
    assert second.status_code == 422
    assert "SKU" in second.json()["detail"]


async def test_staff_cannot_create_but_can_list_items(
    client, owner_headers, staff_headers
):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    denied = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id),
        headers=staff_headers,
    )
    assert denied.status_code == 403

    listing = await client.get("/api/inventory/items", headers=staff_headers)
    assert listing.status_code == 200


async def test_list_filters_and_status(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)

    # healthy: 25 stock vs min 5
    await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id, sku="A-1"),
        headers=owner_headers,
    )
    # low: 3 stock vs min 5
    low = await client.post(
        "/api/inventory/items",
        json=await item_payload(
            bu_id, cat_id, name="Low item", sku="B-2", opening_stock=3
        ),
        headers=owner_headers,
    )
    # out: 0 stock
    await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id, name="Out item", sku="C-3", opening_stock=0),
        headers=owner_headers,
    )

    all_items = await client.get("/api/inventory/items", headers=owner_headers)
    assert all_items.json()["total"] == 3

    low_only = await client.get(
        "/api/inventory/items", params={"status": "low"}, headers=owner_headers
    )
    names = [i["name"] for i in low_only.json()["items"]]
    assert names == ["Low item"]
    assert low_only.json()["items"][0]["id"] == low.json()["id"]

    out_only = await client.get(
        "/api/inventory/items", params={"status": "out"}, headers=owner_headers
    )
    assert [i["name"] for i in out_only.json()["items"]] == ["Out item"]

    search = await client.get(
        "/api/inventory/items", params={"search": "basmati"}, headers=owner_headers
    )
    assert search.json()["total"] == 1

    wrong_bu = await client.get(
        "/api/inventory/items",
        params={"business_unit_id": "0" * 24},
        headers=owner_headers,
    )
    assert wrong_bu.json()["total"] == 0


async def test_patch_and_deactivate_item(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    create = await client.post(
        "/api/inventory/items",
        json=await item_payload(bu_id, cat_id),
        headers=owner_headers,
    )
    item_id = create.json()["id"]

    renamed = await client.patch(
        f"/api/inventory/items/{item_id}",
        json={"min_stock_level": 10},
        headers=owner_headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["min_stock_level"] == 10

    deactivated = await client.patch(
        f"/api/inventory/items/{item_id}", json={"active": False}, headers=owner_headers
    )
    assert deactivated.status_code == 200

    default_listing = await client.get("/api/inventory/items", headers=owner_headers)
    assert default_listing.json()["total"] == 0
    with_inactive = await client.get(
        "/api/inventory/items",
        params={"include_inactive": "true"},
        headers=owner_headers,
    )
    assert with_inactive.json()["total"] == 1
