import logging
import time
import uuid

log = logging.getLogger("pharmgraph.request")


def setup_logging(level):
    logging.basicConfig(level=level, format="%(asctime)s %(levelname)s %(name)s %(message)s")


async def log_requests(request, call_next):
    request_id = uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.error("request_id=%s method=%s path=%s status=500 ms=%.1f", request_id,
                  request.method, request.url.path, (time.perf_counter() - start) * 1000)
        raise
    response.headers["X-Request-ID"] = request_id
    log.info("request_id=%s method=%s path=%s status=%s ms=%.1f", request_id, request.method,
             request.url.path, response.status_code, (time.perf_counter() - start) * 1000)
    return response
