from urllib.parse import urlsplit

from app.core.config import settings
from app.core.errors import error_response

MAX_BODY_BYTES = 64 * 1024
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")  # Swagger UI loads from a CDN, so no strict CSP there
PRIVATE_PATHS = ("/api/v1/auth", "/api/v1/checks")

HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}


def trusted_origin(request):
    origin = request.headers.get("origin")
    if origin is None:  # browsers always send Origin on cross-site POSTs; tools like curl don't
        return True
    allowed = {o.strip() for o in settings.CORS_ORIGINS.split(",")}
    return origin in allowed or urlsplit(origin).netloc == request.headers.get("host")


async def secure_requests(request, call_next):
    if request.method in UNSAFE_METHODS:
        if not trusted_origin(request):
            return error_response(403, "bad_origin", "requests must come from the PharmGraph site")
        # shortcut: trusts Content-Length, so a chunked body isn't capped; set the proxy's body limit too.
        if int(request.headers.get("content-length") or 0) > MAX_BODY_BYTES:
            return error_response(413, "body_too_large", f"request bodies are limited to {MAX_BODY_BYTES} bytes")

    response = await call_next(request)
    response.headers.update(HEADERS)
    if not request.url.path.startswith(DOCS_PATHS):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
    if request.url.path.startswith(PRIVATE_PATHS):
        response.headers["Cache-Control"] = "no-store"
    if settings.HTTPS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
