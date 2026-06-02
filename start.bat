@echo off
call .venv\Scripts\activate.bat
echo Starting Jobscout Intelligence Backend on http://localhost:8000
echo API Docs: http://localhost:8000/docs
uvicorn main:app --reload --port 8000
