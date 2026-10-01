from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.mongo import ensure_indexes, get_mongo_client
from app.routers import auth as auth_router
from app.routers import business_units as business_units_router
from app.routers import catalog as catalog_router
from app.routers import inventory as inventory_router
from app.routers.recipes import router as recipes_router
from app.routers.menu import router as menu_router
from app.routers import purchases as purchases_router
from app.routers import sales as sales_router
from app.routers import wastage as wastage_router
from app.routers import expenses as expenses_router
from app.routers import dashboard as dashboard_router
from app.routers import reports as reports_router
from app.routers import meta as meta_router
from app.routers import stock_alerts as stock_alerts_router
from app.routers import rooms as rooms_router
from app.routers import settings as settings_router
from app.utils.errors import register_exception_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = get_mongo_client()
    try:
        await client.admin.command("ping")
    except Exception:
        if get_settings().environment == "production":
            raise
    db = client[get_settings().mongo_db]
    await ensure_indexes(db)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)

    # Build the CORS allow-list. We always include the deployed Firebase hosts
    # and local dev so the app works even if the CORS_ORIGINS env var is empty
    # or missing in the host (an empty env value otherwise overrides the default
    # and leaves allow_origins = [], which blocks every browser request).
    raw = (settings.cors_origins or "").strip()
    origins = [o.strip() for o in raw.split(",") if o.strip()] if raw else []
    for d in (
        "https://invento-lite.web.app",
        "https://invento-lite.firebaseapp.com",
        "http://localhost:5173",
    ):
        if d not in origins:
            origins.append(d)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(auth_router.router, prefix="/api")
    app.include_router(business_units_router.router, prefix="/api")
    app.include_router(catalog_router.router, prefix="/api")
    app.include_router(inventory_router.router, prefix="/api")
    app.include_router(purchases_router.router, prefix="/api")
    app.include_router(sales_router.router, prefix="/api")
    app.include_router(wastage_router.router, prefix="/api")
    app.include_router(expenses_router.router, prefix="/api")
    app.include_router(dashboard_router.router, prefix="/api")
    app.include_router(reports_router.router, prefix="/api")
    app.include_router(stock_alerts_router.router, prefix="/api")
    app.include_router(rooms_router.router, prefix="/api")
    app.include_router(settings_router.router, prefix="/api")
    app.include_router(recipes_router, prefix="/api")
    app.include_router(menu_router, prefix="/api")
    app.include_router(meta_router.router, prefix="/api")

    @app.get("/api/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
