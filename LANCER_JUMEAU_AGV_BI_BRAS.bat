@echo off
title HUMA-LOG - Jumeau Numerique AGV Bi-Bras
echo ===================================================================
echo   LANCEMENT DU JUMEAU NUMERIQUE HUMA-LOG AGV BI-BRAS & HOT-SWAP
echo ===================================================================
echo.
echo Demarrage du serveur WebGL local sur http://localhost:8080 ...
timeout /t 1 /nobreak >nul
start "" "http://localhost:8080"
python -m http.server 8080 --directory "%~dp0"
