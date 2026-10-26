"""Small PubChem PUG REST client shared by the pipeline scripts.

PubChem allows at most 5 requests a second, and it throttles harder when its
servers are busy. Every response has an X-Throttling-Control header like

    Request Count status: Green (5%), Request Time status: Green (0%), Service status: Black (497%)

The first two describe our own usage, the last one the server's overall load.
We slow down as soon as any of them leaves Green instead of waiting for a 429,
which is what got us blocked for over half an hour the first time.
"""

import re
import time

import requests

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

# seconds between requests for each status
PAUSE = {"Green": 0.4, "Yellow": 2.0, "Red": 10.0, "Black": 10.0}
SERVICE_BUSY_PAUSE = 3.0  # server overloaded but our own usage is fine

_pause = PAUSE["Green"]


class Throttled(Exception):
    """PubChem kept refusing. Callers save progress and stop."""


def _update_pause(header):
    global _pause
    found = dict(re.findall(r"(Request Count|Request Time|Service) status: (\w+)", header or ""))
    own = [found.get("Request Count", "Green"), found.get("Request Time", "Green")]
    worst = max(PAUSE.get(s, PAUSE["Green"]) for s in own)
    if found.get("Service") in ("Red", "Black"):
        worst = max(worst, SERVICE_BUSY_PAUSE)
    _pause = worst


def request(path, data=None, tries=6):
    """JSON for a PUG REST path, None for 404. Raises Throttled after repeated refusals."""
    url = f"{PUG}/{path}"
    for attempt in range(tries):
        time.sleep(_pause)
        try:
            r = requests.post(url, data=data, timeout=90) if data else requests.get(url, timeout=90)
        except requests.RequestException:
            time.sleep(5 * (attempt + 1))
            continue
        _update_pause(r.headers.get("X-Throttling-Control"))
        if r.status_code == 200:
            return r.json()
        if r.status_code == 404:
            return None
        wait = int(r.headers.get("Retry-After", 0) or 0) or 30 * (attempt + 1)
        print(f"  PubChem {r.status_code}, waiting {wait}s", flush=True)
        time.sleep(wait)
    raise Throttled(path)
