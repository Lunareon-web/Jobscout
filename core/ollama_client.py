"""
Ollama client wrapper.
Always returns structured JSON — never freetext.
"""
import json
import logging
import httpx
from core.config import settings

log = logging.getLogger(__name__)

PROMPT_COMPANY = """
Du analysierst einen Unternehmenstext. Antworte NUR als JSON ohne Erklärungen:
{
  "company_type": "retail|interior|ladenbau|workplace|architektur|messebau|other",
  "services": ["max 5 Stichworte"],
  "employee_range": "1-10|11-50|51-200|201-500|500+",
  "relevance_score": 0,
  "signals": ["z.B. eigene Stores, Expansion, Designabteilung"]
}

TEXT:
"""

PROMPT_JOB = """
Du bewertest eine Stellenanzeige für einen Projektmanager/Designer im Bereich Interior/Retail/Architektur.
Antworte NUR als JSON ohne Erklärungen:
{
  "relevance": 0,
  "category": "design|interior|architektur|management|sonstiges",
  "signals": ["relevante Aspekte"]
}

STELLENTITEL + BESCHREIBUNG:
"""

PROMPT_PROJECT = """
Du analysierst einen Nachrichtentext auf Expansion, Store-Eröffnungen, neue Standorte oder Workspace-Konzepte.
Antworte NUR als JSON ohne Erklärungen:
{
  "is_project_signal": true,
  "project_type": "expansion|flagship|showroom|innovation_center|office_move|new_hq|trade_show|none",
  "title": "",
  "location": "",
  "confidence": 0
}

TEXT:
"""


async def analyze(prompt_template: str, text: str, max_chars: int = 2000) -> dict:
    """Send text to Ollama, parse JSON response."""
    trimmed = text[:max_chars].strip()
    full_prompt = prompt_template + trimmed

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.ollama_host}/api/generate",
                json={
                    "model": settings.ollama_model,
                    "prompt": full_prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("response", "{}")
            return json.loads(raw)
    except json.JSONDecodeError as e:
        log.warning(f"Ollama JSON parse error: {e}")
        return {}
    except Exception as e:
        log.error(f"Ollama error: {e}")
        return {}


async def analyze_company(text: str) -> dict:
    return await analyze(PROMPT_COMPANY, text)

async def analyze_job(title: str, description: str) -> dict:
    return await analyze(PROMPT_JOB, f"{title}\n{description}")

async def analyze_project(text: str) -> dict:
    return await analyze(PROMPT_PROJECT, text)
