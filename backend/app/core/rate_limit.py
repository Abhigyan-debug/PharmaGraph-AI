import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


# shortcut: counts live in this process's memory, so each uvicorn worker keeps its own count, a restart
# clears them and one key per client IP is kept forever; move to Redis or the proxy's limiter before
# running several workers or going public.
class RateLimit:
    """Sliding window: at most `limit` requests per client IP in any `seconds`-long window."""

    hits = defaultdict(deque)  # (limit name, client IP) -> times of the recent requests

    def __init__(self, name, limit, seconds=60):
        self.name, self.limit, self.seconds = name, limit, seconds

    def __call__(self, request: Request):
        now = time.monotonic()
        window = self.hits[(self.name, request.client.host if request.client else "-")]
        while window and window[0] <= now - self.seconds:
            window.popleft()
        if len(window) >= self.limit:
            retry = int(window[0] + self.seconds - now) + 1
            raise HTTPException(status_code=429, headers={"Retry-After": str(retry)},
                                detail={"error": "rate_limited", "detail": f"too many requests; try again in {retry} s"})
        window.append(now)


AUTH_LIMIT = RateLimit("auth", 5)  # slows password guessing to 5 tries a minute per IP
SEARCH_LIMIT = RateLimit("search", 60)
CHECK_LIMIT = RateLimit("check", 30)
STRUCTURE_LIMIT = RateLimit("structure", 60)
CATALOG_LIMIT = RateLimit("catalog", 120)
