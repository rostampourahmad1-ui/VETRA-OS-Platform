@echo off
title VETRA OS ? Setup Wizard
cd /d "%~dp0..\.."
echo ============================================================
echo   VETRA OS ? Setup Wizard
echo   Akopark Ara ? 2026
echo ============================================================
echo.
echo This wizard will set up VETRA OS for local development.
echo.
echo Prerequisites:
echo   - Node.js 22+
echo   - Docker Desktop (recommended)
echo   - Git
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause >nul
echo.
powershell -ExecutionPolicy Bypass -File "scripts\setup.ps1"
pause
