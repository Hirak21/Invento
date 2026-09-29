from tests.test_master_data import setup_refs
from tests.test_sales import make_item, seed_stock

UNIQUE = {"n": 0}


def idem(prefix: str) -> str:
    UNIQUE["n"] += 1
    return f"{prefix}-{UNIQUE['n']:04d}"


async def make_room(client, owner_headers, bu_id, number: str):
    resp = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": number},
        headers=owner_headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def check_in_room(client, headers, room_id: str, guest: str = "Test Guest"):
    resp = await client.post(
        "/api/rooms/stays/check-in",
        json={"room_id": room_id, "guest_name": guest},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------- rooms CRUD ----------


async def test_create_and_list_rooms(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    await make_room(client, owner_headers, bu_id, "101")
    await make_room(client, owner_headers, bu_id, "102")

    listing = await client.get("/api/rooms", params={"business_unit_id": bu_id}, headers=owner_headers)
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 2
    assert [r["room_number"] for r in body["rooms"]] == ["101", "102"]
    assert all(r["status"] == "free" for r in body["rooms"])


async def test_duplicate_room_number_rejected(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    await make_room(client, owner_headers, bu_id, "201")
    dup = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "201"},
        headers=owner_headers,
    )
    assert dup.status_code == 409


async def test_staff_cannot_create_room(client, owner_headers, staff_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    resp = await client.post(
        "/api/rooms",
        json={"business_unit_id": bu_id, "room_number": "301"},
        headers=staff_headers,
    )
    assert resp.status_code == 403


# ---------- check-in / occupancy ----------


async def test_check_in_marks_room_occupied(client, owner_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    room = await make_room(client, owner_headers, bu_id, "401")
    stay = await check_in_room(client, owner_headers, room["id"], "Sharma")

    assert stay["status"] == "open"
    assert stay["room_number"] == "401"

    listing = await client.get("/api/rooms", params={"business_unit_id": bu_id}, headers=owner_headers)
    statuses = {r["id"]: r["status"] for r in listing.json()["rooms"]}
    assert statuses[room["id"]] == "occupied"


async def test_double_check_in_rejected(client, owner_headers, staff_headers):
    bu_id, _ = await setup_refs(client, owner_headers)
    room = await make_room(client, owner_headers, bu_id, "402")
    await check_in_room(client, owner_headers, room["id"], "First Guest")

    second = await client.post(
        "/api/rooms/stays/check-in",
        json={"room_id": room["id"], "guest_name": "Second Guest"},
        headers=staff_headers,
    )
    assert second.status_code == 409


async def test_checkout_frees_room_and_blocks_new_charges(client, owner_headers):
    bu_id, cat_id, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "501")
    stay = await check_in_room(client, owner_headers, room["id"], "Guest Five")
    charge = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 2, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "stay_id": stay["id"],
            "idempotency_key": idem("room-charge"),
        },
        headers=owner_headers,
    )
    assert charge.status_code == 201, charge.text

    out = await client.post(
        f"/api/rooms/stays/{stay['id']}/checkout",
        params={"payment_method": "cash"},
        headers=owner_headers,
    )
    assert out.status_code == 200, out.text
    assert out.json()["status"] == "closed"

    listing = await client.get("/api/rooms", params={"business_unit_id": bu_id}, headers=owner_headers)
    statuses = {r["id"]: r["status"] for r in listing.json()["rooms"]}
    assert statuses[room["id"]] == "free"

    # Stay closed -> further room charges rejected, even with a valid stay id.
    late = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "stay_id": stay["id"],
            "idempotency_key": idem("late-charge"),
        },
        headers=owner_headers,
    )
    assert late.status_code == 422

    # Room is free again -> a new guest can check in.
    re_stay = await check_in_room(client, owner_headers, room["id"], "Next Guest")
    assert re_stay["status"] == "open"


# ---------- charge to room ----------


async def test_charge_to_room_appears_on_bill(client, owner_headers):
    bu_id, cat_id, item = await seed_stock(client, owner_headers, stock=20)
    room = await make_room(client, owner_headers, bu_id, "601")
    stay = await check_in_room(client, owner_headers, room["id"], "Diner")
    charge = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 3, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "stay_id": stay["id"],
            "idempotency_key": idem("bill-charge"),
        },
        headers=owner_headers,
    )
    assert charge.status_code == 201, charge.text
    sale = charge.json()
    assert sale["payment_method"] == "room_charge"
    assert sale["room_number"] == "601"
    assert sale["total_amount"] == "135.00"

    bill = await client.get(f"/api/rooms/stays/{stay['id']}/bill", headers=owner_headers)
    assert bill.status_code == 200, bill.text
    body = bill.json()
    assert body["charge_count"] == 1
    assert body["charges_total"] == "135.00"
    assert body["charges"][0]["sale_number"] == sale["sale_number"]

    # Stock was deducted exactly once for the charge.
    item_after = await client.get(f"/api/inventory/items/{item['id']}", headers=owner_headers)
    assert item_after.json()["current_stock"] == 17


