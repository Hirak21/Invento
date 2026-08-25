from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import utc_now


async def log_audit(
    db: AsyncIOMotorDatabase,
    *,
    actor_id: str,
    actor_username: str,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    business_unit_id: str | None = None,
    notes: str | None = None,
) -> None:
    doc: dict[str, Any] = {
        "actor_id": actor_id,
        "actor_username": actor_username,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "business_unit_id": business_unit_id,
        "notes": notes,
        "created_at": utc_now(),
    }
    # Store before/after as sanitized dicts; strip volatile fields.
    for key, value in (("before", before), ("after", after)):
        if value is not None and key in ("before", "after"):
            value.pop("_id", None)
            doc[key] = value
    await db.audit_logs.insert_one(doc)
