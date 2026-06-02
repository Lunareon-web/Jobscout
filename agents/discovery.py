"""
Discovery Agent
Findet neue Unternehmen basierend auf konfigurierten Jobtiteln + Standort.
Logik: Wer stellt Projektmanager/Designer/Innenarchitekten ein? → das sind unsere Zielunternehmen.
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

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
    "Accept-Language": "de-DE,de;q=0.9",
}

DOMAIN_BLACKLIST = {
    "google.com", "bing.com", "yahoo.com", "youtube.com", "facebook.com",
    "linkedin.com", "xing.com", "instagram.com", "wikipedia.org",
    "indeed.com", "stepstone.de", "monster.de", "arbeitsagentur.de",
    "glassdoor.com", "kununu.com", "jobs.de", "jobware.de",
    "karriere.de", "stellenanzeigen.de", "kimeta.de",
}


def _get_search_config() -> dict:
    """Load search config from Supabase app_config table."""
    db = get_db()
    try:
        r = db.table("app_config").select("value").eq("key", "search_config").execute()
        if r.data:
            return r.data[0]["value"]
    except Exception as e:
        log.warning(f"Could not load app_config: {e}")
    return {
        "standort": "Düsseldorf",
        "umkreis": 60,
        "jobtitel": [
            "Projektmanager", "Project Manager", "Design Manager",
            "Interior Designer", "Innenarchitekt", "Concept Designer",
        ]
    }


def _build_search_queries(config: dict) -> list[str]:
    """
    Build Bing search queries from job titles + location.
    Goal: find COMPANIES that employ these roles.
    """
    standort = config.get("standort", "Düsseldorf")
    jobtitel = config.get("jobtitel", [])
    queries = []

    # Per job title: search for companies that hire for this role
    for titel in jobtitel[:8]:  # Max 8 titles to avoid too many searches
        queries.append(f"{titel} Stelle {standort}")
        queries.append(f"{titel} Unternehmen {standort} Karriere")

    # Industry cluster queries based on job title themes
    titel_str = " ".join(jobtitel).lower()
    if any(w in titel_str for w in ["interior", "innenarchitekt", "raumplaner"]):
        queries.append(f"Innenarchitektur Büro {standort}")
        queries.append(f"Interior Design Agentur NRW")
    if any(w in titel_str for w in ["design", "brand", "concept", "visual"]):
        queries.append(f"Design Agentur {standort} Karriere")
        queries.append(f"Retail Design NRW Unternehmen")
    if any(w in titel_str for w in ["projekt", "project"]):
        queries.append(f"Projektmanagement Ladenbau NRW")
        queries.append(f"Store Development Unternehmen Deutschland")
    if any(w in titel_str for w in ["merchandise", "visual"]):
        queries.append(f"Visual Merchandising Unternehmen {standort}")

    return list(dict.fromkeys(queries))  # deduplicate


def _extract_domain(url: str) -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url)
    return m.group(1).lower() if m else ""


def _extract_company_name(title: str, url: str) -> str:
    for sep in [" – ", " | ", " - ", " · "]:
        if sep in title:
            return title.split(sep)[0].strip()
    domain = _extract_domain(url)
    return domain.split(".")[0].capitalize()


async def _search_bing(query: str) -> list[dict]:
    results = []
    url = f"https://www.bing.com/search?q={query.replace(' ', '+')}&count=10&setlang=de&cc=DE"
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code >= 400:
                return results
        soup = BeautifulSoup(resp.text, "lxml")
        for li in soup.select("li.b_algo")[:8]:
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
        log.warning(f"Bing error '{query}': {e}")
    return results


async def _enqueue_candidate(db, website: str, name: str, city: str, source_url: str, source_type: str):
    """Insert candidate and enqueue validation."""
    res = db.table("company_candidates").insert({
        "name": name[:200],
        "website": website,
        "city": city,
        "source_url": source_url,
        "source_type": source_type,
        "status": "pending",
    }).execute()
    if res.data:
        candidate_id = res.data[0]["id"]
        db.table("crawl_queue").insert({
            "entity_type": "validation",
            "entity_id": candidate_id,
            "priority": 7,
            "status": "pending",
            "next_run": datetime.utcnow().isoformat() + "Z",
        }).execute()


async def run() -> int:
    db = get_db()
    total_new = 0

    # Load config from Supabase
    config = _get_search_config()
    standort = config.get("standort", "Düsseldorf")
    log.info(f"Discovery: standort={standort}, {len(config.get('jobtitel',[]))} Jobtitel")

    # Build existing set to avoid duplicates
    existing = {r["website"] for r in db.table("companies").select("website").execute().data or []}
    existing |= {r["website"] for r in db.table("company_candidates").select("website").execute().data or []}

    # Build queries from config
    queries = _build_search_queries(config)
    log.info(f"Discovery: {len(queries)} search queries")

    for query in queries:
        log.info(f"  Searching: '{query}'")
        candidates = await _search_bing(query)
        await asyncio.sleep(1.5)  # polite delay

        for c in candidates:
            if c["website"] in existing:
                continue
            existing.add(c["website"])
            await _enqueue_candidate(db, c["website"], c["name"], standort, c["source_url"], "search")
            total_new += 1

    log.info(f"Discovery done. New candidates: {total_new}")
    return total_new
