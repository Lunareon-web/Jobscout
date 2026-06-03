from fastapi import APIRouter, HTTPException, Query
from core.database import get_db
from core import queue as Q

router = APIRouter()


# ── Companies ─────────────────────────────────────────────────

@router.get("/companies")
def list_companies(
    priority: str | None = None,
    industry: str | None = None,
    city: str | None = None,
    min_score: int = 0,
    limit: int = 50,
    offset: int = 0,
):
    db = get_db()
    q = db.table("companies").select("*, career_pages(url, status, last_checked)")
    if priority:
        q = q.eq("priority", priority)
    if industry:
        q = q.eq("industry", industry)
    if city:
        q = q.ilike("city", f"%{city}%")
    if min_score:
        q = q.gte("score", min_score)
    res = q.order("score", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data, "count": len(res.data)}


@router.get("/companies/{company_id}")
def get_company(company_id: str):
    db = get_db()
    c = db.table("companies").select("*").eq("id", company_id).single().execute()
    if not c.data:
        raise HTTPException(404, "Company not found")
    jobs = db.table("jobs").select("*").eq("company_id", company_id).eq("is_active", True).order("score", desc=True).execute()
    contacts = db.table("contacts").select("*").eq("company_id", company_id).execute()
    projects = db.table("projects").select("*").eq("company_id", company_id).order("created_at", desc=True).execute()
    return {
        "company": c.data,
        "jobs": jobs.data,
        "contacts": contacts.data,
        "projects": projects.data,
    }


# ── Jobs ──────────────────────────────────────────────────────

@router.get("/jobs")
def list_jobs(
    min_score: int = 0,
    company_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    db = get_db()
    q = db.table("jobs").select("*, companies(name, industry, priority)").eq("is_active", True)
    if min_score:
        q = q.gte("score", min_score)
    if company_id:
        q = q.eq("company_id", company_id)
    res = q.order("score", desc=True).range(offset, offset + limit - 1).execute()
    return {"data": res.data, "count": len(res.data)}


# ── Alerts ────────────────────────────────────────────────────

@router.get("/alerts")
def list_alerts(unread_only: bool = False, limit: int = 30):
    db = get_db()
    q = db.table("alerts").select("*, companies(name)")
    if unread_only:
        q = q.eq("is_read", False)
    res = q.order("created_at", desc=True).limit(limit).execute()
    return {"data": res.data, "count": len(res.data)}


@router.patch("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: str):
    db = get_db()
    db.table("alerts").update({"is_read": True}).eq("id", alert_id).execute()
    return {"ok": True}


# ── Queue ─────────────────────────────────────────────────────

@router.get("/queue/status")
def queue_status():
    return Q.queue_status()


@router.post("/queue/trigger/{agent}")
async def trigger_agent(agent: str, entity_id: str | None = None):
    valid = {"discovery", "validation", "company", "career_page", "project", "contact", "scoring"}
    if agent not in valid:
        raise HTTPException(400, f"Unknown agent. Valid: {valid}")
    item = Q.enqueue(agent, entity_id=entity_id)
    return {"queued": item}


@router.post("/queue/run-discovery")
async def run_discovery_now():
    """Trigger a full discovery run immediately."""
    item = Q.enqueue("discovery", priority=10)
    return {"queued": item, "msg": "Discovery agent triggered"}


@router.post("/queue/run-jobspy")
async def run_jobspy_now():
    """Trigger JobSpy scrape immediately (LinkedIn, Indeed, Glassdoor, Google)."""
    item = Q.enqueue("jobspy", priority=9)
    return {"queued": item, "msg": "JobSpy agent triggered — scraping LinkedIn, Indeed, Glassdoor, Google Jobs"}


# ── Stats ─────────────────────────────────────────────────────

@router.get("/stats")
def stats():
    db = get_db()
    companies = db.table("companies").select("id", count="exact").execute()
    jobs = db.table("jobs").select("id", count="exact").eq("is_active", True).execute()
    alerts = db.table("alerts").select("id", count="exact").eq("is_read", False).execute()
    candidates = db.table("company_candidates").select("id", count="exact").eq("status", "pending").execute()
    return {
        "companies": companies.count,
        "active_jobs": jobs.count,
        "unread_alerts": alerts.count,
        "pending_candidates": candidates.count,
        "queue": Q.queue_status(),
    }
