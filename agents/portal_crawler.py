"""
Portal Crawler — Crawl4AI + echter Browser (Thread-basiert für Windows)
Crawlt Indeed, StepStone, Kimeta, Karriere.de etc. mit Playwright.
Kein IP-Blocking mehr (lokale Residential IP).
"""
import asyncio
import json
import logging
import re
import urllib.parse
from datetime import datetime

from agents._crawl4ai_thread import crawl_url
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
]

PORTALE = [
    {
        "name": "Indeed",
        "url_fn": lambda t: f"https://de.indeed.com/jobs?q={urllib.parse.quote(t)}&l={urllib.parse.quote(STANDORT)}&radius=50&sort=date",
        "quelle": "Indeed",
    },
    {
        "name": "StepStone",
        "url_fn": lambda t: (
            "https://www.stepstone.de/jobs/"
            + re.sub(r"[^a-z0-9]", "-", t.lower().replace("ä","ae").replace("ö","oe").replace("ü","ue"))
            + f"/in-{STANDORT.lower().replace('ü','ue')}/?radius=50&sort=2"
        ),
        "quelle": "StepStone",
    },
    {
        "name": "Kimeta",
        "url_fn": lambda t: f"https://www.kimeta.de/stellenangebote/?q={urllib.parse.quote(t)}&l={urllib.parse.quote(STANDORT)}&r={UMKREIS}",
        "quelle": "Kimeta RSS",
    },
    {
        "name": "Karriere.de",
        "url_fn": lambda t: f"https://www.karriere.de/jobs?what={urllib.parse.quote(t)}&where={urllib.parse.quote(STANDORT)}&radius={UMKREIS}",
        "quelle": "Karriere.de",
    },
    {
        "name": "Kalaydo",
        "url_fn": lambda t: f"https://www.kalaydo.de/jobs/ergebnisse/?what={urllib.parse.quote(t)}&where={urllib.parse.quote(STANDORT)}&radius={UMKREIS}",
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
    key = (url or f"{titel}||{firma}").lower()
    return re.sub(r"[^a-z0-9]", "", key)[:64]

def _extract_bs4(html: str, quelle: str, base_url: str) -> list[dict]:
    """
    BeautifulSoup-Extraktion für Portal-Suchergebnisse.
    Funktioniert für Indeed, StepStone, Kimeta etc. ohne JSON-LD.
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []

    soup = BeautifulSoup(html, "html.parser")
    jobs = []
    seen = set()

    # ── Indeed ──────────────────────────────────────────────────────────────
    if "indeed.com" in base_url:
        for card in soup.select("[data-jk], .job_seen_beacon, .tapItem"):
            title_el = card.select_one("h2 span, .jobTitle span, [class*='jobTitle']")
            comp_el  = card.select_one("[data-testid='company-name'], .companyName")
            loc_el   = card.select_one("[data-testid='text-location'], .companyLocation")
            link_el  = card.select_one("a[data-jk], a[id*='job_']")
            titel = (title_el.get_text(strip=True) if title_el else "")
            if not titel or len(titel) < 3: continue
            href = ""
            if link_el:
                href = link_el.get("href", "")
                if href and not href.startswith("http"):
                    href = "https://de.indeed.com" + href
            key = (titel + href).lower()
            if key in seen: continue
            seen.add(key)
            jobs.append({
                "titel": titel,
                "unternehmen": comp_el.get_text(strip=True) if comp_el else "",
                "ort": loc_el.get_text(strip=True) if loc_el else STANDORT,
                "datum": "", "url": href,
                "beschreibung": "", "arbeitszeit": "",
            })

    # ── StepStone ────────────────────────────────────────────────────────────
    elif "stepstone.de" in base_url:
        for card in soup.select("article[data-job-id], [class*='ResultList'] article, [class*='jobCard']"):
            title_el = card.select_one("h2, [class*='title'], [class*='Title']")
            comp_el  = card.select_one("[class*='company'], [class*='Company'], [class*='employer']")
            link_el  = card.select_one("a[href*='/stellenangebote/'], a[href*='/job/']")
            titel = (title_el.get_text(strip=True) if title_el else "")
            if not titel or len(titel) < 3: continue
            href = link_el.get("href", "") if link_el else ""
            if href and not href.startswith("http"):
                href = "https://www.stepstone.de" + href
            key = (titel + href).lower()
            if key in seen: continue
            seen.add(key)
            jobs.append({
                "titel": titel,
                "unternehmen": comp_el.get_text(strip=True) if comp_el else "",
                "ort": STANDORT, "datum": "", "url": href,
                "beschreibung": "", "arbeitszeit": "",
            })

    # ── Kimeta / generisch ────────────────────────────────────────────────────
    else:
        # Generisch: Links mit Job-Titeln in h2/h3 + Firmenname in der Nähe
        for el in soup.select("h2 a, h3 a, .job-title a, [class*='jobtitle'] a, [class*='position'] a"):
            titel = el.get_text(strip=True)
            if not titel or len(titel) < 5 or len(titel) > 120: continue
            href = el.get("href", "")
            if href and not href.startswith("http"):
                domain = re.search(r"https?://[^/]+", base_url)
                if domain: href = domain.group(0) + href
            # Firma: nächstes Geschwister-Element
            parent = el.find_parent(["article", "li", "div", "section"])
            firma = ""
            if parent:
                comp = parent.select_one("[class*='company'], [class*='employer'], [class*='arbeitgeber']")
                if comp: firma = comp.get_text(strip=True)
            key = (titel + href).lower()
            if key in seen: continue
            seen.add(key)
            jobs.append({
                "titel": titel, "unternehmen": firma,
                "ort": STANDORT, "datum": "", "url": href,
                "beschreibung": "", "arbeitszeit": "",
            })

    return jobs[:50]  # max 50 pro Seite


def _extract_json_ld(html: str) -> list[dict]:
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
                    "ort": item.get("jobLocation", {}).get("address", {}).get("addressLocality", STANDORT),
                    "datum": item.get("datePosted", ""),
                    "url": item.get("url") or item.get("@id", ""),
                    "beschreibung": _strip_html(item.get("description", ""))[:200],
                    "arbeitszeit": item.get("employmentType", ""),
                })
        except: pass
    return jobs

async def _extract_with_ollama(markdown: str, quelle: str) -> list[dict]:
    if not markdown or len(markdown) < 200: return []
    prompt = f"""
Analysiere diese Job-Suchergebnisseite und extrahiere alle Stellenangebote.
Gib NUR valides JSON zurück:
[{{"titel": "...", "unternehmen": "...", "ort": "...", "url": "https://..."}}]

Quelle: {quelle}
Inhalt:
{markdown[:3000]}
"""
    try:
        result = await LLM.analyze(prompt, "", max_chars=0)
        return result if isinstance(result, list) else []
    except: return []

def _save_jobs(jobs: list[dict], quelle: str) -> int:
    if not jobs: return 0
    db = get_db()
    now = datetime.utcnow().isoformat()
    rows = []
    for j in jobs:
        titel = (j.get("titel") or "").strip()
        if not titel or len(titel) < 3: continue
        rows.append({
            "id": _make_id(j.get("url", ""), titel, j.get("unternehmen", "")),
            "titel": titel,
            "unternehmen": j.get("unternehmen", ""),
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

# ── Portal crawlen ─────────────────────────────────────────────────────────────

async def _crawl_portal(portal: dict, titel: str) -> int:
    url = portal["url_fn"](titel)
    quelle = portal["quelle"]

    html, markdown = await crawl_url(url, wait_ms=4000)
    if not html:
        return 0

    # Strategie 1: JSON-LD (strukturierte Daten)
    jobs = _extract_json_ld(html)

    # Strategie 2: BeautifulSoup (portal-spezifische Selektoren)
    if not jobs:
        jobs = _extract_bs4(html, quelle, url)
        if jobs:
            log.debug(f"  {portal['name']} '{titel}': {len(jobs)} via BS4")

    # Strategie 3: Ollama nur als letzter Fallback (kurzes Prompt, schnell)
    if not jobs and markdown and len(markdown) > 300:
        jobs = await _extract_with_ollama(markdown[:2000], quelle)

    if jobs:
        saved = _save_jobs(jobs, quelle)
        if saved:
            log.info(f"  {portal['name']} '{titel}': {saved} Jobs")
        return saved
    return 0

# ── Entry Point ────────────────────────────────────────────────────────────────

async def run() -> int:
    log.info("=== Portal Crawler (Crawl4AI, Thread-basiert) gestartet ===")
    total = 0

    # Sequenziell: ein Portal-Crawl nach dem anderen
    # Verhindert Ollama-Überlastung bei parallelen Anfragen
    for titel in JOBTITEL:
        for portal in PORTALE:
            try:
                saved = await _crawl_portal(portal, titel)
                total += saved
            except Exception as e:
                log.warning(f"Portal error {portal['name']} '{titel}': {e}")
            await asyncio.sleep(0.5)  # kurze Pause zwischen Requests

    log.info(f"=== Portal Crawler fertig: {total} Jobs ===")
    return total
