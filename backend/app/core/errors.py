"""Uniform error format matching the frontend ApiErrorBody: {"error": {code, message, details?}}."""
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException  # base class: also catches router 404/405
import logging

log = logging.getLogger("agentguard")

_STATUS_CODES = {
    400: "bad_request", 401: "unauthenticated", 403: "forbidden", 404: "not_found",
    409: "conflict", 422: "validation_error", 429: "rate_limited", 502: "upstream_error",
}


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def error_response(status: int, code: str, message: str, details: Any = None, headers: dict | None = None) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body, headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.exception_handler(HTTPException)
    async def _http_error(_: Request, exc: HTTPException):
        code = _STATUS_CODES.get(exc.status_code, "http_error")
        msg = exc.detail if isinstance(exc.detail, str) else "Request failed."
        return error_response(exc.status_code, code, msg, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
        return error_response(422, "validation_error", "Some fields are invalid.", details)

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return error_response(500, "internal_error", "Something went wrong on the server.")
