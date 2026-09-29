"""Order lifecycle: PENDING → PREPARING → READY → SERVED (+ CANCELLED)."""

from tests.test_master_data import setup_refs
from tests.test_sales import seed_stock

UNIQUE = {"n": 0}


def idem() -> str:
    UNIQUE["n"] += 1
    return f"order-lifecycle-{UNIQUE['n']:04d}"


async def make_sale(client, headers, bu_id, item_id, quantity=2, unit_price="45.00"):
    """Create a cash sale. Counter sales start SERVED (delivered at the till);
    the tests that need a working order charge to a room instead."""
    resp = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item_id, "quantity": quantity, "unit_price": unit_price}],
            "payment_method": "cash",
            "idempotency_key": idem(),
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def make_room_order(client, headers, bu_id, item_id, stay_id, quantity=2, unit_price="45.00"):
    """Room-charge sale: starts PENDING on the order board."""
    resp = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item_id, "quantity": quantity, "unit_price": unit_price}],
            "payment_method": "room_charge",
            "stay_id": stay_id,
            "idempotency_key": idem(),
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def patch_status(client, headers, sale_id, status):
    return await client.patch(
        f"/api/sales/{sale_id}/status",
        json={"status": status},
        headers=headers,
    )


async def test_new_sale_starts_pending(client, owner_headers):
    """Room-charge orders start PENDING; cash counter sales start SERVED."""
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-1")
    stay = await check_in_room(client, owner_headers, room["id"], "Board Guest")

    order = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])
    assert order["order_status"] == "PENDING"
    assert order["status_history"][0]["status"] == "PENDING"

    counter = await make_sale(client, owner_headers, bu_id, item["id"])
    assert counter["order_status"] == "SERVED"


async def test_invalid_transition_rejected(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-2")
    stay = await check_in_room(client, owner_headers, room["id"], "Flow Guest")
    sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])

    skip = await patch_status(client, owner_headers, sale["id"], "READY")
    assert skip.status_code == 422

    jump = await patch_status(client, owner_headers, sale["id"], "SERVED")
    assert jump.status_code == 422


async def test_full_lifecycle_and_terminal_served(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-3")
    stay = await check_in_room(client, owner_headers, room["id"], "Cycle Guest")
    sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])

    for status in ("PREPARING", "READY", "SERVED"):
        resp = await patch_status(client, owner_headers, sale["id"], status)
        assert resp.status_code == 200, resp.text
        assert resp.json()["order_status"] == status

    after = await patch_status(client, owner_headers, sale["id"], "PREPARING")
    assert after.status_code == 422  # SERVED is terminal


async def test_cancel_restores_stock_once(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-4")
    stay = await check_in_room(client, owner_headers, room["id"], "Cancel Guest")
    sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"], quantity=4)

    resp = await client.delete(f"/api/sales/{sale['id']}", headers=owner_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["order_status"] == "CANCELLED"

    item_after = await client.get(f"/api/inventory/items/{item['id']}", headers=owner_headers)
    assert item_after.json()["current_stock"] == 10  # restored exactly once

    movements = (
        await client.get(f"/api/inventory/items/{item['id']}/movements", headers=owner_headers)
    ).json()
    # The opening-stock entry is also an ADJUSTMENT_IN; match the cancel one
    # specifically by its reference type.
    cancel_moves = [m for m in movements["movements"] if m["reference_type"] == "sale_cancel"]
    assert len(cancel_moves) == 1
    assert cancel_moves[0]["movement_type"] == "ADJUSTMENT_IN"

    # Double cancel rejected
    again = await client.delete(f"/api/sales/{sale['id']}", headers=owner_headers)
    assert again.status_code == 422


async def test_cannot_cancel_after_served(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-5")
    stay = await check_in_room(client, owner_headers, room["id"], "Served Guest")
    sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])
    for status in ("PREPARING", "READY", "SERVED"):
        await patch_status(client, owner_headers, sale["id"], status)

    resp = await client.delete(f"/api/sales/{sale['id']}", headers=owner_headers)
    assert resp.status_code == 422


async def test_cancel_audited(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-6")
    stay = await check_in_room(client, owner_headers, room["id"], "Audit Guest")
    sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])
    await client.delete(f"/api/sales/{sale['id']}", headers=owner_headers)

    from app.core.config import get_settings
    from app.db.mongo import get_mongo_client

    db = get_mongo_client()[get_settings().mongo_db]
    audit = await db.audit_logs.find_one(
        {"entity_type": "sale", "entity_id": sale["id"], "action": "cancel"}
    )
    assert audit is not None
    assert audit["before"]["order_status"] == "PENDING"
    assert audit["after"]["order_status"] == "CANCELLED"


