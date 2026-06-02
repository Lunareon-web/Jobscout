"""
Scoring Agent
Berechnet company.score (0-100) und priority (A+/A/B/C/D)
basierend auf Branche, Merkmalen und offenen Stellen.
"""
import logging
from datetime import datetime
from core.database import get_db
from core import queue as Q

log = logging.getLogger(__name__)

# ── Scoring-Gewichte ──────────────────────────────────────────
INDUSTRY_SCORES = {
    "retail":      25,
    "interior":    25,
    "ladenbau":    25,
    "workplace":   20,
    "architektur": 20,
    "messebau":    15,
    "other":        5,
}

JOB_TITLE_SCORES = {
    "store development": 25,
    "project manager":   20,
    "projektmanager":    20,
    "design manager":    20,
    "workplace manager": 20,
    "interior designer": 15,
    "innenarchitekt":    15,
    "concept designer":  15,
    "retail design":     20,
}

PRIORITY_BANDS = [
    (90, "A+"),
    (80, "A"),
    (70, "B"),
    (60, "C"),
    (0,  "D"),
]


def _priority(score: int) -> str:
    for threshold, label in PRIORITY_BANDS:
        if score >= threshold:
            return label
    return "D"


async def run(company_id: str) -> int:
    db = get_db()

    company = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not company.data:
        return 0
    c = company.data

    score = 0

    # 1. Industry score
    industry = (c.get("industry") or "other").lower()
    score += INDUSTRY_SCORES.get(industry, 5)

    # 2. Feature scores
    services = [s.lower() for s in (c.get("services") or [])]
    service_text = " ".join(services)

    if any(kw in service_text for kw in ["store", "shop", "retail", "filiale"]):
        score += 20  # Eigene Stores
    if any(kw in service_text for kw in ["expansion", "wachstum", "eröffnung"]):
        score += 15  # Expansion
    if any(kw in service_text for kw in ["international", "global", "europe"]):
        score += 15  # International
    if any(kw in service_text for kw in ["design", "gestaltung", "kreativ"]):
        score += 20  # Eigene Designabteilung
    if any(kw in service_text for kw in ["project", "projekt", "management"]):
        score += 20  # Projektmanagement-Team

    # 3. Active job scores
    jobs = (
        db.table("jobs")
        .select("titel, score")
        .eq("company_id", company_id)
        .eq("is_active", True)
        .execute()
    ).data or []

    job_bonus = 0
    for job in jobs:
        title_lower = job["titel"].lower()
        for kw, pts in JOB_TITLE_SCORES.items():
            if kw in title_lower:
                job_bonus = max(job_bonus, pts)
    score += min(job_bonus, 25)  # Max 25 from jobs

    # 4. Project signals bonus
    projects = (
        db.table("projects")
        .select("project_type")
        .eq("company_id", company_id)
        .execute()
    ).data or []
    if projects:
        score += min(len(projects) * 5, 15)  # Up to +15 for signals

    # Cap at 100
    score = min(score, 100)
    priority = _priority(score)

    # Save
    old_score = c.get("score", 0)
    db.table("companies").update({
        "score": score,
        "priority": priority,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", company_id).execute()

    # Alert if significant improvement
    if score >= 70 and old_score < 70:
        db.table("alerts").insert({
            "alert_type": "score_change",
            "company_id": company_id,
            "message": f"⭐ {c['name']} jetzt {priority} (Score {score})",
            "payload": {"old_score": old_score, "new_score": score},
        }).execute()

    log.info(f"Scored {c['name']}: {score} → {priority}")
    return score
