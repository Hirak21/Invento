"""End-to-end regression tests for the production "Not Found" incidents.

Covers the required verification matrix:
  - recipe creation (inline gram BOM -> 201, bad item ref, bad unit)
  - room creation (valid 201, duplicate 409, bad unit 404/422)
  - orders-modal data sources on empty AND populated DB (200 with [])
  - business settings first-save (upsert) + update + logo limits
  - unit conversion incl. the ``l`` alias and incompatible rejection
  - health endpoint reports DB status
"""
import base64

from tests.test_master_data import setup_refs

MISSING_OID = "000000000000000000000001"


async def _make_item(client, owner_headers, bu_id, cat_id, **over):
    body = {
        "name": "E2E Item",
        "category_id": cat_id,
        "business_unit_id": bu_id,
        "item_type": "raw_material",
        "base_unit": "kg",
        "purchase_price": "40.00",
        "min_stock_level": 0,
        "opening_stock": 10,
    }
    body.update(over)
    resp = await client.post("/api/inventory/items", json=body, headers=owner_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- recipes: validate, verify refs, persist BOM, 201 ----------


async def test_recipe_create_inline_gram_bom(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await _make_item(client, owner_headers, bu_id, cat_id, name="Flour")
    resp = await client.post(
        "/api/recipes",
        json={
            "name": "Roti Thali",
            "business_unit_id": bu_id,
            "selling_price": "120.00",
            "ingredients": [{"item_id": flour["id"], "quantity": 500, "unit": "g"}],
        },
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    ing = body["ingredients"][0]
    assert ing["quantity"] == 0.5 and ing["unit"] == "kg"
    assert ing["entered_quantity"] == 500 and ing["entered_unit"] == "g"
    assert body["recipe"]["estimated_cost"] == "20.00"


async def test_recipe_create_bad_item_ref_rejected(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/recipes",
        json={
            "name": "Ghost Thali",
            "business_unit_id": bu_id,
            "ingredients": [{"item_id": MISSING_OID, "quantity": 1, "unit": "kg"}],
        },
        headers=owner_headers,
    )
    assert resp.status_code in (404, 422), resp.text


async def test_recipe_create_missing_unit_404(client, owner_headers):
    resp = await client.post(
        "/api/recipes",
        json={"name": "No Unit Thali", "business_unit_id": MISSING_OID},
        headers=owner_headers,
    )
    assert resp.status_code == 404, resp.text
    assert "Business unit" in resp.json()["detail"]


# ---------- rooms: valid / duplicate / bad unit ----------


async def test_room_create_valid_duplicate_bad_unit(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    first = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "102"},
        headers=owner_headers,
    )
    assert first.status_code == 201, first.text
    assert first.json()["room_number"] == "102"

    dup = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "102"},
        headers=owner_headers,
    )
    assert dup.status_code == 409, dup.text

    missing = await client.post(
        "/api/rooms",
        json={"business_unit_id": MISSING_OID, "room_number": "103"},
        headers=owner_headers,
    )
    assert missing.status_code == 404, missing.text

    malformed = await client.post(
        "/api/rooms",
        json={"business_unit_id": "not-an-id", "room_number": "104"},
        headers=owner_headers,
    )
    assert malformed.status_code == 422, malformed.text


# ---------- orders-modal data: empty -> [], populated -> rows ----------


async def test_orders_modal_sources_empty_db(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    rooms = await client.get("/api/rooms", headers=owner_headers)
    assert rooms.status_code == 200 and rooms.json() == {"rooms": [], "total": 0}
    stays = await client.get(
        "/api/rooms/stays", params={"status": "open"}, headers=owner_headers
    )
    assert stays.status_code == 200 and stays.json() == {"stays": [], "total": 0}
    menu = await client.get(
        "/api/menu-items", params={"business_unit_id": bu_id}, headers=owner_headers
    )
    assert menu.status_code == 200 and menu.json() == []


async def test_orders_modal_sources_populated(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    room = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "102"},
        headers=owner_headers,
    )
    stay = await client.post(
        "/api/rooms/stays/check-in",
        json={"room_id": room.json()["id"], "guest_name": "Sharma"},
        headers=owner_headers,
    )
    assert stay.status_code == 201, stay.text
    flour = await _make_item(
        client, owner_headers, bu_id, cat_id, name="Flour", selling_price="45.00",
        item_type="shop_product",
    )
    rooms = await client.get("/api/rooms", headers=owner_headers)
    assert rooms.json()["total"] == 1
    assert rooms.json()["rooms"][0]["status"] == "occupied"
    stays = await client.get(
        "/api/rooms/stays", params={"status": "open"}, headers=owner_headers
    )
    assert stays.json()["total"] == 1
    assert stays.json()["stays"][0]["guest_name"] == "Sharma"
    menu = await client.get(
        "/api/menu-items", params={"business_unit_id": bu_id}, headers=owner_headers
    )
    assert menu.status_code == 200
    assert any(m["name"] == flour["name"] for m in menu.json())


