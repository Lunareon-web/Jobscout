"""
Portal Crawler — Crawl4AI + echter Browser
Löst das IP-Blocking-Problem: läuft lokal mit residentieller IP.
Rendert JavaScript → Indeed, StepStone, Kimeta funktionieren.
Nutzt Ollama/Gemma für Extraktion wenn kein JSON-LD vorhanden.
"""
import asyncio
import json
import logging
import re
import urllib.parse
from datetime import datetime

from core.database import get_db
from core.config import settings
import core.ollama_client as LLM

log = logging.getLogger(__name__)

STANDORT = settings.search_center
UMKREIS  = settings.search_radius_km

JOBTITEL = [
    "Projektmanager", "Project Manager", "Design Manager",
    "Designer", "Produktdesigner", "Interior Designer",
    "Innenarchitekt", "Raumplaner", "Concept Designer",
    "Brand Designer", "Visual Merchandiser", "Architekt",
    "Bauleiter", "Art Director", "Kreativdirektor",
    "Retail Designer", "Store Designer", "Messebauer",
    "Ladenbauer", "Ausstellungsgestalter",
]

PORTALE = [
    {
        "name": "Indeed",
        "url_fn": lambda t: f"https://de.indeed.com/jobs?q={urllib.parse.quote(t)}&l={urllib.parse.quote(STANDORT)}&radius=50&sort=date",
        "wait": "css:.jobCard_mainContent",
        "quelle": "Indeed",
    },
    {
        "name": "StepStone",
        "url_fn": lambda t: (
            f"https://www.stepstone.de/jobs/"
            f"{re.sub(r'[^a-z0-9]', '-', t.lower().replace('ä','ae').replace('ö','oe').replace('ü','ue'))}"
            f"/in-{STANDORT.lower().replace('ü','ue')}/?radius=50&sort=2"
        ),
        "wait": None,
        "quelle": "StepStone",
    },
    {
        "name": "Kimeta",
        "url_fn": lambda t: f"https://www.kimeta.de/stellenangebote/?q={urllib.parse.quote(t)}&l={urllib.parse.quote(STANDORT)}&r={UMKREIS}",
        "wait": None,
        "quelle": "Kimeta RSS",
    },
    {
        "name": "Karriere.de",
        "url_fn": lambda t: f"https://www.karriere.de/jobs?what={urllib.parse.quote(t)}&where={urllib.parse.quote(STANDORT)}&radius={UMKREIS}",
        "wait": None,
        "quelle": "Karriere.de",
    },
    {
        "name": "Stellenanzeigen.de",
        "url_fn": lambda t: f"https://www.stellenanzeigen.de/job-suche/?suchbegriff={urllib.parse.quote(t)}&arbeitsort={urllib.parse.quote(STANDORT)}&umkreis={UMKREIS}",
        "wait": None,
        "quelle": "Stellenanzeigen.de",
    },
    {
        "name": "Kalaydo",
        "url_fn": lambda t: f"https://www.kalaydo.de/jobs/ergebnisse/?what={urllib.parse.quote(t)}&where={urllib.parse.quote(STANDORT)}&radius={UMKREIS}",
        "wait": None,
        "quelle": "Kalaydo (Rheinland)",
    },
]

# ── Hilfsfunktionen ────────────────────────────────────────────────────────────

def _classify(titel: str) -> str:
    t = titel.lower()
    if re.search(r"interior|innen|raumplan|raumgestalt", t): return "interior"
    if re.search(r"architekt", t): return "architektur"
    if re.search(r"design|brand|visual|grafik|ux|ui|kreativ", t): return "design"
    if re.search(r"manager|management|projekt|project|leiter|director|head of|bauleiter", t): return "management"
    return "sonstiges"

def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s or "").strip()

def _make_id(url: str, titel: str, firma: str) -> str:
    import hashlib
    key = (url or f"{titel}||{firma}").lower()
    return re.sub(r"[^a-z0-9]", "", key)[:64]

def _extract_json_ld(html: str, fallback_ort: str) -> list[dict]:
    jobs = []
    for m in re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html, re.I):
        try:
            obj = json.loads(m.group(1).strip())
            items = obj if isinstance(obj, list) else obj.get("@graph", [obj])
            for item in items:
                if item.get("@type") != "JobPosting": continue
                titel = item.get("title", "")
                if not titel: continue
                jobs.append({
                    "titel": titel,
                    "unternehmen": item.get("hiringOrganization", {}).get("name", ""),
                    "ort": item.get("jobLocation", {}).get("address", {}).get("addressLocality", fallback_ort),
                    "datum": item.get("datePosted", ""),
                    "url": item.get("url") or item.get("@id", ""),
                    "beschreibung": _strip_html(item.get("description", ""))[:200],
                    "arbeitszeit": item.get("employmentType", ""),
                })
        except: pass
    return jobs

