from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.context import request_id_var
from app.core.logging import get_logger

logger = get_logger(__name__)


class DomainError(Exception):
    """Base class for errors that map to a specific HTTP status + error code."""

    status_code = 400
    code = "domain_error"

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class UnauthorizedError(DomainError):
    status_code = 401
    code = "unauthorized"


class UpstreamError(DomainError):
    """An external service (currently: the OpenRouter LLM gateway) failed or is
    unavailable. The message shown to the client is always a clean, generic one -- raw
    provider error details are logged, never returned in the response.
    """

    status_code = 502
    code = "upstream_error"


def _error_envelope(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id_var.get()}}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_envelope(exc.code, exc.message),
        )

    @app.exception_handler(Exception)
    async def handle_unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_exception", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=_error_envelope("internal_error", "An unexpected error occurred."),
        )