# ---------- business settings: first save, update, logo limits ----------


async def test_settings_first_save_and_update(client, owner_headers):
    # Empty DB: defaults, no logo.
    default = await client.get("/api/settings", headers=owner_headers)
    assert default.status_code == 200
    assert default.json()["business_name"] == "Invento"
    assert default.json()["has_logo"] is False

    # First save upserts the singleton.
    first = await client.put(
        "/api/settings", json={"business_name": "Sharma Bhojanalaya"},
        headers=owner_headers,
    )
    assert first.status_code == 200, first.text
    assert first.json()["business_name"] == "Sharma Bhojanalaya"

    # Update keeps the name when only the logo changes.
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    uri = "data:image/png;base64," + base64.b64encode(png).decode()
    with_logo = await client.put(
        "/api/settings", json={"logo_data_uri": uri}, headers=owner_headers
    )
    assert with_logo.status_code == 200, with_logo.text
    assert with_logo.json()["has_logo"] is True
    assert with_logo.json()["business_name"] == "Sharma Bhojanalaya"


async def test_settings_logo_limits(client, owner_headers):
    bad_type = await client.put(
        "/api/settings",
        json={"logo_data_uri": "data:text/plain;base64,aGk="},
        headers=owner_headers,
    )
    assert bad_type.status_code == 422, bad_type.text

    big = base64.b64encode(b"x" * 800_000).decode()
    too_big = await client.put(
        "/api/settings",
        json={"logo_data_uri": f"data:image/png;base64,{big}"},
        headers=owner_headers,
    )
    assert too_big.status_code == 422, too_big.text


# ---------- units: l alias, ml conversion, incompatible rejection ----------


async def test_unit_litre_alias_and_ml(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    milk = await _make_item(
        client, owner_headers, bu_id, cat_id, name="Milk",
        base_unit="l", purchase_price="60.00", opening_stock=50,
    )
    assert milk["base_unit"] == "l"

    compat = await client.get(
        f"/api/inventory/items/{milk['id']}/compatible-units", headers=owner_headers
    )
    assert compat.status_code == 200
    assert set(compat.json()["compatible_units"]) == {"l", "litre", "ml"}

    recipe = await client.post(
        "/api/recipes", json={"name": "Kheer", "business_unit_id": bu_id},
        headers=owner_headers,
    )
    rid = recipe.json()["recipe"]["id"]
    added = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": milk["id"], "quantity": 500, "unit": "ml"},
        headers=owner_headers,
    )
    assert added.status_code == 201, added.text
    ing = added.json()["ingredients"][0]
    assert ing["quantity"] == 0.5  # 500 ml -> 0.5 l canonical

    # g (mass) into a litre item is rejected (fresh item: no duplicate line).
    water = await _make_item(
        client, owner_headers, bu_id, cat_id, name="Water",
        base_unit="litre", purchase_price="0.00", opening_stock=50,
    )
    bad = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": water["id"], "quantity": 100, "unit": "g"},
        headers=owner_headers,
    )
    assert bad.status_code == 422
    assert "incompatible" in bad.json()["detail"].lower()


async def test_gram_recipe_sale_deducts_fractional_stock(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await _make_item(
        client, owner_headers, bu_id, cat_id, name="Flour", opening_stock=10
    )
    recipe = await client.post(
        "/api/recipes",
        json={
            "name": "Roti", "business_unit_id": bu_id, "selling_price": "30.00",
            "ingredients": [{"item_id": flour["id"], "quantity": 500, "unit": "g"}],
        },
        headers=owner_headers,
    )
    rid = recipe.json()["recipe"]["id"]
    sale = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": rid, "quantity": 2, "unit_price": "30.00"}],
            "payment_method": "cash",
            "idempotency_key": "e2e-gram-deduct-0001",
        },
        headers=owner_headers,
    )
    assert sale.status_code == 201, sale.text
    after = await client.get(
        f"/api/inventory/items/{flour['id']}", headers=owner_headers
    )
    assert after.json()["current_stock"] == 9.0  # 10 - 2 x 0.5 kg


# ---------- health reports DB status ----------


async def test_health_reports_db(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
