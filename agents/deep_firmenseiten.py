"""
Deep Firmenseiten Crawler — Crawl4AI + Playwright
Crawlt JS-gerenderte Karriere-Seiten (SPAs, React, Vue, etc.)
Liest Firmen aus crawl_companies-Tabelle (dynamisch wachsend).
Fallback: Ollama/Gemma extrahiert Jobs aus unstrukturiertem Inhalt.
"""
import asyncio
import json
import logging
import re
from datetime import datetime

from core.database import get_db
from core.config import settings
import core.ollama_client as LLM

log = logging.getLogger(__name__)

STANDORT = settings.search_center

JOBTITEL_RE = re.compile(
    r"designer|innenarchitekt|interior|architekt|raumplan|raumgestalt|"
    r"concept|brand|visual|merchandis|manager|projektleit|projektmanager|"
    r"project|bauleiter|kreativ|director|ladenbauer|messe|ausstellung|"
    r"grafik|marketing|shopkonzept|retail|architect|creative",
    re.I,
)

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
    key = (url or f"{titel}||{firma}").lower()
    return re.sub(r"[^a-z0-9]", "", key)[:64]

def _extract_json_ld(html: str, firma: str, ort: str) -> list[dict]:
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
                    "unternehmen": item.get("hiringOrganization", {}).get("name", firma),
                    "ort": item.get("jobLocation", {}).get("address", {}).get("addressLocality", ort),
                    "datum": item.get("datePosted", ""),
                    "url": item.get("url") or item.get("@id", ""),
                    "beschreibung": _strip_html(item.get("description", ""))[:200],
                    "arbeitszeit": item.get("employmentType", ""),
                })
        except: pass
    return [j for j in jobs if JOBTITEL_RE.search(j["titel"])]

def _extract_next_data(html: str, firma: str, ort: str) -> list[dict]:
    jobs = []
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>({[\s\S]+?})</script>', html)
    if not m: return jobs
    try:
        nd = json.loads(m.group(1))
        paths = [
            ["props","pageProps","jobs"], ["props","pageProps","vacancies"],
            ["props","pageProps","positions"], ["props","pageProps","jobOffers"],
            ["props","pageProps","openPositions"],
        ]
        for path in paths:
            val = nd
            for key in path:
                val = (val or {}).get(key)
            if isinstance(val, list) and val:
                for item in val:
                    titel = item.get("title") or item.get("jobTitle") or item.get("name") or ""
                    if not titel or not JOBTITEL_RE.search(titel): continue
                    jobs.append({
                        "titel": titel,
                        "unternehmen": item.get("company", firma),
                        "ort": item.get("location") or item.get("city") or ort,
                        "datum": item.get("datePosted") or item.get("date") or "",
                        "url": item.get("url") or item.get("applyUrl") or "",
                        "beschreibung": _strip_html(item.get("teaser") or item.get("description") or "")[:200],
                        "arbeitszeit": item.get("employmentType") or "",
                    })
                break
    except: pass
    return jobs

async def _extract_with_ollama(markdown: str, firma: str, career_url: str) -> list[dict]:
    """Ollama/Gemma extrahiert Jobs wenn kein JSON-LD gefunden."""
    if not markdown or len(markdown) < 100:
        return []
    prompt = f"""
Du analysierst die Karriere-Seite von "{firma}".
Extrahiere alle Stellenangebote die für Design/Interior/Architektur/Management relevant sind.
Gib NUR valides JSON zurück ohne Erklärungen:
[
  {{"titel": "...", "url": "vollständige URL oder {career_url}", "ort": "..."}}
]
Falls keine passenden Stellen: leeres Array [].

Karriere-Seite (Markdown):
{markdown[:3000]}
"""
    try:
        result = await LLM.analyze(prompt, "", max_chars=0)
        if isinstance(result, list):
            return [j for j in result if isinstance(j, dict) and j.get("titel")]
        return []
    except:
        return []

