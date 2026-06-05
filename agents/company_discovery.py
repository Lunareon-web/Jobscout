"""
Company Discovery — Crawl4AI
Findet Karriere-URLs für Firmen in crawl_companies ohne career_url.
Nutzt echten Browser um Career-Page-Links zu finden.
Ollama/Gemma analysiert ob eine Seite eine echte Karriere-Seite ist.
"""
import asyncio
import logging
import re
from datetime import datetime

from core.database import get_db
from core.config import settings
import core.ollama_client as LLM

log = logging.getLogger(__name__)

CAREER_PATHS = [
    "/karriere", "/karriere/", "/jobs", "/jobs/", "/stellenangebote",
    "/stellenangebote/", "/career", "/career/", "/arbeiten-bei-uns",
    "/unternehmen/karriere", "/about/jobs", "/open-positions",
    "/vacancies", "/join-us",
]

CAREER_LINK_RE = re.compile(
    r"/karriere|/jobs|/stellenangebote|/career|/vacancies|/join|arbeiten-bei",
    re.I,
)

def _slugify(name: str) -> str:
    s = name.lower()
    for a, b in [("ä","ae"),("ö","oe"),("ü","ue"),("ß","ss")]:
        s = s.replace(a, b)
    # GmbH, AG etc. entfernen
    s = re.sub(r"\s+(gmbh|ag|kg|se|inc|ltd|llc|co|cie)\.?\s*$", "", s, flags=re.I)
    return re.sub(r"[^a-z0-9]+", "-", s.strip()).strip("-")

async def _find_career_url(company: dict) -> str | None:
    """Sucht die Karriere-URL für eine Firma mit Crawl4AI."""
    name = company["name"]
    slug = _slugify(name)

    # Kandidaten-URLs generieren
    candidates = [
        f"https://www.{slug}.de",
        f"https://www.{slug}.com",
        f"https://{slug}.de",
        f"https://karriere.{slug}.de",
        f"https://jobs.{slug}.de",
    ]

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        browser_cfg = BrowserConfig(headless=True, verbose=False)
        run_cfg = CrawlerRunConfig(wait_for_timeout=4000, page_timeout=15000, verbose=False)

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            for base_url in candidates:
                try:
                    result = await crawler.arun(url=base_url, config=run_cfg)
                    if not result.success or not result.html:
                        continue

                    html = result.html

                    # Karriere-Link im HTML suchen
                    match = re.search(
                        r'href="((?:https?://[^"]*)?(?:/karriere|/jobs|/stellenangebote|/career)[^"]*?)"',
                        html, re.I
                    )
                    if match:
                        href = match.group(1)
                        if not href.startswith("http"):
                            href = base_url.rstrip("/") + href
                        log.info(f"  Career URL gefunden: {name} → {href}")
                        return href

                    # Bekannte Pfade ausprobieren
                    for path in CAREER_PATHS:
                        career_url = base_url.rstrip("/") + path
                        check = await crawler.arun(url=career_url, config=CrawlerRunConfig(page_timeout=8000, verbose=False))
                        if check.success and check.html and len(check.html) > 3000:
                            # Sieht das nach einer echten Karriere-Seite aus?
                            if re.search(r"stellenangebot|offene stellen|vacancies|job|bewerbung", check.html, re.I):
                                log.info(f"  Career URL via Pfad: {name} → {career_url}")
                                return career_url

                except Exception as e:
                    log.debug(f"  Fehler {base_url}: {e}")
                    continue

    except ImportError:
        log.error("crawl4ai nicht installiert")
    except Exception as e:
        log.warning(f"Discovery Fehler {name}: {e}")

    return None

async def run() -> int:
    """Findet career_url für Firmen ohne sie in crawl_companies."""
    log.info("=== Company Discovery (Crawl4AI) gestartet ===")
    db = get_db()

    # Firmen ohne career_url laden (max 20 pro Run)
    result = db.table("crawl_companies") \
        .select("id, name, city") \
        .eq("is_active", True) \
        .execute()

    # Filtern: nur ohne career_url
    all_companies = result.data or []
    without_url = [c for c in all_companies if not c.get("career_url")][:20]

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
