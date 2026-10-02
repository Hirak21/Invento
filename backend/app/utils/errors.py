import logging

log = logging.getLogger("invento")


class AppError(Exception):
    status_code = 400
    detail = "Request failed."

    def __init__(self, detail: str | None = None) -> None:
        if detail:
            self.detail = detail
        super().__init__(self.detail)


class UnauthorizedError(AppError):
    status_code = 401
    detail = "Authentication required."


class ForbiddenError(AppError):
    status_code = 403
    detail = "You do not have permission to perform this action."


class NotFoundError(AppError):
    status_code = 404
    detail = "Resource not found."


class ConflictError(AppError):
    status_code = 409
    detail = "Resource already exists."


class BusinessRuleError(AppError):
    """Domain rule violation (e.g. insufficient stock, duplicate transaction)."""
    status_code = 422
    detail = "Operation violates a business rule."


def register_exception_handlers(app) -> None:  # noqa: ANN001 - FastAPI app
    from fastapi import Request
    from fastapi.exceptions import RequestValidationError
    from fastapi.responses import JSONResponse
    from starlette.exceptions import HTTPException as StarletteHTTPException

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Flatten Pydantic errors to the same {"detail": str} shape the
        frontend already renders, instead of the raw [{"loc", "msg"}] list."""
        parts: list[str] = []
        for err in exc.errors():
            loc = err.get("loc", ())
            # loc starts with ("body", ...) or ("query", ...); drop the source.
            where = " → ".join(str(p) for p in loc[1:]) if len(loc) > 1 else ""
            msg = str(err.get("msg", "Invalid value."))
            parts.append(f"{where}: {msg}" if where else msg)
        detail = "; ".join(parts) or "Invalid request."
        return JSONResponse(status_code=422, content={"detail": detail})

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """Genuine framework 404s (unknown routes) stay 404 with JSON detail;
        nothing else is silenced."""
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return JSONResponse(status_code=exc.status_code, content={"detail": detail})

    @app.exception_handler(Exception)
    async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error."},
        )
