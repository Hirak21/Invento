"""Bugfix verification tests (Bugs 1-4): conversion, rooms, menu, logo.

Each test proves a reported symptom is fixed; they double as the seed
fixtures for the positive cases (occupied room, menu item, logo).
"""
from tests.test_master_data import setup_refs

UNIQUE = {"n": 0}


def idem(prefix: str) -> str:
    UNIQUE["n"] += 1
    return f"{prefix}-{UNIQUE['n']:04d}"


async def make_item(client, owner_headers, bu_id, cat_id, **over):
    body = {
        "name": "Flour",
        "sku": f"SKU-{idem('s')}",
        "category_id": cat_id,
        "business_unit_id": bu_id,
        "item_type": "raw_material",
        "base_unit": "kg",
        "purchase_price": "40.00",
        "min_stock_level": 0,
        "opening_stock": 100,
    }
    body.update(over)
    resp = await client.post("/api/inventory/items", json=body, headers=owner_headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- Bug 1: kg -> g conversion + incompatible rejection ----------


async def test_recipe_kg_to_g_and_cost(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await make_item(client, owner_headers, bu_id, cat_id)
    resp = await client.post(
        "/api/recipes",
        json={
            "name": "Roti",
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
    assert body["recipe"]["estimated_cost"] == "20.00"  # 0.5 kg x 40.00

    listed = await client.get(
        "/api/recipes", params={"business_unit_id": bu_id}, headers=owner_headers
    )
    assert listed.json()[0]["recipe"]["estimated_cost"] == "20.00"

    updated = await client.patch(
        f"/api/recipes/{body['recipe']['id']}",
        json={"selling_price": "130.00"},
        headers=owner_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["recipe"]["selling_price"] == "130.00"


async def test_recipe_incompatible_unit_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    milk = await make_item(
        client, owner_headers, bu_id, cat_id, name="Milk", base_unit="litre",
        purchase_price="60.00", opening_stock=50,
    )
    recipe = await client.post(
        "/api/recipes", json={"name": "Kheer", "business_unit_id": bu_id},
        headers=owner_headers,
    )
    rid = recipe.json()["recipe"]["id"]
    resp = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": milk["id"], "quantity": 100, "unit": "g"},
        headers=owner_headers,
    )
    assert resp.status_code == 422
    assert "incompatible" in resp.json()["detail"].lower()


async def test_recipe_duplicate_line_rejected(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await make_item(client, owner_headers, bu_id, cat_id)
    recipe = await client.post(
        "/api/recipes", json={"name": "Roti", "business_unit_id": bu_id},
        headers=owner_headers,
    )
    rid = recipe.json()["recipe"]["id"]
    first = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": flour["id"], "quantity": 1, "unit": "kg"},
        headers=owner_headers,
    )
    assert first.status_code == 201
    dup = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": flour["id"], "quantity": 2, "unit": "kg"},
        headers=owner_headers,
    )
    assert dup.status_code == 409


# ---------- Bug 2: rooms property-level, occupancy, one charge ----------


async def test_room_property_level_and_single_charge(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    shop = await client.post(
        "/api/business-units", json={"name": "Shop"}, headers=owner_headers
    )
    shop_id = shop.json()["id"]

    room = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "101"},
        headers=owner_headers,
    )
    assert room.status_code == 201, room.text
    # Same number under another unit collides property-wide.
    dup = await client.post(
        "/api/rooms",
        json={"business_unit_id": shop_id, "room_number": "101"},
        headers=owner_headers,
    )
    assert dup.status_code == 409

    # Listed from the Restaurant unit (the reported Not Found path).
    listed = await client.get(
        "/api/rooms", params={"business_unit_id": bu_id}, headers=owner_headers
    )
    assert listed.json()["total"] == 1

    stay = await client.post(
        "/api/rooms/stays/check-in",
        json={"room_id": room.json()["id"], "guest_name": "Sharma"},
        headers=owner_headers,
    )
    assert stay.status_code == 201
    occupied = await client.get("/api/rooms", headers=owner_headers)
    assert occupied.json()["rooms"][0]["status"] == "occupied"

    # Positive fixture: an order to the room is exactly one pending charge,
    # and a double-submit with the same key is the same charge.
    _, cat_id = bu_id, None
    cats = await client.post("/api/categories", json={"name": "Food"}, headers=owner_headers)
    item = await make_item(
        client, owner_headers, bu_id, cats.json()["id"], name="Curry",
        sku=f"CU-{idem('c')}", item_type="shop_product", base_unit="pcs",
        purchase_price="10.00", opening_stock=50,
    )
    # make_item helper asserts 201 with selling_price None; set price via update
    await client.patch(
        f"/api/inventory/items/{item['id']}",
        json={"selling_price": "45.00"},
        headers=owner_headers,
    )
    payload = {
        "business_unit_id": bu_id,
        "items": [{"item_id": item["id"], "quantity": 2, "unit_price": "45.00"}],
        "payment_method": "room_charge",
        "stay_id": stay.json()["id"],
        "idempotency_key": idem("room-order"),
    }
    # freeze one key for both submits
    payload["idempotency_key"] = "bug2-double-submit-1"
    first = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert first.status_code == 201, first.text
    assert first.json()["order_status"] == "PENDING"
    second = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert second.json()["id"] == first.json()["id"]
    bill = await client.get(
        f"/api/rooms/stays/{stay.json()['id']}/bill", headers=owner_headers
    )
    assert bill.json()["charge_count"] == 1


# ---------- Bug 3: menu returns only active sellable recipes ----------


async def test_menu_only_active_recipes(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    flour = await make_item(client, owner_headers, bu_id, cat_id)
    for name, active in (("Live Thali", True), ("Retired Thali", False)):
        r = await client.post(
            "/api/recipes",
            json={
                "name": name, "business_unit_id": bu_id, "active": active,
                "selling_price": "150.00",
                "ingredients": [{"item_id": flour["id"], "quantity": 1, "unit": "kg"}],
            },
            headers=owner_headers,
        )
        assert r.status_code == 201, r.text
    menu = await client.get(
        f"/api/menu-items?business_unit_id={bu_id}", headers=owner_headers
    )
    names = [m["name"] for m in menu.json()]
    assert "Live Thali" in names and "Retired Thali" not in names
    live = next(m for m in menu.json() if m["name"] == "Live Thali")
    assert live["available"] is True and live["estimated_cost"] == "40.00"


# ---------- Bug 4: logo present vs missing ----------


async def test_settings_logo_present_and_missing(client, owner_headers):
    import base64

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    uri = "data:image/png;base64," + base64.b64encode(png).decode()

    # Missing: settings default to name-only, public logo 404s.
    default = await client.get("/api/settings", headers=owner_headers)
    assert default.json()["has_logo"] is False
    assert default.json()["business_name"] == "Invento"
    assert (await client.get("/api/settings/logo")).status_code == 404

    # Present: upload -> public bytes with content-type.
    up = await client.put(
        "/api/settings",
        json={"business_name": "Sharma Bhojanalaya", "logo_data_uri": uri},
        headers=owner_headers,
    )
    assert up.status_code == 200, up.text
    assert up.json()["has_logo"] is True
    assert up.json()["business_name"] == "Sharma Bhojanalaya"
    logo = await client.get("/api/settings/logo")
    assert logo.status_code == 200
    assert logo.headers["content-type"] == "image/png"
    assert logo.content == png
