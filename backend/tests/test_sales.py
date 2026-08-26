from tests.test_purchases import make_item, purchase_payload
from tests.test_master_data import setup_refs


async def seed_stock(client, owner_headers, stock=70):
    """BU + category + item with given opening stock; returns ids."""
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(
        client,
        owner_headers,
        bu_id,
        cat_id,
        name="Coke 750ml",
        sku="COKE-750",
        opening=stock,
    )
    return bu_id, cat_id, item


def sale_payload(bu_id, item_id, quantity=5, unit_price="45.00", key="sale-key-0001", **extra):
    body = {
        "business_unit_id": bu_id,
        "items": [{"item_id": item_id, "quantity": quantity, "unit_price": unit_price}],
        "payment_method": "cash",
        "idempotency_key": key,
    }
    body.update(extra)
    return body


async def get_item(client, headers, item_id):
    return (await client.get(f"/api/inventory/items/{item_id}", headers=headers)).json()


async def test_sale_reduces_stock_exactly_once(client, owner_headers):
    bu_id, cat_id, item = await seed_stock(client, owner_headers, stock=70)

    resp = await client.post(
        "/api/sales", json=sale_payload(bu_id, item["id"]), headers=owner_headers
    )
    assert resp.status_code == 201, resp.text
    sale = resp.json()
    assert sale["total_amount"] == "225.00"  # 5 x 45 server-computed
    assert sale["sale_number"].startswith("SAL-")

    updated = await get_item(client, owner_headers, item["id"])
    assert updated["current_stock"] == 65

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    sale_mv = next(m for m in movements["movements"] if m["movement_type"] == "SALE")
    assert sale_mv["quantity"] == "5"
    assert sale_mv["reference_type"] == "sale"
    # cost snapshot for margin reporting
    assert sale_mv["unit_cost"] == "35.00"


async def test_duplicate_sale_key_no_double_deduction(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=70)
    payload = sale_payload(bu_id, item["id"], key="dup-sale-key-1")

    first = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert first.status_code == 201
    second = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert second.json()["id"] == first.json()["id"]

    updated = await get_item(client, owner_headers, item["id"])
    assert updated["current_stock"] == 65  # NOT 60


async def test_insufficient_stock_rejected_atomically(client, owner_headers):
    bu_id, cat_id, item = await seed_stock(client, owner_headers, stock=3)
    other = await make_item(
        client, owner_headers, bu_id, cat_id, name="Chips", sku="CHIP-1", opening=100
    )

    # Two lines: valid one + one exceeding stock → whole sale must fail.
    resp = await client.post(
        "/api/sales",
        json=sale_payload(
            bu_id,
            item["id"],
            quantity=5,
            key="insuff-key-01",
            items=[
                {"item_id": other["id"], "quantity": 1, "unit_price": "20.00"},
                {"item_id": item["id"], "quantity": 5, "unit_price": "45.00"},
            ],
        ),
        headers=owner_headers,
    )
    assert resp.status_code == 422
    assert "Insufficient stock" in resp.json()["detail"]

    # No partial effects anywhere:
    chips_after = await get_item(client, owner_headers, other["id"])
    assert chips_after["current_stock"] == 100  # untouched

    history = await client.get("/api/sales", headers=owner_headers)
    assert history.json()["total"] == 0

    movements = (
        await client.get(f"/api/inventory/items/{other['id']}/movements", headers=owner_headers)
    ).json()
    assert movements["total"] == 1  # only its opening movement


async def test_discount_math_and_cap(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)

    ok = await client.post(
        "/api/sales",
        json=sale_payload(
            bu_id,
            item["id"],
            quantity=2,
            unit_price="50.00",
            discount="15.00",
            key="disc-key-001",
        ),
        headers=owner_headers,
    )
    assert ok.status_code == 201
    body = ok.json()
    assert body["subtotal"] == "100.00"
    assert body["discount"] == "15.00"
    assert body["total_amount"] == "85.00"

    too_much = await client.post(
        "/api/sales",
        json=sale_payload(bu_id, item["id"], unit_price="50.00", discount="999.00", key="disc-key-002"),
        headers=owner_headers,
    )
    assert too_much.status_code == 422


async def test_zero_quantity_rejected(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers)
    resp = await client.post(
        "/api/sales",
        json=sale_payload(bu_id, item["id"], quantity=0),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_cross_bu_and_inactive_rejected(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers)
    other_bu = (
        await client.post("/api/business-units", json={"name": "Second BU"}, headers=owner_headers)
    ).json()

    cross = await client.post(
        "/api/sales",
        json=sale_payload(other_bu["id"], item["id"], key="cross-key-01"),
        headers=owner_headers,
    )
    assert cross.status_code == 422

    await client.patch(
        f"/api/inventory/items/{item['id']}", json={"active": False}, headers=owner_headers
    )
    inactive = await client.post(
        "/api/sales", json=sale_payload(bu_id, item["id"], key="inact-key-01"), headers=owner_headers
    )
    assert inactive.status_code == 422


async def test_staff_can_record_sales_with_audit(client, owner_headers, staff_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    resp = await client.post(
        "/api/sales", json=sale_payload(bu_id, item["id"], key="staff-sale-01"), headers=staff_headers
    )
    assert resp.status_code == 201

    from app.core.config import get_settings
    from app.db.mongo import get_mongo_client

    db = get_mongo_client()[get_settings().mongo_db]
    audit = await db.audit_logs.find_one({"entity_type": "sale"})
    assert audit is not None and audit["actor_username"] == "staff"


async def test_list_filters_date_range(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=50)

    dated = sale_payload(bu_id, item["id"], key="dated-sale-01")
    dated["date"] = "2026-08-26"
    r1 = await client.post("/api/sales", json=dated, headers=owner_headers)
    assert r1.status_code == 201

    tomorrow = sale_payload(bu_id, item["id"], key="tmrw-sale-01")
    tomorrow["date"] = "2026-08-27"
    await client.post("/api/sales", json=tomorrow, headers=owner_headers)

    aug26 = await client.get(
        "/api/sales", params={"from": "2026-08-26", "to": "2026-08-26"}, headers=owner_headers
    )
    ids = [s["id"] for s in aug26.json()["sales"]]
    assert r1.json()["id"] in ids
    assert len(ids) == 1

    empty = await client.get(
        "/api/sales", params={"from": "2020-01-01", "to": "2020-01-02"}, headers=owner_headers
    )
    assert empty.json()["total"] == 0
