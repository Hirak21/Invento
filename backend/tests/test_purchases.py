from tests.test_master_data import setup_refs

IDEM = "test-idem-key-0001"


async def make_item(client, owner_headers, bu_id, cat_id, name="Coke 750ml", sku="CK-750", opening=50):
    resp = await client.post(
        "/api/inventory/items",
        json={
            "name": name,
            "sku": sku,
            "category_id": cat_id,
            "business_unit_id": bu_id,
            "item_type": "shop_product",
            "base_unit": "pcs",
            "purchase_price": "35.00",
            "selling_price": "45.00",
            "min_stock_level": 10,
            "opening_stock": opening,
        },
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def purchase_payload(bu_id, item_id, quantity=20, unit_cost="35.00", key=IDEM):
    return {
        "business_unit_id": bu_id,
        "supplier_id": None,
        "items": [{"item_id": item_id, "quantity": quantity, "unit_cost": unit_cost}],
        "payment_method": "cash",
        "payment_status": "paid",
        "idempotency_key": key,
    }


async def get_item(client, owner_headers, item_id):
    return (await client.get(f"/api/inventory/items/{item_id}", headers=owner_headers)).json()


# ---------- happy path ----------


async def test_purchase_increases_stock_and_creates_movement(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    assert item["current_stock"] == 50

    resp = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, item["id"]), headers=owner_headers
    )
    assert resp.status_code == 201, resp.text
    purchase = resp.json()

    assert purchase["total_amount"] == "700.00"  # 20 x 35 server-computed
    assert purchase["items"][0]["line_total"] == "700.00"
    assert purchase["purchase_number"].startswith("PUR-")

    updated = await get_item(client, owner_headers, item["id"])
    assert updated["current_stock"] == 70  # exactly once

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    assert movements["total"] == 2
    types = {m["movement_type"] for m in movements["movements"]}
    assert types == {"ADJUSTMENT_IN", "PURCHASE"}
    purchase_mv = next(m for m in movements["movements"] if m["movement_type"] == "PURCHASE")
    assert purchase_mv["quantity"] == "20"
    assert purchase_mv["unit_cost"] == "35.00"
    assert purchase_mv["reference_type"] == "purchase"


async def test_duplicate_idempotency_key_no_double_stock(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)

    first = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, item["id"]), headers=owner_headers
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, item["id"]), headers=owner_headers
    )
    # Same purchase returned, not a new one.
    assert second.status_code == 200 or second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    updated = await get_item(client, owner_headers, item["id"])
    assert updated["current_stock"] == 70  # NOT 90

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    purchase_count = sum(
        1 for m in movements["movements"] if m["movement_type"] == "PURCHASE"
    )
    assert purchase_count == 1


async def test_purchase_numbers_sequence(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    a = await make_item(client, owner_headers, bu_id, cat_id, sku="A-100")
    b = await make_item(client, owner_headers, bu_id, cat_id, name="Chips", sku="B-200")

    r1 = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, a["id"], key="key-seq-1"), headers=owner_headers
    )
    r2 = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, b["id"], key="key-seq-2"), headers=owner_headers
    )
    n1, n2 = r1.json()["purchase_number"], r2.json()["purchase_number"]
    assert int(n2.split("-")[-1]) == int(n1.split("-")[-1]) + 1


# ---------- validation ----------


async def test_zero_quantity_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/purchases",
        json=purchase_payload(bu_id, item["id"], quantity=0),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_bad_money_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/purchases",
        json=purchase_payload(bu_id, item["id"], unit_cost="35.123"),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_cross_business_unit_item_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    other_bu = (await client.post("/api/business-units", json={"name": "Other"}, headers=owner_headers)).json()
    item = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/purchases",
        json=purchase_payload(other_bu["id"], item["id"]),
        headers=owner_headers,
    )
    assert resp.status_code == 422
    assert "does not belong" in resp.json()["detail"]


async def test_inactive_item_cannot_receive_stock(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    await client.patch(
        f"/api/inventory/items/{item['id']}", json={"active": False}, headers=owner_headers
    )
    resp = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, item["id"]), headers=owner_headers
    )
    assert resp.status_code == 422


# ---------- roles & audit ----------


async def test_staff_can_record_purchases(client, owner_headers, staff_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/purchases",
        json=purchase_payload(bu_id, item["id"], key="staff-key-001"),
        headers=staff_headers,
    )
    assert resp.status_code == 201

    from app.core.config import get_settings
    from app.db.mongo import get_mongo_client

    db = get_mongo_client()[get_settings().mongo_db]
    audit = await db.audit_logs.find_one({"entity_type": "purchase"})
    assert audit is not None
    assert audit["actor_username"] == "staff"


# ---------- list & detail ----------


async def test_list_filters_date_range_and_supplier(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    supplier = (
        await client.post("/api/suppliers", json={"name": "Sup Co"}, headers=owner_headers)
    ).json()

    dated = purchase_payload(bu_id, item["id"], key="dated-key-01")
    dated["date"] = "2026-08-26"
    dated["supplier_id"] = supplier["id"]
    r1 = await client.post("/api/purchases", json=dated, headers=owner_headers)
    assert r1.status_code == 201

    tomorrow = purchase_payload(bu_id, item["id"], key="tmrw-key-001")
    tomorrow["date"] = "2026-08-27"
    today = await client.post("/api/purchases", json=tomorrow, headers=owner_headers)

    by_supplier = await client.get(
        "/api/purchases", params={"supplier_id": supplier["id"]}, headers=owner_headers
    )
    assert by_supplier.json()["total"] == 1
    assert by_supplier.json()["purchases"][0]["id"] == r1.json()["id"]

    aug26 = await client.get(
        "/api/purchases",
        params={"from": "2026-08-26", "to": "2026-08-26"},
        headers=owner_headers,
    )
    ids = [p["id"] for p in aug26.json()["purchases"]]
    assert r1.json()["id"] in ids and today.json()["id"] not in ids

    empty = await client.get(
        "/api/purchases", params={"from": "2020-01-01", "to": "2020-01-02"}, headers=owner_headers
    )
    assert empty.json()["total"] == 0

    detail = await client.get(f"/api/purchases/{r1.json()['id']}", headers=owner_headers)
    assert detail.status_code == 200
    assert detail.json()["supplier_name"] == "Sup Co"
