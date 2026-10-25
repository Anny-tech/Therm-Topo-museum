"""Check that every external link in the built site still resolves.

Usage: python pipeline/check_links.py   (after pipeline/build.py)
Exits non-zero if any link is broken, so it can run in CI.
"""

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "site", "data")
HEADERS = {"User-Agent": "teti-atlas-link-checker/1.0"}


def collect():
    urls = set()
    for t in json.load(open(os.path.join(DATA, "tutorials.json"))):
        urls.add(t["url"])
    for r in json.load(open(os.path.join(DATA, "references.json"))).values():
        urls.add(r["url"])
    for s in json.load(open(os.path.join(DATA, "build_info.json")))["sources"]:
        urls.add(s["homepage"])
    return sorted(urls)


def check(url):
    try:
        r = requests.head(url, headers=HEADERS, allow_redirects=True, timeout=20)
        if r.status_code in (403, 405, 429) or r.status_code >= 500:
            # many publishers reject HEAD or bots; retry with GET before failing
            r = requests.get(url, headers=HEADERS, allow_redirects=True, timeout=30, stream=True)
        return url, r.status_code
    except requests.RequestException as e:
        return url, type(e).__name__


def main():
    urls = collect()
    with ThreadPoolExecutor(8) as ex:
        results = list(ex.map(check, urls))
    # 403 from publisher landing pages behind bot protection is not a broken DOI
    bad = [(u, s) for u, s in results if not (isinstance(s, int) and (s < 400 or s == 403))]
    for u, s in bad:
        print(f"BROKEN {s}  {u}")
    print(f"{len(urls) - len(bad)}/{len(urls)} links OK")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
