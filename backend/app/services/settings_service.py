"""Business settings + receipt/invoice logo (Bug 4).

Storage: a singleton ``business_settings`` doc (``_id: "global"``) holding
``business_name`` and either:
  - ``logo_data_uri`` — an ``data:image/...;base64,`` URI uploaded by the
    owner (preferred: travels with the DB, no static-file deploy to break,
    embeddable verbatim in thermal/printed/shared receipts), or
  - ``logo_url`` — an absolute https URL for externally hosted logos.

Why this fixes the classic breakage: logos historically broke because
templates referenced relative paths (wrong static mount), stored
``http://localhost:...`` URLs, or auth-protected routes. Here:
  - ``GET /api/settings/logo`` is PUBLIC (no auth) and serves bytes with the
    right content-type, or redirects to the external URL, or 404s.
  - Absolute URLs are built from the env-based ``PUBLIC_BASE_URL`` — no
    hardcoded hosts anywhere. Stored localhost/127.0.0.1 URLs are rewritten
    to ``PUBLIC_BASE_URL`` on read AND on write (self-healing migration).
  - Templates always render the business name and hide the <img> on error,
    so a missing logo degrades to name-only — never a broken-image icon.
"""

import base64
import binascii
import re
from typing import Any
from urllib.parse import urlparse, urlunparse

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.models.user import utc_now
from app.utils.errors import BusinessRuleError, NotFoundError

GLOBAL_ID = "global"
DEFAULT_NAME = "Invento"
MAX_LOGO_BYTES = 700_000  # ~0.7 MB image; Mongo doc limit is 16 MB.
DATA_URI_RE = re.compile(r"^data:(image/(png|jpeg|jpg|webp|gif|svg\+xml));base64,(.+)$", re.DOTALL)
LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "[::1]"}


def public_base_url() -> str:
    return (get_settings().public_base_url or "").strip().rstrip("/")


def normalize_logo_url(raw: str | None) -> str | None:
    """Rewrite dead/localhost hosts to PUBLIC_BASE_URL; pass through rest."""
    if not raw:
        return None
    raw = raw.strip()
    if raw.startswith("data:"):
        return raw
    try:
        parts = urlparse(raw)
    except ValueError:
        return raw
    if parts.hostname in LOCAL_HOSTS and public_base_url():
        base = urlparse(public_base_url())
        parts = parts._replace(scheme=base.scheme or "https", netloc=base.netloc)
        return urlunparse(parts)
    return raw


def validate_logo_data_uri(raw: str) -> str:
    raw = raw.strip()
    match = DATA_URI_RE.match(raw)
    if not match:
        raise BusinessRuleError(
            "Logo must be an image data URI (PNG/JPEG/WebP/GIF/SVG), e.g. from the Settings upload."
        )
    try:
        blob = base64.b64decode(match.group(3), validate=True)
    except (binascii.Error, ValueError):
        raise BusinessRuleError("Logo image data is not valid base64.") from None
    if len(blob) == 0 or len(blob) > MAX_LOGO_BYTES:
        raise BusinessRuleError(
            f"Logo image must be between 1 byte and {MAX_LOGO_BYTES // 1000} KB."
        )
    return raw


def validate_logo_url(raw: str) -> str:
    raw = raw.strip()
    parts = urlparse(raw)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise BusinessRuleError("Logo URL must be an absolute http(s) URL.")
    normalized = normalize_logo_url(raw)
    assert normalized is not None
    return normalized


async def get_settings_doc(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    doc = await db.business_settings.find_one({"_id": GLOBAL_ID})
    if doc is None:
        return {"_id": GLOBAL_ID, "business_name": DEFAULT_NAME}
    return doc


def settings_out(doc: dict[str, Any]) -> dict[str, Any]:
    data_uri = doc.get("logo_data_uri")
    url = normalize_logo_url(doc.get("logo_url"))
    has_logo = bool(data_uri or url)
    if data_uri:
        # Absolute when PUBLIC_BASE_URL is configured (Firebase frontend +
        # Render API are different origins — a bare relative path would hit
        # the wrong host). Falls back to the same-origin path for local dev.
        absolute = (
            f"{public_base_url()}/api/settings/logo" if public_base_url() else None
        )
        display = absolute or "/api/settings/logo"
    elif url:
        display = absolute = url
    else:
        display = absolute = None
    return {
        "business_name": doc.get("business_name") or DEFAULT_NAME,
        "has_logo": has_logo,
        # What <img> should use in-app (relative is fine, same origin).
        "logo_url": display,
        # Absolute URL for thermal/printed/shared receipts.
        "logo_absolute_url": absolute,
        "logo_updated_at": doc.get("logo_updated_at"),
    }


async def update_settings(
    db: AsyncIOMotorDatabase,
    *,
    business_name: str | None = None,
    logo_data_uri: str | None = None,
    logo_url: str | None = None,
    remove_logo: bool = False,
) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    if business_name is not None:
        name = business_name.strip()
        if not name:
            raise BusinessRuleError("Business name cannot be empty.")
        if len(name) > 120:
            raise BusinessRuleError("Business name is too long (max 120).")
        updates["business_name"] = name
    if remove_logo:
        updates["logo_data_uri"] = None
        updates["logo_url"] = None
        updates["logo_updated_at"] = None
    else:
        if logo_data_uri is not None:
            updates["logo_data_uri"] = validate_logo_data_uri(logo_data_uri)
            updates["logo_url"] = None
            updates["logo_updated_at"] = utc_now()
        elif logo_url is not None:
            updates["logo_url"] = validate_logo_url(logo_url)
            updates["logo_data_uri"] = None
            updates["logo_updated_at"] = utc_now()
    if updates:
        updates["updated_at"] = utc_now()
        await db.business_settings.update_one(
            {"_id": GLOBAL_ID}, {"$set": updates}, upsert=True
        )
    return settings_out(await get_settings_doc(db))


async def logo_bytes(db: AsyncIOMotorDatabase) -> tuple[bytes, str]:
    """Return (image bytes, content-type) for the public logo route.

    Raises NotFoundError when no embeddable logo is set (external URLs are
    handled as redirects by the router; callers check ``logo_redirect``).
    """
    doc = await get_settings_doc(db)
    data_uri = doc.get("logo_data_uri")
    if data_uri:
        match = DATA_URI_RE.match(data_uri.strip())
        if match:
            blob = base64.b64decode(match.group(3), validate=True)
            mime = match.group(1).replace("jpg", "jpeg")
            return blob, mime if mime != "image/jpg" else "image/jpeg"
    raise NotFoundError("No logo has been uploaded.")


async def logo_redirect(db: AsyncIOMotorDatabase) -> str | None:
    doc = await get_settings_doc(db)
    if doc.get("logo_data_uri"):
        return None  # served as bytes, not a redirect
    url = normalize_logo_url(doc.get("logo_url"))
    return url
