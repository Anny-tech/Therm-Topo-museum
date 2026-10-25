"""HTTP access with an on-disk cache so rebuilds are fast, polite and reproducible."""

import hashlib
import json
import os
import time

import requests

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "cache", "http")
USER_AGENT = "teti-atlas-pipeline/1.0 (open materials data atlas)"

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT
REFRESH = False


def get_text(url, retries=3, timeout=60):
    """GET a text document (e.g. a CIF), cached like get_json; None if unavailable."""
    path = os.path.join(CACHE_DIR, hashlib.sha1(url.encode()).hexdigest() + ".txt")
    if not REFRESH and os.path.exists(path):
        with open(path) as fh:
            return fh.read()
    for attempt in range(retries):
        try:
            r = _session.get(url, timeout=timeout)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(path, "w") as fh:
                fh.write(r.text)
            return r.text
        except requests.RequestException as exc:
            if attempt == retries - 1:
                print(f"    ! {url} unavailable: {exc.__class__.__name__}: {str(exc)[:120]}")
                return None
            time.sleep(2 * (attempt + 1))


def get_json(url, params=None, retries=3, timeout=60, cache=True):
    """GET JSON; returns None if the server is unavailable after retries."""
    key = hashlib.sha1((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    path = os.path.join(CACHE_DIR, key + ".json")
    if cache and not REFRESH and os.path.exists(path):
        with open(path) as fh:
            return json.load(fh)
    for attempt in range(retries):
        try:
            r = _session.get(url, params=params, timeout=timeout)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            data = r.json()
            if cache:
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(path, "w") as fh:
                    json.dump(data, fh)
            return data
        except (requests.RequestException, ValueError) as exc:
            if attempt == retries - 1:
                print(f"    ! {url} unavailable: {exc.__class__.__name__}: {str(exc)[:120]}")
                return None
            time.sleep(2 * (attempt + 1))
