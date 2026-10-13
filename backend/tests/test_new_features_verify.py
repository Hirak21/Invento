from tests.test_master_data import setup_refs
from tests.test_purchases import make_item, purchase_payload


async def test_purchase_gst_math_and_persistence(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    payload = purchase_payload(bu_id, item["id"], quantity=10, unit_cost="100.00", key="gst-key-0001")
    payload["items"][0]["gst_percent"] = 2.5
    resp = await client.post("/api/purchases", json=payload, headers=owner_headers)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    # 10 x 100 = 1000 subtotal, 2.5% GST = 25, total 1025
    assert body["subtotal_amount"] == "1000.00", body
    assert body["gst_amount"] == "25.00", body
    assert body["total_amount"] == "1025.00", body
    assert body["items"][0]["gst_percent"] == 2.5
    assert body["items"][0]["gst_amount"] == "25.00"
    # persisted: refetch detail
    detail = await client.get(f"/api/purchases/{body['id']}", headers=owner_headers)
    assert detail.json()["gst_amount"] == "25.00"
    assert detail.json()["total_amount"] == "1025.00"


async def test_purchase_legacy_no_gst_defaults_zero(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/purchases", json=purchase_payload(bu_id, item["id"], key="gst-key-0002"),
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["total_amount"] == "700.00"
    assert body["gst_amount"] == "0.00"
    assert body["items"][0]["gst_percent"] == 0


async def test_clear_due_flow(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id)
    p1 = purchase_payload(bu_id, item["id"], key="due-key-0001")
    p1["payment_status"] = "pending"
    r1 = await client.post("/api/purchases", json=p1, headers=owner_headers)
    assert r1.status_code == 201
    p2 = purchase_payload(bu_id, item["id"], key="due-key-0002")
    p2["payment_status"] = "pending"
    r2 = await client.post("/api/purchases", json=p2, headers=owner_headers)
    assert r2.status_code == 201

    pending = await client.get("/api/purchases", params={"payment_status": "pending"}, headers=owner_headers)
    assert pending.json()["total"] == 2

    settle = await client.patch(
        f"/api/purchases/{r1.json()['id']}/payment-status",
        json={"payment_status": "paid"}, headers=owner_headers,
    )
    assert settle.status_code == 200
    assert settle.json()["payment_status"] == "paid"

    pending2 = await client.get("/api/purchases", params={"payment_status": "pending"}, headers=owner_headers)
    assert pending2.json()["total"] == 1
    assert pending2.json()["purchases"][0]["id"] == r2.json()["id"]


async def test_expense_staff_salary_and_custom_category(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    # categories endpoint includes staff_salary
    cats = await client.get("/api/expenses/categories", headers=owner_headers)
    assert cats.status_code == 200, cats.text
    slugs = [c["slug"] for c in cats.json()]
    assert "staff_salary" in slugs

    # staff salary expense
    resp = await client.post("/api/expenses", json={
        "business_unit_id": bu_id, "category": "staff_salary", "amount": "5000.00",
        "payment_method": "cash", "payment_status": "paid",
        "description": "Cook salary Aug", "idempotency_key": "sal-key-0001",
    }, headers=owner_headers)
    assert resp.status_code == 201, resp.text
    assert resp.json()["category"] == "staff_salary"

    # custom category CRUD
    created = await client.post("/api/expenses/categories", json={"name": "Festival Gifts"}, headers=owner_headers)
    assert created.status_code == 201, created.text
    assert created.json()["slug"] == "festival_gifts"

    used = await client.post("/api/expenses", json={
        "business_unit_id": bu_id, "category": "festival_gifts", "amount": "200.00",
        "payment_method": "cash", "payment_status": "paid",
        "description": "Diwali gifts", "idempotency_key": "sal-key-0002",
    }, headers=owner_headers)
    assert used.status_code == 201, used.text

    # unknown still rejected
    bad = await client.post("/api/expenses", json={
        "business_unit_id": bu_id, "category": "bribery", "amount": "10.00",
        "payment_method": "cash", "payment_status": "paid",
        "description": "bad", "idempotency_key": "sal-key-0003",
    }, headers=owner_headers)
    assert bad.status_code == 422

    # delete in-use custom -> deactivated, history intact
    rm = await client.delete("/api/expenses/categories/festival_gifts", headers=owner_headers)
    assert rm.status_code == 204, rm.text
    detail = await client.get(f"/api/expenses/{used.json()['id']}", headers=owner_headers)
    assert detail.json()["category"] == "festival_gifts"

    # built-in cannot be deleted
    rm2 = await client.delete("/api/expenses/categories/rent", headers=owner_headers)
    assert rm2.status_code == 422
