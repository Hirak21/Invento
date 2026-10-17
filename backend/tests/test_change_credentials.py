"""Settings → Account: self-service username/password change."""


async def test_change_username_only(client, owner_headers):
    resp = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_username": "bossTwo"},
        headers=owner_headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["username"] == "bosstwo"  # normalized lower-case

    # Old username no longer logs in; new one does.
    old = await client.post(
        "/api/auth/login", json={"username": "owner", "password": "ownerpass123"}
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/auth/login", json={"username": "bossTwo", "password": "ownerpass123"}
    )
    assert new.status_code == 200, new.text

    # Existing token still works and /me reflects the new username.
    me = await client.get("/api/auth/me", headers=owner_headers)
    assert me.status_code == 200
    assert me.json()["username"] == "bosstwo"


async def test_change_password_only(client, owner_headers):
    resp = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_password": "brandnewpass9"},
        headers=owner_headers,
    )
    assert resp.status_code == 200, resp.text

    old = await client.post(
        "/api/auth/login", json={"username": "owner", "password": "ownerpass123"}
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/auth/login", json={"username": "owner", "password": "brandnewpass9"}
    )
    assert new.status_code == 200, new.text


async def test_change_both_at_once(client, owner_headers):
    resp = await client.patch(
        "/api/auth/me",
        json={
            "current_password": "ownerpass123",
            "new_username": "keeper",
            "new_password": "keeperpass77",
        },
        headers=owner_headers,
    )
    assert resp.status_code == 200, resp.text
    login = await client.post(
        "/api/auth/login", json={"username": "keeper", "password": "keeperpass77"}
    )
    assert login.status_code == 200, login.text


async def test_wrong_current_password_is_403_not_401(client, owner_headers):
    """403 keeps the client session alive; 401 would force a logout."""
    resp = await client.patch(
        "/api/auth/me",
        json={"current_password": "nope", "new_password": "brandnewpass9"},
        headers=owner_headers,
    )
    assert resp.status_code == 403, resp.text
    me = await client.get("/api/auth/me", headers=owner_headers)
    assert me.status_code == 200


async def test_duplicate_username_rejected(client, owner_headers, staff_headers):
    resp = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_username": "staff"},
        headers=owner_headers,
    )
    assert resp.status_code == 409, resp.text


async def test_nothing_to_change_rejected(client, owner_headers):
    resp = await client.patch(
        "/api/auth/me", json={"current_password": "ownerpass123"}, headers=owner_headers
    )
    assert resp.status_code == 422, resp.text

    same = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_username": "owner"},
        headers=owner_headers,
    )
    assert same.status_code == 422, same.text


async def test_password_policy_enforced(client, owner_headers):
    short = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_password": "short"},
        headers=owner_headers,
    )
    assert short.status_code == 422, short.text

    short_user = await client.patch(
        "/api/auth/me",
        json={"current_password": "ownerpass123", "new_username": "ab"},
        headers=owner_headers,
    )
    assert short_user.status_code == 422, short_user.text


async def test_requires_auth(client):
    resp = await client.patch(
        "/api/auth/me",
        json={"current_password": "x", "new_password": "brandnewpass9"},
    )
    assert resp.status_code == 401