async def test_status_filters(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=50)
    room = await make_room(client, owner_headers, bu_id, "PD-7")
    stay = await check_in_room(client, owner_headers, room["id"], "Filter Guest")

    active_sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])
    done_sale = await make_room_order(client, owner_headers, bu_id, item["id"], stay["id"])
    await patch_status(client, owner_headers, done_sale["id"], "PREPARING")
    await patch_status(client, owner_headers, done_sale["id"], "READY")
    await patch_status(client, owner_headers, done_sale["id"], "SERVED")

    counter_sale = await make_sale(client, owner_headers, bu_id, item["id"])

    active = await client.get(
        "/api/sales", params={"business_unit_id": bu_id, "status": "active"}, headers=owner_headers
    )
    ids = [s["id"] for s in active.json()["sales"]]
    assert active_sale["id"] in ids
    assert done_sale["id"] not in ids

    served = await client.get(
        "/api/sales", params={"business_unit_id": bu_id, "status": "SERVED"}, headers=owner_headers
    )
    served_ids = [s["id"] for s in served.json()["sales"]]
    assert done_sale["id"] in served_ids  # lifecycle-SERVED order
    assert counter_sale["id"] in served_ids  # counter sale is SERVED at creation

    everything = await client.get(
        "/api/sales", params={"business_unit_id": bu_id, "status": "all"}, headers=owner_headers
    )
    all_ids = [s["id"] for s in everything.json()["sales"]]
    assert active_sale["id"] in all_ids and done_sale["id"] in all_ids
    assert counter_sale["id"] in all_ids  # legacy-style SERVED sales remain listable


async def test_staff_can_advance_and_cancel(client, staff_headers, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "PD-8")
    stay = await check_in_room(client, owner_headers, room["id"], "Staff Guest")
    sale = await make_room_order(client, staff_headers, bu_id, item["id"], stay["id"])

    resp = await patch_status(client, staff_headers, sale["id"], "PREPARING")
    assert resp.status_code == 200

    cancel = await client.delete(f"/api/sales/{sale['id']}", headers=staff_headers)
    assert cancel.status_code == 200


async def test_settled_room_charge_cannot_be_cancelled(client, owner_headers):
    from tests.test_rooms import make_room, check_in_room

    bu_id, _, item = await seed_stock(client, owner_headers, stock=10)
    room = await make_room(client, owner_headers, bu_id, "CC-1")
    stay = await check_in_room(client, owner_headers, room["id"], "Settle Guest")

    charge = await client.post(
        "/api/sales",
        json={
            "business_unit_id": bu_id,
            "items": [{"item_id": item["id"], "quantity": 1, "unit_price": "45.00"}],
            "payment_method": "room_charge",
            "stay_id": stay["id"],
            "idempotency_key": idem(),
        },
        headers=owner_headers,
    )
    assert charge.status_code == 201
    sale = charge.json()

    await client.post(
        f"/api/rooms/stays/{stay['id']}/checkout",
        params={"payment_method": "cash"},
        headers=owner_headers,
    )

    cancel = await client.delete(f"/api/sales/{sale['id']}", headers=owner_headers)
    assert cancel.status_code == 422
    assert "settled" in cancel.json()["detail"].lower()
