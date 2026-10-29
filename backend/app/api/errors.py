"""Consistent error responses: {"error": {"code": ..., "message": ...}}. No stack traces or provider details."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from app.config import MAX_REQUEST_BYTES

logger = logging.getLogger("lunapulse")


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def _error(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"error": {"code": code, "message": message}})


def _describe(error: dict) -> str:
    location = ".".join(str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path"))
    return f"{location}: {error.get('msg', 'invalid value')}" if location else error.get("msg", "invalid value")


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _error(exc.status_code, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _error(422, "validation_error", "; ".join(_describe(e) for e in exc.errors()))

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == 404 else "http_error"
        return _error(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error")
        return _error(500, "internal_error", "Something went wrong on the server.")


def reject_oversized_bodies(app: FastAPI) -> None:
    """Refuses bodies larger than any real request before reading them, so a huge upload can't tie up the server."""

    @app.middleware("http")
    async def limit_body_size(request: Request, call_next: RequestResponseEndpoint) -> Response:
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > MAX_REQUEST_BYTES:
            return _error(413, "payload_too_large", f"Request bodies are limited to {MAX_REQUEST_BYTES // 1024} KB.")
        return await call_next(request)
