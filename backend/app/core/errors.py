import logging
from http import HTTPStatus

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

log = logging.getLogger("pharmgraph")


def error_response(code, error, detail, headers=None):
    return JSONResponse(status_code=code, content={"error": error, "detail": detail, "code": code}, headers=headers)


async def http_error(request, exc):
    headers = getattr(exc, "headers", None)  # keeps Retry-After on 429s
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return error_response(exc.status_code, exc.detail["error"], exc.detail.get("detail"), headers)
    name = HTTPStatus(exc.status_code).phrase.lower().replace(" ", "_")
    return error_response(exc.status_code, name, exc.detail, headers)


async def validation_error(request, exc):
    detail = [{"field": ".".join(str(p) for p in e["loc"][1:]) or "body",
               "message": e["msg"].removeprefix("Value error, ")}
              for e in exc.errors()]
    return error_response(422, "validation_error", detail)


async def unexpected_error(request, exc):
    log.exception("unhandled error request_id=%s", getattr(request.state, "request_id", "-"))
    return error_response(500, "internal_error", "something went wrong; the error was logged")


def register(app):
    app.add_exception_handler(HTTPException, http_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(Exception, unexpected_error)
