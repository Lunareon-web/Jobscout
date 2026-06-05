"""
Crawl4AI Thread-Helper
=======================
Löst das Windows-Problem: uvicorn nutzt SelectorEventLoop,
Playwright braucht ProactorEventLoop für subprocess_exec.

Lösung: Jeder Browser-Aufruf läuft in einem separaten Thread
mit eigenem ProactorEventLoop — komplett isoliert vom uvicorn-Loop.

Verwendung in jedem Agent:
    from agents._crawl4ai_thread import crawl_url
    html, markdown = await crawl_url("https://...")
"""
import asyncio
import logging
import sys
import warnings
from typing import Optional

log = logging.getLogger(__name__)


def _run_crawl_in_thread(url: str, wait_ms: int, extra_args: list[str]) -> tuple[str, str]:
    """
    Führt einen einzelnen crawl4ai-Crawl synchron aus.
    Läuft in einem Executor-Thread mit eigenem ProactorEventLoop.
    """
    warnings.filterwarnings("ignore")

    async def _do():
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        browser_cfg = BrowserConfig(
            headless=True,
            browser_type="chromium",
            verbose=False,
            extra_args=extra_args,
        )
        run_cfg = CrawlerRunConfig(
            wait_for_timeout=wait_ms,
            remove_overlay_elements=True,
            page_timeout=35000,
            js_code=["window.scrollTo(0, document.body.scrollHeight / 2)"],
            verbose=False,
        )
        try:
            async with AsyncWebCrawler(config=browser_cfg) as crawler:
                result = await crawler.arun(url=url, config=run_cfg)
                if result and result.success:
                    return result.html or "", result.markdown or result.fit_markdown or ""
                return "", ""
        except Exception as e:
            log.debug(f"Crawl4AI inner error {url}: {e}")
            return "", ""

    # Neuen ProactorEventLoop in diesem Thread erstellen
    if sys.platform == "win32":
        loop = asyncio.ProactorEventLoop()
    else:
        loop = asyncio.new_event_loop()

    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(_do())
    except Exception as e:
        log.warning(f"Crawl thread error {url}: {e}")
        return "", ""
    finally:
        try:
            loop.close()
        except Exception:
            pass
        asyncio.set_event_loop(None)


async def crawl_url(
    url: str,
    wait_ms: int = 4000,
    extra_args: Optional[list[str]] = None,
) -> tuple[str, str]:
    """
    Async-Interface: crawlt URL mit echtem Browser.
    Läuft intern im Thread-Executor (ProactorEventLoop).
    Gibt (html, markdown) zurück.
    """
    args = extra_args or ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    loop = asyncio.get_event_loop()
    try:
        html, markdown = await loop.run_in_executor(
            None, _run_crawl_in_thread, url, wait_ms, args
        )
        return html, markdown
    except Exception as e:
        log.warning(f"crawl_url error {url}: {e}")
        return "", ""
