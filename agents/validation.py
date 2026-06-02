"""
Validation Agent
Prüft company_candidates: Website erreichbar? Karriereseite vorhanden?
Output → companies + career_pages
"""
import logging
import httpx
from core.database import get_db
from core import queue as Q

log = logging.getLogger(__name__)

CAREER_PATHS = [
    "/karriere", "/karriere/", "/jobs", "/jobs/", "/careers", "/careers/",
    "/stellenangebote", "/stellenangebote/", "/team/jobs", "/de/karriere",
    "/unternehmen/karriere", "/buero/karriere", "/studio/karriere",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
    "Accept-Language": "de-DE,de;q=0.9",
}


async def _check_url(client: httpx.AsyncClient, url: str) -> bool:
    try:
        r = await client.head(url, follow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False


async def _find_career_page(base_url: str) -> str | None:
    base = base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=10, headers=HEADERS, follow_redirects=True) as client:
        # Check homepage first
        if not await _check_url(client, base):
            return None
        # Try known career paths
        for path in CAREER_PATHS:
            url = base + path
            if await _check_url(client, url):
                return url
    return None


async def run(candidate_id: str | None = None) -> int:
    db = get_db()
    validated = 0

    # Fetch pending candidates
    query = db.table("company_candidates").select("*").eq("status", "pending")
    if candidate_id:
        query = query.eq("id", candidate_id)
    candidates = (query.limit(20).execute()).data or []

    for c in candidates:
        log.info(f"Validating: {c['name']} ({c['website']})")

        career_url = await _find_career_page(c["website"])

        if career_url is None:
            # Website not reachable
            db.table("company_candidates").update({"status": "rejected"}).eq("id", c["id"]).execute()
            log.info(f"  → rejected (not reachable)")
            continue

        # Check for duplicate in companies
        existing = db.table("companies").select("id").eq("website", c["website"]).execute()
        if existing.data:
            db.table("company_candidates").update({"status": "duplicate"}).eq("id", c["id"]).execute()
            log.info(f"  → duplicate")
            continue

        # Insert into companies
        res = db.table("companies").insert({
            "name": c["name"],
            "website": c["website"],
            "city": c.get("city", "Düsseldorf"),
            "score": 0,
            "priority": "D",
        }).execute()

        if res.data:
            company_id = res.data[0]["id"]
            # Insert career page
            if career_url:
                db.table("career_pages").insert({
                    "company_id": company_id,
                    "url": career_url,
                    "status": "unknown",
                }).execute()

            # Mark candidate as done
            db.table("company_candidates").update({"status": "validated"}).eq("id", c["id"]).execute()

            # Enqueue for enrichment + career crawl
            Q.enqueue("company", entity_id=company_id)
            Q.enqueue("career_page", entity_id=company_id)

            log.info(f"  → validated. Career: {career_url}")
            validated += 1

    log.info(f"Validation done. Validated: {validated}/{len(candidates)}")
    return validated
