"""Resolve DOIs against Crossref so bibliographic data is never typed by hand."""

import html
import re

from . import http


def _clean(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


def resolve(doi):
    data = http.get_json(f"https://api.crossref.org/works/{doi}", retries=3, timeout=30)
    if not data or "message" not in data:
        return None
    m = data["message"]
    authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() or a.get("name", "")
               for a in m.get("author", [])]
    year = None
    for k in ("published-print", "published-online", "issued", "created"):
        parts = (m.get(k) or {}).get("date-parts") or [[None]]
        if parts[0] and parts[0][0]:
            year = parts[0][0]
            break
    return {
        "doi": m["DOI"].lower(),
        "title": _clean((m.get("title") or [""])[0]),
        "journal": _clean((m.get("container-title") or [""])[0]) or m.get("publisher"),
        "volume": m.get("volume"),
        "page": m.get("page") or m.get("article-number"),
        "year": year,
        "authors": authors,
        "type": m.get("type"),
        "url": f"https://doi.org/{m['DOI']}",
    }
