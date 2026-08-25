from app.core.config import get_settings
from app.db.mongo import get_mongo_client


async def test_health_ok(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_needs_bootstrap_true_when_no_users(client):
    resp = await client.get("/api/auth/needs-bootstrap")
    assert resp.status_code == 200
    assert resp.json()["needs_bootstrap"] is True


async def test_bootstrap_owner_creates_account_and_returns_token(client):
    resp = await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "OwnerUser", "password": "supersecret1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["role"] == "owner"
    assert body["user"]["username"] == "owneruser"  # normalized to lowercase


async def test_second_bootstrap_conflicts(client, owner_headers):
    resp = await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "another", "password": "supersecret1"},
    )
    assert resp.status_code == 409


async def test_bootstrap_audits_creation(client):
    await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "auditowner", "password": "supersecret1"},
    )
    db = get_mongo_client()[get_settings().mongo_db]
    audit = await db.audit_logs.find_one({"entity_type": "user", "action": "create"})
    assert audit is not None
    assert audit["notes"] == "Bootstrap owner account"

    user_doc = await db.users.find_one({"username": "auditowner"})
    assert user_doc is not None
    # Password must be stored as a hash, never plaintext.
    assert "password_hash" in user_doc
    assert "supersecret1" != user_doc["password_hash"]


async def test_login_success(client):
    await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "loginuser", "password": "supersecret1"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"username": "LOGINUSER", "password": "supersecret1"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["user"]["username"] == "loginuser"


async def test_login_wrong_password_rejected(client):
    await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "badpw", "password": "correcthorse9"},
    )
    resp = await client.post(
        "/api/auth/login",
        json={"username": "badpw", "password": "wrong-password"},
    )
    assert resp.status_code == 401


async def test_login_unknown_user_rejected(client):
    resp = await client.post(
        "/api/auth/login",
        json={"username": "ghost", "password": "whatever123"},
    )
    assert resp.status_code == 401


async def test_login_inactive_user_rejected(client):
    from app.core.security import hash_password
    from app.models.user import utc_now

    db = get_mongo_client()[get_settings().mongo_db]
    await db.users.insert_one(
        {
            "username": "inactive",
            "full_name": "Inactive User",
            "role": "staff",
            "password_hash": hash_password("password123"),
            "active": False,
            "created_at": utc_now(),
        }
    )
    resp = await client.post(
        "/api/auth/login",
        json={"username": "inactive", "password": "password123"},
    )
    assert resp.status_code == 401


async def test_me_requires_token(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


async def test_me_with_valid_token(client, owner_headers):
    resp = await client.get("/api/auth/me", headers=owner_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["username"] == "owner"
    assert body["role"] == "owner"


async def test_me_with_garbage_token_rejected(client):
    resp = await client.get(
        "/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"}
    )
    assert resp.status_code == 401


async def test_short_password_rejected_by_validation(client):
    resp = await client.post(
        "/api/auth/bootstrap-owner",
        json={"username": "shorty", "password": "tiny"},
    )
    assert resp.status_code == 422
