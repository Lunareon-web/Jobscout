@echo off
echo ================================================
echo  Jobscout Launcher startet auf Port 8001
echo  Dieser Prozess muss laufen damit Start/Stop
echo  im Browser funktioniert.
echo ================================================
call .venv\Scripts\activate.bat
python launcher.py
pause