async def _extract_with_ollama(markdown: str, quelle: str) -> list[dict]:
    """Ollama/Gemma extrahiert Jobs aus Markdown-Text."""
    prompt = f"""
Analysiere diese Job-Suchergebnisseite und extrahiere alle Stellenangebote.
Gib NUR valides JSON zurück, keine Erklärungen:
[
  {{"titel": "Jobtitel", "unternehmen": "Firmenname", "ort": "Stadt", "url": "https://...", "datum": "YYYY-MM-DD oder leer"}}
]

Seite ({quelle}):
{markdown[:3000]}
"""
    try:
        result = await LLM.analyze(prompt, "", max_chars=0)
        if isinstance(result, list):
            return result
        # Manchmal kommt JSON in einer dict-Antwort
        if isinstance(result, dict) and "jobs" in result:
            return result["jobs"]
        return []
    except:
        return []

def _save_jobs(jobs: list[dict], quelle: str) -> int:
    if not jobs: return 0
    db = get_db()
    now = datetime.utcnow().isoformat()
    rows = []
    for j in jobs:
        titel = j.get("titel", "").strip()
        if not titel or len(titel) < 3: continue
        rows.append({
            "id": _make_id(j.get("url", ""), titel, j.get("unternehmen", "")),
            "titel": titel,
            "unternehmen": j.get("unternehmen", ""),
            "ort": j.get("ort", STANDORT),
            "plz": j.get("plz", "") or "",
            "datum": j.get("datum") or None,
            "url": j.get("url", ""),
            "quelle": quelle,
            "beschreibung": j.get("beschreibung", "") or "",
            "arbeitszeit": j.get("arbeitszeit", "") or "",
            "kategorie": _classify(titel),
            "is_active": True,
            "found_at": now,
        })
    inserted = 0
    for i in range(0, len(rows), 50):
        r = db.table("jobs").upsert(rows[i:i+50]).execute()
        if not r.error:
            inserted += len(rows[i:i+50])
    return inserted

# ── Crawl4AI Core ─────────────────────────────────────────────────────────────

async def _crawl_url(url: str, wait_selector: str = None, js_scroll: bool = True) -> tuple[str, str]:
    """Crawlt eine URL mit Playwright-Browser. Gibt (html, markdown) zurück."""
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        browser_cfg = BrowserConfig(
            headless=True,
            browser_type="chromium",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
            verbose=False,
        )

        js_code = ["window.scrollTo(0, document.body.scrollHeight / 2)"] if js_scroll else []

        run_cfg = CrawlerRunConfig(
            wait_for=f"css:{wait_selector}" if wait_selector else None,
            wait_for_timeout=5000,
            js_code=js_code,
            remove_overlay_elements=True,
            page_timeout=30000,
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)
            if not result.success:
                log.debug(f"Crawl failed: {url}")
                return "", ""
            return result.html or "", result.markdown or result.fit_markdown or ""

    except ImportError:
        log.error("crawl4ai nicht installiert. Starte setup_crawl4ai.bat")
        return "", ""
    except Exception as e:
        log.warning(f"Crawl error {url}: {e}")
        return "", ""

# ── Portal-Crawler ─────────────────────────────────────────────────────────────

async def _crawl_portal(portal: dict, titel: str) -> int:
    url = portal["url_fn"](titel)
    quelle = portal["quelle"]
    log.debug(f"  Crawling {portal['name']}: {titel}")

    html, markdown = await _crawl_url(url, wait_selector=portal.get("wait"))
    if not html:
        return 0

    # Strategie 1: JSON-LD
    jobs = _extract_json_ld(html, STANDORT)

    # Strategie 2: Ollama-Extraktion aus Markdown
    if not jobs and markdown:
        jobs = await _extract_with_ollama(markdown, quelle)

    if jobs:
        saved = _save_jobs(jobs, quelle)
        if saved:
            log.info(f"  {portal['name']} '{titel}': {saved} Jobs")
        return saved
    return 0

async def run() -> int:
    """Crawlt alle konfigurierten Job-Portale mit echtem Browser."""
    log.info("=== Portal Crawler (Crawl4AI) gestartet ===")
    total = 0

    # Jobtitel in Batches verarbeiten (nicht alle gleichzeitig)
    titel_batches = [JOBTITEL[i:i+5] for i in range(0, len(JOBTITEL), 5)]

    for batch in titel_batches:
        tasks = []
        for portal in PORTALE:
            for titel in batch:
                tasks.append(_crawl_portal(portal, titel))
                await asyncio.sleep(0.5)  # Sanfte Lastverteilung

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for r in results:
            if isinstance(r, int):
                total += r

        await asyncio.sleep(2)  # Pause zwischen Batches

    log.info(f"=== Portal Crawler fertig: {total} Jobs gespeichert ===")
    return total
