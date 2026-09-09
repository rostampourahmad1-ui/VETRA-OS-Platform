# ============================================================================
# VETRA OS — Build Setup.exe (build-setup-exe.ps1)
# Converts setup.ps1 into a standalone setup.exe
# ============================================================================
# Prerequisites: Install-Module -Name ps2exe -Force
# Or included portable method below.
# ============================================================================

param(
    [string]$OutputPath = ".\artifacts\setup\setup.exe",
    [switch]$NoCompress
)

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REPO_ROOT = Split-Path -Parent $SCRIPT_DIR

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VETRA OS — Build Setup.exe" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$setupPs1 = Join-Path $SCRIPT_DIR "setup.ps1"
if (-not (Test-Path $setupPs1)) {
    Write-Host "[ERROR] setup.ps1 not found at: $setupPs1" -ForegroundColor Red
    exit 1
}

$outputFull = Join-Path $REPO_ROOT $OutputPath
$outputDir = Split-Path -Parent $outputFull
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "  Source: $setupPs1" -ForegroundColor Gray
Write-Host "  Output: $outputFull" -ForegroundColor Gray
Write-Host ""

# Method 1: Try PS2EXE module
$ps2exeAvailable = $false
try {
    $module = Get-Module -Name ps2exe -ListAvailable -ErrorAction Stop
    if ($module) {
        $ps2exeAvailable = $true
        Write-Host "[INFO] Using PS2EXE module" -ForegroundColor Gray
        
        Import-Module ps2exe -Force
        
        $params = @{
            InputFile = $setupPs1
            OutputFile = $outputFull
            Title = "VETRA OS Setup"
            Description = "VETRA OS Platform — Local Installation Wizard"
            Company = "Akopark Ara"
            Product = "VETRA OS"
            Copyright = "Akopark Ara 2026"
            Version = "1.0.0.0"
            NoConsole = $false
            RequireAdmin = $false
            Architecture = "x64"
        }
        
        if (-not $NoCompress) {
            Invoke-ps2exe @params
        } else {
            Invoke-ps2exe @params -noCompress
        }
        
        Write-Host "[OK] setup.exe created successfully!" -ForegroundColor Green
        Write-Host "      $outputFull" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] PS2EXE module not available: $_" -ForegroundColor Yellow
    $ps2exeAvailable = $false
}

# Method 2: Fallback — Create self-extracting wrapper
if (-not $ps2exeAvailable) {
    Write-Host ""
    Write-Host "[INFO] PS2EXE not available. Creating self-extracting batch wrapper..." -ForegroundColor Yellow
    Write-Host "[INFO] To create a real .exe, install PS2EXE:" -ForegroundColor Yellow
    Write-Host "      Install-Module -Name ps2exe -Scope CurrentUser -Force" -ForegroundColor Gray
    Write-Host ""
    
    # Create a portable launcher batch that bundles the PS1
    $launcherBat = Join-Path $outputDir "setup-launcher.bat"
    $batContent = @"
@echo off
cd /d "%~dp0..\..\.."
echo ============================================================
echo   VETRA OS — Setup Wizard
echo ============================================================
echo.
echo Extracting setup script...
powershell -ExecutionPolicy Bypass -Command "`$c = Get-Content '%~f0' -Raw; `$s = `$c -replace '^.*?#>>>PS1_START','' -replace '#<<<PS1_END.*$',''; `$s | Out-File 'setup_temp.ps1' -Encoding UTF8; & 'setup_temp.ps1'; Remove-Item 'setup_temp.ps1'"
goto :EOF
REM >>>PS1_START
REM This space intentionally left for embedded PS1
REM <<<PS1_END
"@

    # Actually, let's just create a simple wrapper that calls the ps1
    $wrapperBat = Join-Path $outputDir "SETUP-VETRA.bat"
    @"
@echo off
title VETRA OS — Setup Wizard
cd /d "%~dp0..\.."
echo ============================================================
echo   VETRA OS — Setup Wizard
echo ============================================================
echo.
powershell -ExecutionPolicy Bypass -File "scripts\setup.ps1" %*
pause
"@ | Out-File -FilePath $wrapperBat -Encoding ASCII
    
    Write-Host "[OK] Launcher created: $wrapperBat" -ForegroundColor Green
    Write-Host ""
    Write-Host "  To create a proper setup.exe, run:" -ForegroundColor Yellow
    Write-Host "    Install-Module -Name ps2exe -Scope CurrentUser -Force" -ForegroundColor Gray
    Write-Host "    pwsh scripts\build-setup-exe.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Alternative: Use the batch launcher directly:" -ForegroundColor Yellow
    Write-Host "    Double-click: artifacts\setup\SETUP-VETRA.bat" -ForegroundColor Gray
}

Write-Host "Done!" -ForegroundColor Green
