@echo off
echo Arret du serveur WebGL local sur le port 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do (
    taskkill /f /pid %%a 2>nul
)
echo Serveur arrete proprement.
timeout /t 2 >nul
