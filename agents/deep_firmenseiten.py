"""
Deep Firmenseiten Crawler — Crawl4AI + Thread-basiert (Windows-Fix)
Crawlt JS-gerenderte Karriere-Seiten (SPAs, React, Vue etc.)
Liest Firmen aus crawl_companies-Tabelle (dynamisch wachsend).
"""
import asyncio
import json
import logging
import re
from datetime import datetime

from agents._crawl4ai_thread import crawl_url
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
                if not titel or not JOBTITEL_RE.search(titel): continue
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
    return jobs

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
    if not markdown or len(markdown) < 100: return []
    prompt = f"""
Analysiere die Karriere-Seite von "{firma}".
Extrahiere alle Stellenangebote für Design/Interior/Architektur/Management.
Gib NUR valides JSON zurück — leeres Array [] wenn keine passenden Stellen:
[{{"titel": "...", "url": "{career_url}", "ort": "..."}}]

Karriere-Seite:
{markdown[:3000]}
"""
    try:
        result = await LLM.analyze(prompt, "", max_chars=0)
        return [j for j in (result if isinstance(result, list) else []) if j.get("titel")]
    except: return []

def _save_jobs(jobs: list[dict], firma: str) -> int:
    if not jobs: return 0
    db = get_db()
    now = datetime.utcnow().isoformat()
    quelle = f"Direkt: {firma}"
    rows = []
    for j in jobs:
        titel = (j.get("titel") or "").strip()
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

# ── Einzelne Firma crawlen ─────────────────────────────────────────────────────

async def _crawl_company(company: dict) -> int:
    firma = company["name"]
    url   = company["career_url"]
    ort   = company.get("city") or STANDORT

    log.info(f"  Deep Crawl: {firma}")

    html, markdown = await crawl_url(url, wait_ms=5000)
    if not html:
        log.debug(f"  Kein HTML: {firma}")
        return 0

    # Strategie 1: JSON-LD
    jobs = _extract_json_ld(html, firma, ort)
    if jobs:
        saved = _save_jobs(jobs, firma)
        log.info(f"  {firma}: {saved} Jobs (JSON-LD)")
        return saved

    # Strategie 2: __NEXT_DATA__
    jobs = _extract_next_data(html, firma, ort)
    if jobs:
        saved = _save_jobs(jobs, firma)
        log.info(f"  {firma}: {saved} Jobs (NextData)")
        return saved

    # Strategie 3: Ollama/Gemma
    jobs = await _extract_with_ollama(markdown, firma, url)
    if jobs:
        saved = _save_jobs(jobs, firma)
        log.info(f"  {firma}: {saved} Jobs (Ollama)")
        return saved

    log.debug(f"  {firma}: Keine Jobs")
    return 0

# ── Entry Point ────────────────────────────────────────────────────────────────

async def run() -> int:
    log.info("=== Deep Firmenseiten Crawler gestartet ===")
    db = get_db()

    result = db.table("crawl_companies") \
        .select("id, name, career_url, city") \
        .eq("is_active", True) \
        .execute()

    # Nur Firmen aus der Seed-Liste (source='manual') oder mit relevantem Namen
    RELEVANTE_BRANCHEN = re.compile(
        r"design|architektur|architekt|interior|shopkonzept|retail|ladenbau|"
        r"messe|ausstellung|agentur|marketing|branding|creative|kreativ|"
        r"einrichtung|raumgestalt|workplace|store|flagship|visual|"
        r"blocher|schweitzer|dula|syma|hpp|rkw|eller|materie|opus|ogilvy|"
        r"markgraph|raumwerk|woehner|wöhner|douglas|peek|lindner|metro|"
        r"huennebeck|hünnebeck|flora.*fauna|ingenhoven|dart",
        re.I
    )
    all_companies = result.data or []
    companies = [
        c for c in all_companies
        if c.get("career_url") and (
            # Seed-Firmen immer crawlen
            RELEVANTE_BRANCHEN.search(c.get("name", ""))
            or RELEVANTE_BRANCHEN.search(c.get("career_url", ""))
        )
    ]
    if not companies:
        log.info("Keine Firmen in crawl_companies mit career_url.")
        return 0

    log.info(f"Crawle {len(companies)} Firmenseiten...")
    total = 0
    now = datetime.utcnow().isoformat()

    # Sequenziell (ein Browser-Thread auf einmal, RAM-schonend)
    for company in companies:
        saved = await _crawl_company(company)
        total += saved
        db.table("crawl_companies") \
            .update({"last_crawled": now}) \
            .eq("id", company["id"]) \
            .execute()
        await asyncio.sleep(1)

    log.info(f"=== Deep Firmenseiten fertig: {total} Jobs ===")
    return total
