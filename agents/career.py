"""
Career Agent
Crawlt Karriereseiten und extrahiert Jobs.
Strategien: JSON-LD → __NEXT_DATA__ → ATS-APIs → Link-Scan
Output → jobs (mit company_id)
"""
import logging
import re
import hashlib
from datetime import datetime
import httpx
from bs4 import BeautifulSoup
from core.database import get_db
from core import ollama_client as LLM
from core import queue as Q

log = logging.getLogger(__name__)

JOB_KEYWORDS = re.compile(
    r"projekt|project|design|interior|retail|store|shop|workplace|"
    r"architektur|architect|innenarchitekt|concept|brand|visual|display|"
    r"manager|leitung|direktor|director|head of",
    re.I
)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124",
    "Accept-Language": "de-DE,de;q=0.9",
}


def _strip_html(s: str) -> str:
    return re.sub(r"<[^>]+>", " ", s or "").strip()


def _make_id(title: str, company: str, url: str) -> str:
    raw = f"{title}{company}{url}".lower().replace(" ", "")
    return hashlib.md5(raw.encode()).hexdigest()[:16]


def _parse_json_ld(html: str, company_name: str, city: str) -> list[dict]:
    jobs = []
    pattern = re.compile(r'<script[^>]+type="application/ld\+json"[^>]*>([\s\S]*?)</script>', re.I)
    for m in pattern.finditer(html):
        try:
            import json
            obj = json.loads(m.group(1).strip())
            items = obj if isinstance(obj, list) else obj.get("@graph", [obj])
            for item in items:
                if not item or item.get("@type") != "JobPosting":
                    continue
                title = item.get("title", "")
                if not title or not JOB_KEYWORDS.search(title):
                    continue
                jobs.append({
                    "title": title,
                    "company": item.get("hiringOrganization", {}).get("name", company_name),
                    "city": item.get("jobLocation", {}).get("address", {}).get("addressLocality", city),
                    "date": item.get("datePosted", ""),
                    "url": item.get("url", item.get("@id", "")),
                    "description": _strip_html(item.get("description", ""))[:300],
                    "employment_type": item.get("employmentType", ""),
                })
        except Exception:
            continue
    return jobs


def _parse_next_data(html: str, company_name: str, city: str) -> list[dict]:
    jobs = []
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>({[\s\S]+?})</script>', html)
    if not m:
        return jobs
    try:
        import json
        nd = json.loads(m.group(1))
        paths = [
            ["props", "pageProps", "jobs"],
            ["props", "pageProps", "vacancies"],
            ["props", "pageProps", "positions"],
            ["props", "pageProps", "jobOffers"],
            ["props", "pageProps", "data", "jobs"],
        ]
        for path in paths:
            val = nd
            for key in path:
                val = val.get(key) if isinstance(val, dict) else None
            if isinstance(val, list) and val:
                for item in val:
                    title = item.get("title") or item.get("jobTitle") or item.get("name") or ""
                    if not title or not JOB_KEYWORDS.search(title):
                        continue
                    jobs.append({
                        "title": title,
                        "company": item.get("company", company_name),
                        "city": item.get("location") or item.get("city") or city,
                        "date": item.get("datePosted") or item.get("date") or "",
                        "url": item.get("url") or item.get("applyUrl") or "",
                        "description": item.get("teaser") or item.get("description") or "",
                        "employment_type": item.get("employmentType") or "",
                    })
                break
    except Exception:
        pass
    return jobs


def _parse_link_scan(html: str, base_url: str, company_name: str, city: str) -> list[dict]:
    jobs = []
    soup = BeautifulSoup(html, "lxml")
    seen = set()
    for a in soup.find_all("a", href=True):
        txt = a.get_text(strip=True)
        if not txt or len(txt) < 5 or len(txt) > 120:
            continue
        if not JOB_KEYWORDS.search(txt):
            continue
        href = a["href"]
        if not href.startswith("http"):
            from urllib.parse import urljoin
            href = urljoin(base_url, href)
        if href in seen:
            continue
        seen.add(href)
        jobs.append({
            "title": txt,
            "company": company_name,
            "city": city,
            "date": "",
            "url": href,
            "description": "",
            "employment_type": "",
        })
        if len(jobs) >= 15:
            break
    return jobs


async def _fetch_html(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=15, headers=HEADERS, follow_redirects=True) as client:
            r = await client.get(url)
            return r.text if r.status_code < 400 else ""
    except Exception as e:
        log.warning(f"Fetch error {url}: {e}")
        return ""


async def _score_job(title: str, description: str) -> int:
    result = await LLM.analyze_job(title, description)
    return int(result.get("relevance", 0))


async def run(company_id: str) -> int:
    db = get_db()

    # Get company + career pages
    company = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not company.data:
        return 0
    c = company.data

    pages = db.table("career_pages").select("*").eq("company_id", company_id).execute()
    if not pages.data:
        log.info(f"No career pages for {c['name']}")
        return 0

    total_new = 0
    now = datetime.utcnow().isoformat()

    for page in pages.data:
        url = page["url"]
        log.info(f"Career crawl: {c['name']} → {url}")
        html = await _fetch_html(url)

        if not html:
            db.table("career_pages").update({"status": "error", "last_checked": now}).eq("id", page["id"]).execute()
            continue

        # Try strategies in order
        jobs = _parse_json_ld(html, c["name"], c["city"])
        if not jobs:
            jobs = _parse_next_data(html, c["name"], c["city"])
        if not jobs:
            jobs = _parse_link_scan(html, url, c["name"], c["city"])

        # Deduplicate + save
        page_new = 0
        for job in jobs:
            job_id = _make_id(job["title"], c["name"], job["url"])
            score = await _score_job(job["title"], job.get("description", ""))

            existing = db.table("jobs").select("id").eq("id", job_id).execute()
            if existing.data:
                # Update last_seen
                db.table("jobs").update({"last_seen": now, "is_active": True}).eq("id", job_id).execute()
                continue

            db.table("jobs").insert({
                "id": job_id,
                "titel": job["title"][:200],
                "unternehmen": job["company"][:200],
                "ort": job["city"][:100],
                "plz": "",
                "datum": job.get("date") or None,
                "url": job["url"][:500],
                "quelle": f"Direkt: {c['name']}",
                "beschreibung": job.get("description", "")[:500],
                "arbeitszeit": job.get("employment_type", "")[:50],
                "kategorie": "sonstiges",
                "company_id": company_id,
                "score": score,
                "is_active": True,
                "last_seen": now,
            }).execute()

            # Fire alert for high-score jobs
            if score >= 70:
                Q.enqueue("alert", entity_id=company_id)

            page_new += 1
            total_new += 1

        db.table("career_pages").update({
            "status": "ok" if jobs else "empty",
            "last_checked": now,
            "jobs_found": len(jobs),
        }).eq("id", page["id"]).execute()

        log.info(f"  → {page_new} new jobs")

    return total_new
