import os
from uuid import uuid4

# Must run before app.settings is first read (lru_cache).
TEST_DB_NAME = f"invento_test_{uuid4().hex[:8]}"
os.environ["MONGO_DB"] = TEST_DB_NAME
os.environ["ENVIRONMENT"] = "testing"

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.mongo import ensure_indexes, get_mongo_client, reset_mongo_client  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import utc_now  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    # Motor clients bind to the event loop they are created on;
    # pytest-asyncio gives each test a new loop, so reset per test.
    reset_mongo_client()
    db = get_mongo_client()[TEST_DB_NAME]
    await db.client.drop_database(TEST_DB_NAME)
    await ensure_indexes(db)
    yield
    await db.client.drop_database(TEST_DB_NAME)
    reset_mongo_client()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def owner_headers():
    db = get_mongo_client()[TEST_DB_NAME]
    doc = {
        "username": "owner",
        "full_name": "Test Owner",
        "role": "owner",
        "password_hash": hash_password("ownerpass123"),
        "active": True,
        "created_at": utc_now(),
    }
    result = await db.users.insert_one(doc)
    from app.core.security import create_access_token

    token = create_access_token(subject=str(result.inserted_id), role="owner")
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def staff_headers():
    db = get_mongo_client()[TEST_DB_NAME]
    doc = {
        "username": "staff",
        "full_name": "Test Staff",
        "role": "staff",
        "password_hash": hash_password("staffpass123"),
        "active": True,
        "created_at": utc_now(),
    }
    result = await db.users.insert_one(doc)
    from app.core.security import create_access_token

    token = create_access_token(subject=str(result.inserted_id), role="staff")
    return {"Authorization": f"Bearer {token}"}
