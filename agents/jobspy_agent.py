"""
JobSpy Agent
Scrapt LinkedIn, Indeed, Glassdoor, Google Jobs parallel.
Output → jobs-Tabelle (mit salary_min/salary_max)
"""
import hashlib
import logging
from datetime import datetime

from core.database import get_db
from core.job_validator import is_real_job

log = logging.getLogger(__name__)

SITES = ["indeed", "linkedin", "glassdoor", "google"]

# Felder die aus jobspy kommen
JOBSPY_QUELLE = {
    "indeed":    "Indeed (JobSpy)",
    "linkedin":  "LinkedIn (JobSpy)",
    "glassdoor": "Glassdoor (JobSpy)",
    "google":    "Google Jobs (JobSpy)",
}


def _make_id(title: str, company: str, url: str) -> str:
    raw = f"{title}{company}{url}".lower().replace(" ", "")
    return "js_" + hashlib.md5(raw.encode()).hexdigest()[:14]


def _safe(val, default="") -> str:
    if val is None:
        return default
    try:
        s = str(val).strip()
        return s if s not in ("nan", "None", "") else default
    except Exception:
        return default


def _safe_int(val) -> int | None:
    try:
        v = float(val)
        return int(v) if v > 0 else None
    except Exception:
        return None


async def run() -> int:
    """Scrapt alle konfigurierten Jobtitel über JobSpy."""
    try:
        import jobspy
    except ImportError:
        log.error("python-jobspy not installed. Run: pip install python-jobspy")
        return 0

    db = get_db()

    # Config aus Supabase lesen
    config_res = db.table("app_config").select("value").eq("key", "search_config").execute()
    config = config_res.data[0]["value"] if config_res.data else {}
    jobtitel = config.get("jobtitel", [
        "Projektmanager", "Interior Designer", "Design Manager",
        "Innenarchitekt", "Concept Designer", "Brand Designer",
    ])
    standort = config.get("standort", "Düsseldorf")
    umkreis_km = config.get("umkreis", 60)

    total_new = 0
    now = datetime.utcnow().isoformat() + "Z"

    # Pro Jobtitel scrapen (jobspy ist synchron → in asyncio.executor wrappen)
    import asyncio
    loop = asyncio.get_event_loop()

    for titel in jobtitel:
        log.info(f"JobSpy: scraping '{titel}' in {standort}")
        try:
            df = await loop.run_in_executor(
                None,
                lambda t=titel: jobspy.scrape_jobs(
                    site_name=SITES,
                    search_term=t,
                    location=f"{standort}, Deutschland",
                    distance=umkreis_km,
                    results_wanted=40,
                    hours_old=15,
                    country_indeed="germany",
                    verbose=0,
                )
            )
        except Exception as e:
            log.warning(f"  JobSpy error for '{titel}': {e}")
            continue

        if df is None or len(df) == 0:
            log.info(f"  No results for '{titel}'")
            continue

        log.info(f"  {len(df)} raw results for '{titel}'")

        for _, row in df.iterrows():
            title     = _safe(row.get("title"))
            company   = _safe(row.get("company"))
            location  = _safe(row.get("location"), standort)
            url       = _safe(row.get("job_url"))
            site      = _safe(row.get("site"), "indeed")
            date_raw  = row.get("date_posted")
            desc      = _safe(row.get("description", ""))[:500]
            job_type  = _safe(row.get("job_type"))
            sal_min   = _safe_int(row.get("min_amount"))
            sal_max   = _safe_int(row.get("max_amount"))

            if not title or not url:
                continue

            # Ort bereinigen (LinkedIn gibt "München, Bayern, Deutschland")
            city = location.split(",")[0].strip() if location else standort

            # Datum
            datum = None
            if date_raw is not None:
                try:
                    datum = str(date_raw)[:10]
                except Exception:
                    pass

            # Validierung
            valid, reason = is_real_job(title, url, desc)
            if not valid:
                log.debug(f"  Skip: {reason}")
                continue

            job_id = _make_id(title, company, url)
            quelle = JOBSPY_QUELLE.get(site, f"{site} (JobSpy)")

            # Existiert bereits?
            existing = db.table("jobs").select("id").eq("id", job_id).execute()
            if existing.data:
                db.table("jobs").update({"last_seen": now, "is_active": True}).eq("id", job_id).execute()
                continue

            # Einfügen
            insert_data = {
                "id": job_id,
                "titel": title[:200],
                "unternehmen": company[:200],
                "ort": city[:100],
                "plz": "",
                "datum": datum,
                "url": url[:500],
                "quelle": quelle,
                "beschreibung": desc,
                "arbeitszeit": job_type[:50] if job_type else "",
                "kategorie": "sonstiges",
                "score": 0,
                "is_active": True,
                "last_seen": now,
            }

            # Gehalt falls vorhanden
            if sal_min:
                insert_data["salary_min"] = sal_min
            if sal_max:
                insert_data["salary_max"] = sal_max

            res = db.table("jobs").insert(insert_data).execute()
            if res.data:
                total_new += 1

    log.info(f"JobSpy done. New jobs: {total_new}")
    return total_new
