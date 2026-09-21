@echo off
title Comms Hub Server
cd /d "%~dp0"
echo ===================================================
echo Starting Comms Hub Production Server on LAN (Port 3000)...
echo ===================================================
npm run start:lan
echo.
echo Server has stopped.
pause
