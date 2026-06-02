"""
Queue Worker
Läuft als Endlos-Loop. Holt den nächsten Job aus crawl_queue
und dispatcht an den passenden Agenten.
"""
import asyncio
import logging
from core import queue as Q

log = logging.getLogger(__name__)

AGENT_MAP = {
    "discovery":         "agents.discovery",
    "validation":        "agents.validation",
    "company_candidate": "agents.validation",   # alias
    "company":           "agents.company_crawl",
    "career_page":       "agents.career",
    "project":           "agents.project_detection",
    "contact":           "agents.contact",
    "scoring":           "agents.scoring",
}


async def _dispatch(item: dict):
    entity_type = item["entity_type"]
    entity_id = item.get("entity_id")
    queue_id = item["id"]

    module_name = AGENT_MAP.get(entity_type)
    if not module_name:
        log.warning(f"Unknown entity_type: {entity_type}")
        Q.mark_error(queue_id, f"Unknown entity_type: {entity_type}")
        return

    try:
        import importlib
        module = importlib.import_module(module_name)

        if entity_id:
            result = await module.run(entity_id)
        else:
            result = await module.run()

        items_found = result if isinstance(result, int) else (1 if result else 0)
        Q.mark_done(queue_id, items_found)

    except Exception as e:
        log.error(f"Agent error [{entity_type}]: {e}", exc_info=True)
        Q.mark_error(queue_id, str(e))


async def run_once():
    """Process one item from the queue."""
    item = Q.pop_next()
    if not item:
        return False
    log.info(f"Processing: {item['entity_type']} {item.get('entity_id', '')}")
    await _dispatch(item)
    return True


async def run_forever(interval: float = 5.0):
    """Continuous worker loop."""
    log.info("Queue worker started.")
    while True:
        try:
            processed = await run_once()
            if not processed:
                await asyncio.sleep(interval)
        except Exception as e:
            log.error(f"Worker loop error: {e}", exc_info=True)
            await asyncio.sleep(interval)
