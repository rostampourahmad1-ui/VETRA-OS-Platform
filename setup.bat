@echo off
REM ============================================================================
REM VETRA OS ? Setup Launcher (setup.bat)
REM Double-click to run the setup wizard
REM ============================================================================
cd /d "%~dp0.."
echo Starting VETRA OS Setup Wizard...
echo.
powershell -ExecutionPolicy Bypass -File "scripts\setup.ps1"
pause
