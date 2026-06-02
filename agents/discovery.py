"""
Discovery Agent
Findet neue Unternehmen über Suchmaschinen und Verzeichnisse.
Output → company_candidates
"""
import logging
import re
import httpx
from bs4 import BeautifulSoup
from core.database import get_db
from core import queue as Q

log = logging.getLogger(__name__)

SEARCH_CLUSTERS = [
    "Innenarchitektur Düsseldorf",
    "Retail Design NRW",
    "Store Development Germany",
    "Ladenbau NRW",
    "Messebau NRW",
    "Brand Experience Germany",
    "Workplace Design Düsseldorf",
    "Shopkonzepte NRW",
    "Ladeneinrichtung Düsseldorf",
    "Interior Design Büro NRW",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
    "Accept-Language": "de-DE,de;q=0.9",
}

DOMAIN_BLACKLIST = {
    "google.com", "bing.com", "yahoo.com", "youtube.com", "facebook.com",
    "linkedin.com", "xing.com", "instagram.com", "wikipedia.org",
    "indeed.com", "stepstone.de", "monster.de", "arbeitsagentur.de",
}


def _extract_domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url)
    return m.group(1).lower() if m else ""


def _extract_company_name(title: str, url: str) -> str:
    """Best-effort: use first part of title or domain."""
    if " – " in title:
        return title.split(" – ")[0].strip()
    if " | " in title:
        return title.split(" | ")[0].strip()
    if " - " in title:
        return title.split(" - ")[0].strip()
    domain = _extract_domain(url)
    return domain.split(".")[0].capitalize()


async def _search_duckduckgo(query: str) -> list[dict]:
    """Scrape DuckDuckGo HTML results."""
    results = []
    url = f"https://html.duckduckgo.com/html/?q={query.replace(' ', '+')}"
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
        for result in soup.select(".result__body")[:10]:
            a = result.select_one(".result__a")
            snippet = result.select_one(".result__snippet")
            if not a:
                continue
            href = a.get("href", "")
            if not href.startswith("http"):
                continue
            domain = _extract_domain(href)
            if any(bl in domain for bl in DOMAIN_BLACKLIST):
                continue
            results.append({
                "name": _extract_company_name(a.get_text(), href),
                "website": f"https://{domain}",
                "source_url": href,
                "source_type": "search",
            })
    except Exception as e:
        log.warning(f"DuckDuckGo search error for '{query}': {e}")
    return results


async def run() -> int:
    """Main entry: search all clusters, save candidates."""
    db = get_db()
    total_new = 0

    # Load existing websites to avoid duplicates
    existing = {r["website"] for r in db.table("companies").select("website").execute().data or []}
    existing |= {r["website"] for r in db.table("company_candidates").select("website").execute().data or []}

    for cluster in SEARCH_CLUSTERS:
        log.info(f"Discovery: searching '{cluster}'")
        candidates = await _search_duckduckgo(cluster)

        for c in candidates:
            if c["website"] in existing:
                continue
            existing.add(c["website"])
            db.table("company_candidates").insert({
                "name": c["name"][:200],
                "website": c["website"],
                "city": "Düsseldorf",  # will be refined by validation
                "source_url": c.get("source_url"),
                "source_type": c.get("source_type", "search"),
                "status": "pending",
            }).execute()
            # Immediately enqueue for validation
            Q.enqueue("validation", delay_seconds=0)
            total_new += 1

    log.info(f"Discovery done. New candidates: {total_new}")
    return total_new
