from tests.test_master_data import setup_refs


def expense_payload(bu_id, key="exp-key-0001", **extra):
    body = {
        "business_unit_id": bu_id,
        "category": "utilities",
        "amount": "1250.50",
        "payment_method": "upi",
        "payment_status": "paid",
        "description": "Electricity bill",
        "payee": "BESCOM",
        "idempotency_key": key,
    }
    body.update(extra)
    return body


async def test_create_expense_with_number_and_audit(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/expenses", json=expense_payload(bu_id), headers=owner_headers
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["expense_number"].startswith("EXP-")
    assert body["amount"] == "1250.50"
    assert body["category"] == "utilities"

    from app.core.config import get_settings
    from app.db.mongo import get_mongo_client

    db = get_mongo_client()[get_settings().mongo_db]
    audit = await db.audit_logs.find_one({"entity_type": "expense"})
    assert audit is not None


async def test_bad_money_rejected(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/expenses",
        json=expense_payload(bu_id, amount="12.999"),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_invalid_category_rejected(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/expenses",
        json=expense_payload(bu_id, category="bribery"),
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_duplicate_key_returns_original(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    payload = expense_payload(bu_id, key="dup-exp-0001")
    first = await client.post("/api/expenses", json=payload, headers=owner_headers)
    second = await client.post("/api/expenses", json=payload, headers=owner_headers)
    assert first.status_code == 201
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    listing = await client.get("/api/expenses", headers=owner_headers)
    assert listing.json()["total"] == 1  # only one record stored


async def test_list_filters_and_total_amount(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)

    r1 = await client.post(
        "/api/expenses", json=expense_payload(bu_id, key="flt-exp-0001"), headers=owner_headers
    )
    dated = expense_payload(bu_id, category="rent", amount="15000.00", key="flt-exp-0002")
    dated["date"] = "2026-08-20"
    r2 = await client.post("/api/expenses", json=dated, headers=owner_headers)
    assert r2.status_code == 201

    all_exp = await client.get("/api/expenses", headers=owner_headers)
    assert all_exp.json()["total"] == 2
    assert all_exp.json()["total_amount"] == "16250.50"

    rent_only = await client.get("/api/expenses", params={"category": "rent"}, headers=owner_headers)
    assert rent_only.json()["total"] == 1

    aug20 = await client.get(
        "/api/expenses", params={"from": "2026-08-20", "to": "2026-08-20"}, headers=owner_headers
    )
    assert [e["id"] for e in aug20.json()["records"]] == [r2.json()["id"]]

    by_bu = await client.get(
        "/api/expenses", params={"business_unit_id": bu_id}, headers=owner_headers
    )
    assert by_bu.json()["total"] == 2

    detail = await client.get(f"/api/expenses/{r1.json()['id']}", headers=owner_headers)
    assert detail.status_code == 200
    assert detail.json()["payee"] == "BESCOM"


async def test_staff_can_record_expenses(client, owner_headers, staff_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/expenses", json=expense_payload(bu_id, key="staff-exp-001"), headers=staff_headers
    )
    assert resp.status_code == 201
