"""
Jobscout Intelligence Platform — FastAPI Backend
Start: uvicorn main:app --reload --port 8000
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from api.routes import router
from core import worker
from core import queue as Q

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


# ── Scheduler ─────────────────────────────────────────────────
scheduler = AsyncIOScheduler()


def schedule_jobs():
    # JobSpy: 1x täglich 06:30 — LinkedIn, Indeed, Glassdoor, Google Jobs
    scheduler.add_job(
        lambda: Q.enqueue("jobspy", priority=8),
        "cron", hour=6, minute=30, id="jobspy_daily"
    )
    # Discovery: 1x täglich um 06:00
    scheduler.add_job(
        lambda: Q.enqueue("discovery"),
        "cron", hour=6, minute=0, id="discovery_daily"
    )
    # Career crawl für alle aktiven Unternehmen: täglich 07:00
    scheduler.add_job(
        _enqueue_all_career_pages,
        "cron", hour=7, minute=0, id="career_daily"
    )
    # Project detection: täglich 08:00
    scheduler.add_job(
        _enqueue_all_projects,
        "cron", hour=8, minute=0, id="project_daily"
    )
    # Contact: 1x/Woche Montag 09:00
    scheduler.add_job(
        _enqueue_all_contacts,
        "cron", day_of_week="mon", hour=9, id="contact_weekly"
    )


def _enqueue_all_career_pages():
    from core.database import get_db
    db = get_db()
    companies = db.table("companies").select("id").eq("is_active", True).execute()
    for c in companies.data or []:
        Q.enqueue("career_page", entity_id=c["id"])
    log.info(f"Enqueued {len(companies.data or [])} career page crawls")


def _enqueue_all_projects():
    from core.database import get_db
    db = get_db()
    # Only A+/A companies for project detection
    companies = db.table("companies").select("id").in_("priority", ["A+", "A"]).execute()
    for c in companies.data or []:
        Q.enqueue("project", entity_id=c["id"])


def _enqueue_all_contacts():
    from core.database import get_db
    db = get_db()
    companies = db.table("companies").select("id").in_("priority", ["A+", "A", "B"]).execute()
    for c in companies.data or []:
        Q.enqueue("contact", entity_id=c["id"])


# ── App Lifespan ───────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Jobscout Intelligence Platform...")
    schedule_jobs()
    scheduler.start()
    # Start background worker
    asyncio.create_task(worker.run_forever(interval=3.0))
    log.info("Worker and scheduler running.")
    yield
    scheduler.shutdown()
    log.info("Shutdown complete.")


app = FastAPI(
    title="Jobscout Intelligence API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {"status": "ok", "service": "Jobscout Intelligence Platform v2"}

@app.get("/health")
def health():
    return {"status": "ok"}
