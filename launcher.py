"""
Jobscout Launcher — Port 8001
Kleiner always-on Prozess der den Haupt-Backend (Port 8000) startet/stoppt.
Einmalig starten: start_launcher.bat
"""
import subprocess
import sys
import os
import signal
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="Jobscout Launcher", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

BASE_DIR = Path(__file__).parent
VENV_PYTHON = BASE_DIR / ".venv" / "Scripts" / "python.exe"

_process: subprocess.Popen | None = None


def _is_running() -> bool:
    global _process
    if _process is None:
        return False
    return _process.poll() is None


@app.get("/status")
def status():
    running = _is_running()
    return {
        "running": running,
        "pid": _process.pid if running else None,
        "port": 8000,
    }


@app.post("/start")
def start():
    global _process
    if _is_running():
        return {"ok": False, "msg": "Already running", "pid": _process.pid}

    log_file = open(BASE_DIR / "backend.log", "a", encoding="utf-8")
    _process = subprocess.Popen(
        [str(VENV_PYTHON), "-m", "uvicorn", "main:app", "--port", "8000", "--host", "0.0.0.0"],
        cwd=str(BASE_DIR),
        stdout=log_file,
        stderr=log_file,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )
    return {"ok": True, "msg": "Backend gestartet", "pid": _process.pid}


@app.post("/stop")
def stop():
    global _process
    if not _is_running():
        return {"ok": False, "msg": "Backend läuft nicht"}

    pid = _process.pid
    if sys.platform == "win32":
        _process.send_signal(signal.CTRL_BREAK_EVENT)
    else:
        _process.terminate()

    try:
        _process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        _process.kill()

    _process = None
    return {"ok": True, "msg": f"Backend gestoppt (PID {pid})"}


@app.get("/logs")
def logs():
    """Letzte 80 Zeilen aus backend.log."""
    log_path = BASE_DIR / "backend.log"
    if not log_path.exists():
        return {"lines": ["(noch keine Logs)"]}
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
        return {"lines": [l.rstrip() for l in lines[-80:]]}
    except Exception as e:
        return {"lines": [f"Fehler: {e}"]}


if __name__ == "__main__":
    print("Jobscout Launcher startet auf http://localhost:8001")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="warning")