async def test_charge_without_open_stay_rejected(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)

    no_stay = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "idempotency_key": idem("no-stay"),
        },
        headers=owner_headers,
    )
    assert no_stay.status_code == 422

    fake_stay = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "stay_id": "000000000000000000000000",
            "idempotency_key": idem("fake-stay"),
        },
        headers=owner_headers,
    )
    assert fake_stay.status_code == 422


async def test_stay_id_requires_room_charge_method(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "701")
    stay = await check_in_room(client, owner_headers, room["id"], "Cash Guest")
    resp = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "45.00"}],
            "payment_method": "cash",
            "stay_id": stay["id"],
            "idempotency_key": idem("stay-id-cash"),
        },
        headers=owner_headers,
    )
    assert resp.status_code == 422


async def test_duplicate_charge_key_no_double_billing(client, owner_headers):
    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "801")
    stay = await check_in_room(client, owner_headers, room["id"], "Idem Guest")
    payload = {
        "business_unit_id": bu_id,
        "items": [{"item_id": item["id"], "quantity": 2, "unit_price": "45.00"}],
        "payment_method": "room_charge",
        "stay_id": stay["id"],
        "idempotency_key": "dup-room-charge-001",
    }
    first = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert first.status_code == 201
    second = await client.post("/api/sales", json=payload, headers=owner_headers)
    assert second.status_code == 201
    assert second.json()["id"] == first.json()["id"]

    bill = await client.get(f"/api/rooms/stays/{stay['id']}/bill", headers=owner_headers)
    body = bill.json()
    assert body["charge_count"] == 1  # exactly one billing record

    item_after = await client.get(f"/api/inventory/items/{item['id']}", headers=owner_headers)
    assert item_after.json()["current_stock"] == 8  # deducted exactly once


async def test_recipe_order_can_be_charged_to_room(client, owner_headers):
    bu_id, cat_id = await setup_refs(client, owner_headers)
    room = await make_room(client, owner_headers, bu_id, "901")
    stay = await check_in_room(client, owner_headers, room["id"], "Recipe Guest")

    flour = await client.post(
        "/api/inventory/items",
        json={
            "name": "Rice Flour",
            "sku": "RF-ROOM-1",
            "category_id": cat_id,
            "business_unit_id": bu_id,
            "item_type": "raw_material",
            "base_unit": "g",
            "purchase_price": "40.00",
            "min_stock_level": 0,
            "opening_stock": 5000,
        },
        headers=owner_headers,
    )
    assert flour.status_code == 201, flour.text
    flour = flour.json()

    recipe = await client.post(
        "/api/recipes",
        json={"name": "Dosa", "business_unit_id": bu_id},
        headers=owner_headers,
    )
    rid = recipe.json()["recipe"]["id"]
    ing = await client.post(
        f"/api/recipes/{rid}/ingredients",
        json={"item_id": flour["id"], "quantity": 200},
        headers=owner_headers,
    )
    assert ing.status_code == 201, ing.text

    # 3 dosas charged to the room: 3 x 200g = 600g flour must be deducted.
    charge = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": rid, "quantity": 3, "unit_price": "120.00"}],
            "payment_method": "room_charge",
            "stay_id": stay["id"],
            "idempotency_key": idem("recipe-room"),
        },
        headers=owner_headers,
    )
    assert charge.status_code == 201, charge.text
    sale = charge.json()
    assert sale["total_amount"] == "360.00"
    recipe_lines = [line for line in sale["items"] if line.get("item_id") == rid]
    assert len(recipe_lines) == 1
    assert recipe_lines[0]["quantity"] == 3

    flour_after = await client.get(f"/api/inventory/items/{flour['id']}", headers=owner_headers)
    assert flour_after.json()["current_stock"] == 5000 - 200 * 3

    bill = await client.get(f"/api/rooms/stays/{stay['id']}/bill", headers=owner_headers)
    assert bill.json()["charges_total"] == "360.00"
