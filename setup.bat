@echo off
echo ============================================
echo  Jobscout Intelligence Platform - Setup
echo ============================================

echo.
echo [1/4] Python venv erstellen...
python -m venv .venv
call .venv\Scripts\activate.bat

echo.
echo [2/4] Abhaengigkeiten installieren...
pip install -r requirements.txt

echo.
echo [3/4] Crawl4AI Setup...
crawl4ai-setup

echo.
echo [4/4] .env Datei vorbereiten...
if not exist .env (
    copy .env.example .env
    echo .env wurde erstellt - bitte SUPABASE_URL und SUPABASE_SERVICE_KEY eintragen!
) else (
    echo .env bereits vorhanden.
)

echo.
echo ============================================
echo  Setup abgeschlossen!
echo.
echo  Naechste Schritte:
echo  1. .env Datei oeffnen und Keys eintragen
echo  2. Supabase Migration ausfuehren:
echo     migrations\002_intelligence_platform.sql
echo  3. Backend starten:
echo     .venv\Scripts\activate
echo     uvicorn main:app --reload --port 8000
echo ============================================
pause
