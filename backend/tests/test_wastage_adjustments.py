from tests.test_purchases import make_item
from tests.test_master_data import setup_refs


async def seed(client, headers, stock=30):
    bu_id, cat_id = await setup_refs(client, headers)
    item = await make_item(
        client, headers, bu_id, cat_id, name="Milk 1L", sku="MLK-1L", opening=stock
    )
    return bu_id, item


async def get_item(client, headers, item_id):
    return (await client.get(f"/api/inventory/items/{item_id}", headers=headers)).json()


def wastage_payload(bu_id, item_id, quantity=4, key="waste-key-001", **extra):
    body = {
        "business_unit_id": bu_id,
        "item_id": item_id,
        "quantity": quantity,
        "reason": "spoiled",
        "idempotency_key": key,
    }
    body.update(extra)
    return body


def adjustment_payload(bu_id, item_id, new_quantity, key="adj-key-001", **extra):
    body = {
        "business_unit_id": bu_id,
        "item_id": item_id,
        "new_quantity": new_quantity,
        "reason": "physical_count",
        "idempotency_key": key,
    }
    body.update(extra)
    return body


# ---------- wastage ----------


async def test_wastage_decreases_stock_and_records_value(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=30)

    resp = await client.post(
        "/api/wastage", json=wastage_payload(bu_id, item["id"]), headers=owner_headers
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["quantity"] == 4
    assert body["estimated_value"] == "140.00"  # 4 x 35.00 snapshot

    updated = await get_item(client, owner_headers, item["id"])
    assert updated["current_stock"] == 26

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    waste_mv = next(m for m in movements["movements"] if m["movement_type"] == "WASTAGE")
    assert waste_mv["quantity"] == "4"
    assert waste_mv["reference_type"] == "wastage"


async def test_wastage_insufficient_stock_rejected(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=2)
    resp = await client.post(
        "/api/wastage",
        json=wastage_payload(bu_id, item["id"], quantity=5),
        headers=owner_headers,
    )
    assert resp.status_code == 422
    assert "Insufficient stock" in resp.json()["detail"]
    assert (await get_item(client, owner_headers, item["id"]))["current_stock"] == 2


async def test_wastage_invalid_reason_rejected(client, owner_headers):
    bu_id, item = await seed(client, owner_headers)
    resp = await client.post(
        "/api/wastage",
        json=wastage_payload(bu_id, item["id"], reason="eaten_by_cat"),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_wastage_duplicate_key_noop(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=10)
    payload = wastage_payload(bu_id, item["id"], key="dup-waste-01")
    first = await client.post("/api/wastage", json=payload, headers=owner_headers)
    second = await client.post("/api/wastage", json=payload, headers=owner_headers)
    assert first.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert (await get_item(client, owner_headers, item["id"]))["current_stock"] == 6


async def test_wastage_list_filters(client, owner_headers):
    bu_id, item = await seed(client, owner_headers)
    dated = wastage_payload(bu_id, item["id"], key="waste-dated-01")
    dated["date"] = "2026-08-20"
    await client.post("/api/wastage", json=dated, headers=owner_headers)

    aug20 = await client.get(
        "/api/wastage", params={"from": "2026-08-20", "to": "2026-08-20"}, headers=owner_headers
    )
    assert aug20.json()["total"] == 1

    empty = await client.get(
        "/api/wastage", params={"from": "2020-01-01", "to": "2020-01-02"}, headers=owner_headers
    )
    assert empty.json()["total"] == 0


# ---------- adjustments ----------


async def test_adjustment_up_and_down_with_movements(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=5)

    up = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 12, key="adj-up-001"),
        headers=owner_headers,
    )
    assert up.status_code == 201
    assert up.json()["previous_quantity"] == 5
    assert up.json()["delta"] == 7
    assert (await get_item(client, owner_headers, item["id"]))["current_stock"] == 12

    down = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 9, key="adj-down-001"),
        headers=owner_headers,
    )
    assert down.status_code == 201
    assert down.json()["delta"] == -3
    assert (await get_item(client, owner_headers, item["id"]))["current_stock"] == 9

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    adj_types = sorted(m["movement_type"] for m in movements["movements"] if m["reference_type"] == "adjustment")
    assert adj_types == ["ADJUSTMENT_IN", "ADJUSTMENT_OUT"]  # positive quantities both


async def test_adjustment_same_quantity_rejected(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=7)
    resp = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 7, key="adj-same-001"),
        headers=owner_headers,
    )
    assert resp.status_code == 422
    assert "nothing to adjust" in resp.json()["detail"]


async def test_staff_adjustment_limit_enforced(client, owner_headers, staff_headers):
    bu_id, item = await seed(client, owner_headers, stock=50)

    # Staff within policy (delta -8 ≤ limit 10): allowed.
    small = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 42, key="staff-small-01"),
        headers=staff_headers,
    )
    assert small.status_code == 201

    # Staff beyond policy (delta +40 > 10): forbidden.
    big = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 82, key="staff-big-001"),
        headers=staff_headers,
    )
    assert big.status_code == 403

    # Owner unlimited: same correction allowed.
    owner_big = await client.post(
        "/api/stock-adjustments",
        json=adjustment_payload(bu_id, item["id"], 82, key="owner-big-01"),
        headers=owner_headers,
    )
    assert owner_big.status_code == 201


async def test_adjustment_duplicate_key_noop(client, owner_headers):
    bu_id, item = await seed(client, owner_headers, stock=10)
    payload = adjustment_payload(bu_id, item["id"], 15, key="dup-adj-01")
    first = await client.post("/api/stock-adjustments", json=payload, headers=owner_headers)
    second = await client.post("/api/stock-adjustments", json=payload, headers=owner_headers)
    assert first.status_code == 201
    assert second.json()["id"] == first.json()["id"]
    assert (await get_item(client, owner_headers, item["id"]))["current_stock"] == 15
