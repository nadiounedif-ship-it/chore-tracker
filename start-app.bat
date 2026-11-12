@echo off
title Chore Manager Launcher
echo ========================================================
echo   Starting Chore Manager (Backend + Frontend)
echo ========================================================
echo.

start "Chore Manager - Backend (Port 4000)" cmd /k "cd /d %~dp0server && npm.cmd run dev"
timeout /t 3 /nobreak >nul
start "Chore Manager - Frontend (Port 5173)" cmd /k "cd /d %~dp0client && npm.cmd run dev"

echo.
echo Servers are launching in separate windows!
echo Once loaded, open your browser to:
echo.
echo    http://localhost:5173
echo.
echo Press any key to close this launcher window (servers keep running)...
pause >nul
