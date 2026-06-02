"""
Project Detection Agent
Erkennt Expansion, Store-Eröffnungen, neue HQs etc.
aus Presse/News/Unternehmensblogs.
Output → projects
"""
import logging
import re
from datetime import datetime
import httpx
from bs4 import BeautifulSoup
from core.database import get_db
from core import ollama_client as LLM

log = logging.getLogger(__name__)

PROJECT_KEYWORDS = re.compile(
    r"expansion|eröffnung|opening|flagship|showroom|innovation.?center|"
    r"office move|new headquarters|neuer standort|umzug|messepräsenz|"
    r"store.?konzept|workspace|workplace.?concept|flagship.?store",
    re.I
)

NEWS_PATHS = ["/news", "/presse", "/aktuelles", "/blog", "/press", "/media"]
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124"}


async def _fetch_news_text(base_url: str) -> str:
    """Fetch text from news/press pages."""
    base = base_url.rstrip("/")
    collected = ""
    async with httpx.AsyncClient(timeout=12, headers=HEADERS, follow_redirects=True) as client:
        for path in NEWS_PATHS:
            try:
                r = await client.get(base + path)
                if r.status_code >= 400:
                    continue
                soup = BeautifulSoup(r.text, "lxml")
                text = soup.get_text(separator=" ", strip=True)
                if PROJECT_KEYWORDS.search(text):
                    collected += text[:2000] + "\n"
                if len(collected) > 4000:
                    break
            except Exception:
                continue
    return collected


async def run(company_id: str) -> int:
    db = get_db()

    company = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not company.data:
        return 0
    c = company.data[0]

    log.info(f"Project detection: {c['name']}")
    text = await _fetch_news_text(c["website"])

    if not text.strip():
        return 0

    analysis = await LLM.analyze_project(text)

    if not analysis.get("is_project_signal"):
        return 0
    if analysis.get("project_type") == "none":
        return 0
    if int(analysis.get("confidence", 0)) < 50:
        return 0

    # Check duplicate
    title = analysis.get("title", "")[:200] or f"{analysis['project_type']} – {c['name']}"
    existing = (
        db.table("projects")
        .select("id")
        .eq("company_id", company_id)
        .eq("title", title)
        .execute()
    )
    if existing.data:
        return 0

    db.table("projects").insert({
        "company_id": company_id,
        "project_type": analysis.get("project_type", "expansion"),
        "title": title,
        "location": analysis.get("location", c["city"])[:200],
        "source_url": c["website"] + "/news",
    }).execute()

    # Trigger alert
    db.table("alerts").insert({
        "alert_type": "new_project",
        "company_id": company_id,
        "message": f"📍 Neues Signal: {title} bei {c['name']}",
        "payload": analysis,
    }).execute()

    log.info(f"  → project signal saved: {title}")
    return 1
