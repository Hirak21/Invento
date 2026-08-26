async def setup_refs(client, owner_headers):
    bu_resp = await client.post(
        "/api/business-units", json={"name": "Restaurant"}, headers=owner_headers
    )
    cat_resp = await client.post(
        "/api/categories", json={"name": "Raw Materials"}, headers=owner_headers
    )
    assert bu_resp.status_code == 201, bu_resp.text
    assert cat_resp.status_code == 201, cat_resp.text
    return bu_resp.json()["id"], cat_resp.json()["id"]


# ---------- Business units ----------


async def test_create_and_list_business_units(client, owner_headers):
    resp = await client.post(
        "/api/business-units", json={"name": "Restaurant"}, headers=owner_headers
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Restaurant"

    listing = await client.get("/api/business-units", headers=owner_headers)
    assert listing.status_code == 200
    assert [u["name"] for u in listing.json()] == ["Restaurant"]


async def test_duplicate_business_unit_name_conflicts(client, owner_headers):
    await client.post("/api/business-units", json={"name": "Shop"}, headers=owner_headers)
    resp = await client.post("/api/business-units", json={"name": "shop "}, headers=owner_headers)
    assert resp.status_code == 409


async def test_staff_cannot_create_business_unit(client, staff_headers):
    resp = await client.post(
        "/api/business-units", json={"name": "Sneaky"}, headers=staff_headers
    )
    assert resp.status_code == 403


async def test_create_business_unit_requires_auth(client):
    denied = await client.post("/api/business-units", json={"name": "Shop2"})
    assert denied.status_code in (401, 403)


async def test_update_business_unit_deactivate(client, owner_headers):
    create = await client.post(
        "/api/business-units", json={"name": "Temp Unit"}, headers=owner_headers
    )
    unit_id = create.json()["id"]
    resp = await client.patch(
        f"/api/business-units/{unit_id}", json={"active": False}, headers=owner_headers
    )
    assert resp.status_code == 200
    assert resp.json()["active"] is False


# ---------- Categories & suppliers ----------


async def test_category_crud_and_duplicates(client, owner_headers):
    first = await client.post(
        "/api/categories", json={"name": "Beverages"}, headers=owner_headers
    )
    assert first.status_code == 201
    dup = await client.post(
        "/api/categories", json={"name": "beverages"}, headers=owner_headers
    )
    assert dup.status_code == 409

    cat_id = first.json()["id"]
    patched = await client.patch(
        f"/api/categories/{cat_id}", json={"active": False}, headers=owner_headers
    )
    assert patched.status_code == 200

    listing = await client.get("/api/categories", headers=owner_headers)
    assert all(c["active"] for c in listing.json())
    full = await client.get(
        "/api/categories", params={"include_inactive": "true"}, headers=owner_headers
    )
    assert any(not c["active"] for c in full.json())


async def test_supplier_create_update(client, owner_headers):
    create = await client.post(
        "/api/suppliers",
        json={"name": "Metro Cash & Carry", "phone": "9876543210"},
        headers=owner_headers,
    )
    assert create.status_code == 201
    supplier_id = create.json()["id"]

    patched = await client.patch(
        f"/api/suppliers/{supplier_id}",
        json={"notes": "Bulk purchases"},
        headers=owner_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["notes"] == "Bulk purchases"
