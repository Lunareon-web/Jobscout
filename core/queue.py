"""
Queue Manager — reads/writes crawl_queue in Supabase.
Priority: 10 = highest (alerts), 1 = lowest (discovery).
"""
import logging
from datetime import datetime, timedelta
from uuid import UUID
from core.database import get_db

log = logging.getLogger(__name__)

PRIORITY = {
    "alert":            9,
    "scoring":          8,
    "career_page":      8,
    "validation":       7,
    "project":          6,
    "company":          5,
    "contact":          4,
    "discovery":        3,
    "company_candidate":6,
}


def enqueue(entity_type: str, entity_id: str | None = None,
            priority: int | None = None, delay_seconds: int = 0) -> dict:
    db = get_db()
    prio = priority or PRIORITY.get(entity_type, 5)
    next_run = datetime.utcnow() + timedelta(seconds=delay_seconds)

    row = {
        "entity_type": entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "priority": prio,
        "status": "pending",
        "next_run": next_run.isoformat() + "Z",
    }
    res = db.table("crawl_queue").insert(row).execute()
    return res.data[0] if res.data else {}


def pop_next() -> dict | None:
    """Fetch and lock the next pending item."""
    db = get_db()
    now = datetime.utcnow().isoformat() + "Z"
    res = (
        db.table("crawl_queue")
        .select("*")
        .eq("status", "pending")
        .lte("next_run", now)
        .order("priority", desc=True)
        .order("next_run")
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    item = res.data[0]
    # Mark as running
    db.table("crawl_queue").update({"status": "running"}).eq("id", item["id"]).execute()
    return item


def mark_done(queue_id: str, items_found: int = 0):
    db = get_db()
    db.table("crawl_queue").update({
        "status": "done",
    }).eq("id", queue_id).execute()
    log.info(f"Queue item {queue_id} done. Items found: {items_found}")


def mark_error(queue_id: str, error: str):
    db = get_db()
    db.table("crawl_queue").update({
        "status": "error",
        "error_msg": error[:500],
        "attempts": db.table("crawl_queue").select("attempts").eq("id", queue_id).execute().data[0]["attempts"] + 1,
    }).eq("id", queue_id).execute()
    log.warning(f"Queue item {queue_id} error: {error}")


def reschedule(queue_id: str, delay_seconds: int = 3600):
    """Put item back to pending with a delay (for retry)."""
    db = get_db()
    next_run = (datetime.utcnow() + timedelta(seconds=delay_seconds)).isoformat()
    db.table("crawl_queue").update({
        "status": "pending",
        "next_run": next_run,
    }).eq("id", queue_id).execute()


def queue_status() -> dict:
    db = get_db()
    res = db.table("crawl_queue").select("status, entity_type").execute()
    summary: dict = {}
    for row in res.data or []:
        key = f"{row['entity_type']}.{row['status']}"
        summary[key] = summary.get(key, 0) + 1
    return summary
