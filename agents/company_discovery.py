"""
Company Discovery — Crawl4AI + Thread-basiert (Windows-Fix)
Findet career_url für Firmen in crawl_companies ohne sie.
"""
import asyncio
import logging
import re
from datetime import datetime

from agents._crawl4ai_thread import crawl_url
from core.database import get_db

log = logging.getLogger(__name__)

CAREER_PATHS = [
    "/karriere", "/karriere/", "/jobs", "/jobs/", "/stellenangebote",
    "/stellenangebote/", "/career", "/career/", "/arbeiten-bei-uns",
    "/unternehmen/karriere", "/about/jobs", "/open-positions",
]

def _slugify(name: str) -> str:
    s = name.lower()
    for a, b in [("ä","ae"),("ö","oe"),("ü","ue"),("ß","ss")]:
        s = s.replace(a, b)
    s = re.sub(r"\s+(gmbh|ag|kg|se|inc|ltd|llc|co)\.?\s*$", "", s, flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", s.strip()).strip("-")

async def _find_career_url(company: dict) -> str | None:
    name = company["name"]
    slug = _slugify(name)

    candidates = [
        f"https://www.{slug}.de",
        f"https://www.{slug}.com",
        f"https://{slug}.de",
    ]

    for base_url in candidates:
        html, _ = await crawl_url(base_url, wait_ms=3000)
        if not html or len(html) < 1000:
            continue

        # Karriere-Link im HTML suchen
        m = re.search(
            r'href="((?:https?://[^"]*)?(?:/karriere|/jobs|/stellenangebote|/career)[^"]*?)"',
            html, re.I
        )
        if m:
            href = m.group(1)
            if not href.startswith("http"):
                href = base_url.rstrip("/") + href
            log.info(f"  Career URL: {name} → {href}")
            return href

        # Bekannte Pfade prüfen
        for path in CAREER_PATHS:
            career_url = base_url.rstrip("/") + path
            check_html, _ = await crawl_url(career_url, wait_ms=2000)
            if check_html and len(check_html) > 2000:
                if re.search(r"stellenangebot|offene stellen|vacancies|bewerbung|job", check_html, re.I):
                    log.info(f"  Career URL via Pfad: {name} → {career_url}")
                    return career_url

    return None

async def run() -> int:
    log.info("=== Company Discovery gestartet ===")
    db = get_db()

    result = db.table("crawl_companies") \
        .select("id, name, city") \
        .eq("is_active", True) \
        .execute()

    all_companies = result.data or []
    without_url = [c for c in all_companies if not c.get("career_url")][:15]

    if not without_url:
        log.info("Alle Firmen haben bereits career_url.")
        return 0

    log.info(f"Suche career_url für {len(without_url)} Firmen...")
    found = 0

    for company in without_url:
        career_url = await _find_career_url(company)
        if career_url:
            db.table("crawl_companies") \
                .update({"career_url": career_url}) \
                .eq("id", company["id"]) \
                .execute()
            found += 1
        await asyncio.sleep(1)

    log.info(f"=== Company Discovery fertig: {found} Career-URLs gefunden ===")
    return found
