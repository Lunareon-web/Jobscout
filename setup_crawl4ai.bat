@echo off
echo ============================================
echo  Crawl4AI Setup -- Einmalig ausfuehren
echo ============================================
echo.
cd /d "%~dp0"

echo [1/4] crawl4ai installieren (ohne lxml, Python 3.14 kompatibel)...
python -m pip install crawl4ai --only-binary :all:
if errorlevel 1 (
    echo Versuche ohne Binaer-Einschraenkung...
    python -m pip install crawl4ai --ignore-requires-python
)

echo.
echo [2/4] Playwright installieren...
python -m pip install playwright
if errorlevel 1 goto fehler

echo.
echo [3/4] Playwright Chromium Browser herunterladen (~280MB)...
python -m playwright install chromium
if errorlevel 1 goto fehler

echo.
echo [4/4] Browser-Test...
python -c "
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
async def test():
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as c:
        r = await c.arun('https://example.com', config=CrawlerRunConfig(page_timeout=8000, verbose=False))
        print('OK' if r.success else 'FEHLER')
asyncio.run(test())
"

echo.
echo ============================================
echo  Setup abgeschlossen!
echo ============================================
pause
exit /b 0

:fehler
echo FEHLER aufgetreten
pause
exit /b 1
