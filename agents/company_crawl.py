"""
Company Crawl Agent
Reichert companies-Einträge mit Profildaten an.
Crawl4AI → Text-Extraktion → Chunking → Ollama → JSON → Supabase
"""
import logging
from datetime import datetime
from core.database import get_db
from core import ollama_client as LLM
from core import queue as Q

log = logging.getLogger(__name__)

ENRICH_PATHS = ["/", "/about", "/unternehmen", "/team", "/leistungen", "/projekte", "/news"]


async def _fetch_text(url: str) -> str:
    """Use crawl4ai for JS-aware text extraction."""
    try:
        from crawl4ai import AsyncWebCrawler
        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url)
            return result.markdown or result.extracted_content or ""
    except Exception as e:
        log.warning(f"crawl4ai error on {url}: {e}")
        # Fallback: plain httpx
        import httpx
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(r.text, "lxml")
                return soup.get_text(separator=" ", strip=True)
        except Exception:
            return ""


async def run(company_id: str) -> bool:
    db = get_db()

    company = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not company.data:
        log.warning(f"Company not found: {company_id}")
        return False

    c = company.data[0]
    base = c["website"].rstrip("/")
    log.info(f"Enriching company: {c['name']}")

    # Collect text from key pages (max 3 pages to stay fast)
    collected_text = ""
    for path in ENRICH_PATHS[:3]:
        text = await _fetch_text(base + path)
        collected_text += text[:1500] + "\n"

    if not collected_text.strip():
        log.warning(f"No text extracted for {c['name']}")
        return False

    # Analyze with Ollama
    analysis = await LLM.analyze_company(collected_text)

    if not analysis:
        return False

    # Update company record
    update = {
        "industry": analysis.get("company_type", c.get("industry")),
        "employee_range": analysis.get("employee_range"),
        "services": analysis.get("services", []),
        "last_enriched_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    db.table("companies").update(update).eq("id", company_id).execute()

    # Enqueue scoring after enrichment
    Q.enqueue("scoring", entity_id=company_id)

    log.info(f"  → enriched: {analysis.get('company_type')} score_hint={analysis.get('relevance_score')}")
    return True
