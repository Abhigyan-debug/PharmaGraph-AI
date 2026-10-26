import re
import time

import requests

PUG = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

PAUSE = {"Green": 0.4, "Yellow": 2.0, "Red": 10.0, "Black": 10.0}
SERVICE_BUSY_PAUSE = 3.0

_pause = PAUSE["Green"]


class Throttled(Exception):
    pass


def _update_pause(header):
    global _pause
    found = dict(re.findall(r"(Request Count|Request Time|Service) status: (\w+)", header or ""))
    own = [found.get("Request Count", "Green"), found.get("Request Time", "Green")]
    worst = max(PAUSE.get(s, PAUSE["Green"]) for s in own)
    if found.get("Service") in ("Red", "Black"):
        worst = max(worst, SERVICE_BUSY_PAUSE)
    _pause = worst


def request(path, data=None, tries=6):
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