def _save_jobs(jobs: list[dict], firma: str) -> int:
    if not jobs: return 0
    db = get_db()
    now = datetime.utcnow().isoformat()
    quelle = f"Direkt: {firma}"
    rows = []
    for j in jobs:
        titel = j.get("titel", "").strip()
        if not titel or len(titel) < 3: continue
        rows.append({
            "id": _make_id(j.get("url", ""), titel, firma),
            "titel": titel,
            "unternehmen": j.get("unternehmen", firma),
            "ort": j.get("ort", STANDORT),
            "plz": "",
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

# ── Crawl4AI ───────────────────────────────────────────────────────────────────

async def _crawl_career_page(company: dict) -> int:
    """Crawlt eine einzelne Karriere-Seite mit Playwright."""
    firma = company["name"]
    url = company["career_url"]
    ort = company.get("city") or STANDORT

    log.info(f"  Deep Crawl: {firma} → {url}")

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        browser_cfg = BrowserConfig(
            headless=True,
            browser_type="chromium",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
            verbose=False,
        )
        run_cfg = CrawlerRunConfig(
            wait_for_timeout=5000,
            js_code=["window.scrollTo(0, document.body.scrollHeight / 2)"],
            remove_overlay_elements=True,
            page_timeout=35000,
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            result = await crawler.arun(url=url, config=run_cfg)

        if not result or not result.success:
            log.debug(f"  Kein Ergebnis: {firma}")
            return 0

        html = result.html or ""
        markdown = result.markdown or result.fit_markdown or ""

        # Strategie 1: JSON-LD (schnell, präzise)
        jobs = _extract_json_ld(html, firma, ort)
        if jobs:
            saved = _save_jobs(jobs, firma)
            log.info(f"  {firma}: {saved} Jobs (JSON-LD)")
            return saved

        # Strategie 2: __NEXT_DATA__ (Next.js SSR)
        jobs = _extract_next_data(html, firma, ort)
        if jobs:
            saved = _save_jobs(jobs, firma)
            log.info(f"  {firma}: {saved} Jobs (__NEXT_DATA__)")
            return saved

        # Strategie 3: Ollama/Gemma (für alles andere)
        jobs = await _extract_with_ollama(markdown, firma, url)
        if jobs:
            saved = _save_jobs(jobs, firma)
            log.info(f"  {firma}: {saved} Jobs (Ollama)")
            return saved

        log.debug(f"  {firma}: Keine Jobs gefunden")
        return 0

    except ImportError:
        log.error("crawl4ai nicht installiert. Starte setup_crawl4ai.bat")
        return 0
    except Exception as e:
        log.warning(f"  Deep Crawl Fehler {firma}: {e}")
        return 0

# ── Handler ────────────────────────────────────────────────────────────────────

async def run() -> int:
    """Crawlt alle Firmenseiten aus der crawl_companies-Tabelle."""
    log.info("=== Deep Firmenseiten Crawler (Crawl4AI) gestartet ===")
    db = get_db()

    # Alle aktiven Firmen mit career_url laden (zuerst die am längsten nicht gecrawlten)
    result = db.table("crawl_companies") \
        .select("id, name, career_url, city") \
        .eq("is_active", True) \
        .execute()

    companies = [c for c in (result.data or []) if c.get("career_url")]
    if not companies:
        log.info("Keine Firmen in crawl_companies mit career_url.")
        return 0

    log.info(f"Crawle {len(companies)} Firmenseiten...")
    total = 0
    now = datetime.utcnow().isoformat()

    # Sequenziell crawlen (Browser-Ressourcen schonen)
    for company in companies:
        saved = await _crawl_career_page(company)
        total += saved

        # last_crawled aktualisieren
        db.table("crawl_companies") \
            .update({"last_crawled": now}) \
            .eq("id", company["id"]) \
            .execute()

        await asyncio.sleep(1.5)  # Höfliche Pause zwischen Firmen

    log.info(f"=== Deep Firmenseiten fertig: {total} Jobs gespeichert ===")
    return total
