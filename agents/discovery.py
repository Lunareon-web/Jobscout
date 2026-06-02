"""
Discovery Agent
Findet neue Unternehmen über Suchmaschinen und Verzeichnisse.
Output → company_candidates
"""
import asyncio
import logging
import re
from datetime import datetime
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


async def _search_bing(query: str) -> list[dict]:
    """Scrape Bing search results."""
    results = []
    url = f"https://www.bing.com/search?q={query.replace(' ', '+')}&count=10&setlang=de"
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return results
        soup = BeautifulSoup(resp.text, "lxml")
        for li in soup.select("li.b_algo")[:10]:
            a = li.select_one("h2 a")
            if not a:
                continue
            href = a.get("href", "")
            if not href.startswith("http"):
                continue
            domain = _extract_domain(href)
            if not domain or any(bl in domain for bl in DOMAIN_BLACKLIST):
                continue
            results.append({
                "name": _extract_company_name(a.get_text(), href),
                "website": f"https://{domain}",
                "source_url": href,
                "source_type": "search",
            })
    except Exception as e:
        log.warning(f"Bing search error for '{query}': {e}")
    return results


async def _search_static_directories() -> list[dict]:
    """
    Curated list of known companies in the NRW Interior/Retail/Workplace space
    that are NOT yet in our database. Extends discovery beyond search engines.
    """
    return [
        {"name": "Lichtwerk", "website": "https://www.lichtwerk.de", "source_type": "directory"},
        {"name": "Interstore", "website": "https://www.interstore.de", "source_type": "directory"},
        {"name": "Vizona", "website": "https://www.vizona.com", "source_type": "directory"},
        {"name": "Knapstein", "website": "https://www.knapstein.de", "source_type": "directory"},
        {"name": "Assmann Büromöbel", "website": "https://www.assmann.de", "source_type": "directory"},
        {"name": "Wanzl", "website": "https://www.wanzl.com", "source_type": "directory"},
        {"name": "Roessler", "website": "https://www.roessler.de", "source_type": "directory"},
        {"name": "Atelier Markgraph", "website": "https://www.markgraph.de", "source_type": "directory"},
        {"name": "Hartmann von Sieben", "website": "https://www.hartmannvonsieben.de", "source_type": "directory"},
        {"name": "Dan Pearlman", "website": "https://www.danpearlman.com", "source_type": "directory"},
        {"name": "Plajer & Franz", "website": "https://www.plajer-franz.de", "source_type": "directory"},
        {"name": "Dalziel & Pow", "website": "https://www.dalziel-pow.com", "source_type": "directory"},
        {"name": "Ganter Interior", "website": "https://www.ganter-interior.com", "source_type": "directory"},
        {"name": "HÜNNEBECK", "website": "https://www.huennebeck.com", "source_type": "directory"},
        {"name": "Liganova", "website": "https://www.liganova.com", "source_type": "directory"},
        {"name": "Kaiser Innenausbau", "website": "https://www.kaiser-innenausbau.de", "source_type": "directory"},
        {"name": "Wöhner Design", "website": "https://www.woehner.de", "source_type": "directory"},
        {"name": "Raumwerk", "website": "https://www.raumwerk.net", "source_type": "directory"},
        {"name": "Nils Holger Moormann", "website": "https://www.moormann.de", "source_type": "directory"},
        {"name": "Brinkmann + Lenhard", "website": "https://www.bl-architekten.de", "source_type": "directory"},
    ]


async def run() -> int:
    """Main entry: search all clusters, save candidates."""
    db = get_db()
    total_new = 0

    # Load existing websites to avoid duplicates
    existing = {r["website"] for r in db.table("companies").select("website").execute().data or []}
    existing |= {r["website"] for r in db.table("company_candidates").select("website").execute().data or []}

    # Static directory (always runs, no bot protection)
    static = await _search_static_directories()
    for c in static:
        if c["website"] in existing:
            continue
        existing.add(c["website"])
        res = db.table("company_candidates").insert({
            "name": c["name"][:200],
            "website": c["website"],
            "city": "Düsseldorf",
            "source_url": c["website"],
            "source_type": c.get("source_type", "directory"),
            "status": "pending",
        }).execute()
        if res.data:
            candidate_id = res.data[0]["id"]
            db.table("crawl_queue").insert({
                "entity_type": "validation",
                "entity_id": candidate_id,
                "priority": 7,
                "status": "pending",
                "next_run": (datetime.utcnow()).isoformat() + "Z",
            }).execute()
        total_new += 1

    # Bing search for additional discovery
    for cluster in SEARCH_CLUSTERS:
        log.info(f"Discovery: searching '{cluster}'")
        candidates = await _search_bing(cluster)
        await asyncio.sleep(1.5)  # polite delay between searches

        for c in candidates:
            if c["website"] in existing:
                continue
            existing.add(c["website"])
            res = db.table("company_candidates").insert({
                "name": c["name"][:200],
                "website": c["website"],
                "city": "Düsseldorf",
                "source_url": c.get("source_url"),
                "source_type": c.get("source_type", "search"),
                "status": "pending",
            }).execute()
            if res.data:
                candidate_id = res.data[0]["id"]
                db.table("crawl_queue").insert({
                    "entity_type": "validation",
                    "entity_id": candidate_id,
                    "priority": 7,
                    "status": "pending",
                    "next_run": (datetime.utcnow()).isoformat() + "Z",
                }).execute()
            total_new += 1

    log.info(f"Discovery done. New candidates: {total_new}")
    return total_new
