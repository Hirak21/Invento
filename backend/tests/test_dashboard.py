from tests.test_purchases import make_item, purchase_payload
from tests.test_master_data import setup_refs


async def seed_two_units_with_activity(client, owner_headers):
    """Restaurant + Shop; sales/purchases/expenses in each. Returns ids."""
    bu1 = (await client.post("/api/business-units", json={"name": "Restaurant"}, headers=owner_headers)).json()
    cat = (await client.post("/api/categories", json={"name": "General"}, headers=owner_headers)).json()
    bu2 = (await client.post("/api/business-units", json={"name": "Shop"}, headers=owner_headers)).json()

    item_r = await make_item(client, owner_headers, bu1["id"], cat["id"], name="Rice", sku="RICE", opening=100)
    item_s = await make_item(client, owner_headers, bu2["id"], cat["id"], name="Coke", sku="COKE-D", opening=50)

    # Purchases: 10 @ 40 (R), 20 @ 35 (S)
    await client.post("/api/purchases", headers=owner_headers, json={
        "business_unit_id": bu1["id"], "items": [{"item_id": item_r["id"], "quantity": 10, "unit_cost": "40.00"}],
        "payment_method": "cash", "payment_status": "paid", "idempotency_key": "dash-pur-0001"})
    await client.post("/api/purchases", headers=owner_headers, json={
        "business_unit_id": bu2["id"], "items": [{"item_id": item_s["id"], "quantity": 20, "unit_cost": "35.00"}],
        "payment_method": "cash", "payment_status": "paid", "idempotency_key": "dash-pur-0002"})

    # Sales: 3 @ 60 (R) twice → qty 6 rev 360 ; 5 @ 45 (S)
    for key in ("dash-sale-001", "dash-sale-002"):
        await client.post("/api/sales", headers=owner_headers, json={
            "business_unit_id": bu1["id"], "items": [{"item_id": item_r["id"], "quantity": 3, "unit_price": "60.00"}],
            "payment_method": "cash", "idempotency_key": key})
    await client.post("/api/sales", headers=owner_headers, json={
        "business_unit_id": bu2["id"], "items": [{"item_id": item_s["id"], "quantity": 5, "unit_price": "45.00"}],
        "payment_method": "upi", "idempotency_key": "dash-sale-003"})

    # Expenses: 500 (R), 250 (S)
    await client.post("/api/expenses", headers=owner_headers, json={
        "business_unit_id": bu1["id"], "category": "utilities", "amount": "500.00",
        "payment_method": "upi", "description": "Power", "idempotency_key": "dash-exp-0001"})
    await client.post("/api/expenses", headers=owner_headers, json={
        "business_unit_id": bu2["id"], "category": "cleaning", "amount": "250.00",
        "payment_method": "cash", "description": "Cleaning", "idempotency_key": "dash-exp-0002"})

    return bu1, bu2, item_r, item_s


async def test_summary_totals_split_top_sellers(client, owner_headers):
    bu1, bu2, item_r, _ = await seed_two_units_with_activity(client, owner_headers)

    resp = await client.get("/api/dashboard/summary", headers=owner_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["totals"]["sales"] == "585.00"          # 180+180+225
    assert body["totals"]["purchases"] == "1100.00"     # 400+700
    assert body["totals"]["expenses"] == "750.00"
    assert body["totals"]["sale_count"] == 3

    split = {entry["name"]: entry for entry in body["business_split"]}
    assert split["Restaurant"]["sales"] == "360.00"
    assert split["Shop"]["sales"] == "225.00"

    top = body["top_selling"]
    assert top[0]["item_name"] == "Rice"
    assert top[0]["quantity_sold"] == 6
    assert top[0]["revenue"] == "360.00"

    activity_types = {entry["type"] for entry in body["recent_activity"]}
    assert {"sale", "purchase", "expense"} <= activity_types

    trend_dates = [point["date"] for point in body["sales_trend"]]
    assert len(trend_dates) >= 1


async def test_low_stock_listed_and_healthy_excluded(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    low_item = await make_item(client, owner_headers, bu_id, cat_id, name="Low Guy", sku="LOW-1", opening=3)
    healthy = await make_item(client, owner_headers, bu_id, cat_id, name="Fine Guy", sku="FINE-1", opening=99)

    body = (await client.get("/api/dashboard/summary", headers=owner_headers)).json()
    low_ids = [entry["item_id"] for entry in body["low_stock"]]
    assert low_item["id"] in low_ids
    assert healthy["id"] not in low_ids
    status_of = {e["item_id"]: e["status"] for e in body["low_stock"]}
    assert status_of[low_item["id"]] == "low"

    inventory_value = Decimal_check(body["totals"]["inventory_value"])
    # LowGuy: 3*35 + FineGuy: 99*35 = 102 * 35
    assert inventory_value == "3570.00"


def Decimal_check(value: str) -> str:
    from decimal import Decimal
    return str(Decimal(value).quantize(Decimal("0.01")))


async def test_period_filtering_excludes_old_transactions(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    item = await make_item(client, owner_headers, bu_id, cat_id, sku="PD-1")

    old_sale = {
        "business_unit_id": bu_id,
        "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "50.00"}],
        "payment_method": "cash",
        "date": "2020-01-15",
        "idempotency_key": "old-sale-00001",
    }
    await client.post("/api/sales", json=old_sale, headers=owner_headers)

    today_body = (
        await client.get("/api/dashboard/summary", params={"period": "today"}, headers=owner_headers)
    ).json()
    assert today_body["totals"]["sales"] == "0.00"

    custom_body = (
        await client.get(
            "/api/dashboard/summary",
            params={"period": "custom", "from": "2020-01-01", "to": "2020-01-31"},
            headers=owner_headers,
        )
    ).json()
    assert custom_body["totals"]["sales"] == "50.00"


async def test_custom_period_validation(client, owner_headers):
    resp = await client.get(
        "/api/dashboard/summary",
        params={"period": "custom"},
        headers=owner_headers,
    )
    assert resp.status_code == 422

    inverted = await client.get(
        "/api/dashboard/summary",
        params={"period": "custom", "from": "2026-08-10", "to": "2026-08-01"},
        headers=owner_headers,
    )
    assert inverted.status_code == 422


async def test_dashboard_requires_auth(client):
    resp = await client.get("/api/dashboard/summary")
    assert resp.status_code == 401


async def test_bu_filter_scopes_totals(client, owner_headers):
    bu1, bu2, *_ = await seed_two_units_with_activity(client, owner_headers)

    scoped = (
        await client.get(
            "/api/dashboard/summary", params={"business_unit_id": bu2["id"]}, headers=owner_headers
        )
    ).json()
    assert scoped["totals"]["sales"] == "225.00"
    assert scoped["totals"]["purchases"] == "700.00"
    assert scoped["totals"]["expenses"] == "250.00"
