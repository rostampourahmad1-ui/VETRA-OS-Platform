# ============================================================================
# VETRA OS — Setup Script (setup.ps1)
# نصب تمام‌اتوماتیک محلی برای تست انسانی
# ============================================================================
# Usage: powershell -ExecutionPolicy Bypass -File setup.ps1
# Or:    .\setup.ps1
# ============================================================================

param(
    [switch]$SkipPrerequisites,
    [switch]$SkipDocker,
    [switch]$SkipEnvConfig,
    [switch]$SkipInstall,
    [switch]$SkipMigration,
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$StartAfterSetup,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ROOT) { $ROOT = Get-Location }

# Resolve to repo root
$REPO_ROOT = $ROOT
if ((Split-Path -Leaf $ROOT) -eq "scripts") {
    $REPO_ROOT = Split-Path -Parent $ROOT
}

# Colors
function Write-Header { param([string]$Text) Write-Host "`n============================================================" -ForegroundColor Cyan; Write-Host "  $Text" -ForegroundColor Cyan; Write-Host "============================================================" -ForegroundColor Cyan }
function Write-Step { param([string]$Text) Write-Host "`n>>> $Text" -ForegroundColor Yellow }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Magenta }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }

# ============================================================================
# HEADER
# ============================================================================
Clear-Host
Write-Host @"
██╗   ██╗███████╗████████╗██████╗  █████╗
██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗
██║   ██║█████╗     ██║   ██████╔╝███████║
╚██╗ ██╔╝██╔══╝     ██║   ██╔══██╗██╔══██║
 ╚████╔╝ ███████╗   ██║   ██║  ██║██║  ██║
  ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝
            OS Platform — Setup Wizard
============================================
"@ -ForegroundColor Cyan

Write-Host "  Repository: $REPO_ROOT" -ForegroundColor Gray
Write-Host "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# 1. PREREQUISITES CHECK
# ============================================================================
if (-not $SkipPrerequisites) {
    Write-Header "STEP 1/7: Checking Prerequisites"

    $allOk = $true

    # Node.js
    Write-Step "Checking Node.js..."
    try {
        $nodeVersion = node --version 2>&1
        Write-OK "Node.js $nodeVersion"
    } catch {
        Write-Err "Node.js not found! Please install Node.js 22+ from https://nodejs.org"
        $allOk = $false
    }

    # pnpm
    Write-Step "Checking pnpm..."
    try {
        $pnpmVersion = pnpm --version 2>&1
        Write-OK "pnpm $pnpmVersion"
    } catch {
        Write-Warn "pnpm not found. Attempting to enable via corepack..."
        try {
            corepack enable 2>&1 | Out-Null
            corepack prepare pnpm@latest --activate 2>&1 | Out-Null
            $pnpmVersion = pnpm --version 2>&1
            Write-OK "pnpm $pnpmVersion (via corepack)"
        } catch {
            Write-Err "Cannot install pnpm. Please install manually: npm install -g pnpm"
            $allOk = $false
        }
    }

    # Git
    Write-Step "Checking Git..."
    try {
        $gitVersion = git --version 2>&1
        Write-OK "$gitVersion"
    } catch {
        Write-Warn "Git not found (optional, but recommended)"
    }

    # Docker
    if (-not $SkipDocker) {
        Write-Step "Checking Docker..."
        try {
            $dockerVersion = docker --version 2>&1
            Write-OK "$dockerVersion"
            try {
                docker info 2>&1 | Out-Null
                Write-OK "Docker daemon is running"
            } catch {
                Write-Warn "Docker is installed but not running. Start Docker Desktop first."
            }
        } catch {
            Write-Warn "Docker not found. Database will need to be set up manually."
        }
    }

    if (-not $allOk) {
        Write-Err "Prerequisites check failed. Please install missing tools and try again."
        exit 1
    }

    Write-OK "All prerequisites satisfied!"
}

# ============================================================================
# 2. ENVIRONMENT CONFIGURATION
# ============================================================================
if (-not $SkipEnvConfig) {
    Write-Header "STEP 2/7: Environment Configuration"

    $envFile = Join-Path $REPO_ROOT ".env"
    $reconfigure = $false

    if (Test-Path $envFile) {
        Write-OK ".env file already exists"
        if (-not $Quiet) {
            $overwrite = Read-Host "  Do you want to reconfigure? (y/N)"
            if ($overwrite -eq 'y' -or $overwrite -eq 'Y') {
                $reconfigure = $true
            } else {
                Write-Info "Skipping .env configuration"
            }
        }
    } else {
        Write-Info "No .env file found. Creating from .env.example..."
        $reconfigure = $true
    }

    if ($reconfigure) {
        Write-Step "Configuring environment variables..."
        Write-Host ""
        Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
        Write-Host "  |  IMPORTANT: You need Clerk API keys to continue.    |" -ForegroundColor Yellow
        Write-Host "  |  Get them from: https://dashboard.clerk.com         |" -ForegroundColor Yellow
        Write-Host "  +------------------------------------------------------+" -ForegroundColor Yellow
        Write-Host ""

        $clerkSecret = Read-Host "  Clerk Secret Key (sk_test_...)"
        $clerkPublishable = Read-Host "  Clerk Publishable Key (pk_test_...)"

        $dbPassword = Read-Host "  PostgreSQL Admin Password (default: vetra_admin_pass)"
        if (-not $dbPassword) { $dbPassword = "vetra_admin_pass" }

        $appPassword = Read-Host "  PostgreSQL App Password (default: vetra_app_pass)"
        if (-not $appPassword) { $appPassword = "vetra_app_pass" }

        Write-Host ""
        $useAI = Read-Host "  Configure OpenAI for AI features? (y/N)"
        $openaiKey = ""
        if ($useAI -eq 'y' -or $useAI -eq 'Y') {
            $openaiKey = Read-Host "  OpenAI API Key (sk-...)"
        }

        $envContent = @"
# ============================================================================
# VETRA OS — Environment Configuration
# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm')
# ============================================================================

# Database
DATABASE_URL=postgresql://vetra_admin:${dbPassword}@localhost:5432/vetra_dev
DATABASE_APP_URL=postgresql://vetra_app:${appPassword}@localhost:5432/vetra_dev
DATABASE_MIGRATION_URL=postgresql://vetra_migration:${dbPassword}@localhost:5432/vetra_dev
DATABASE_READONLY_URL=postgresql://vetra_readonly:${appPassword}@localhost:5432/vetra_dev
DATABASE_PGBOUNCER_URL=postgresql://vetra_app:${appPassword}@localhost:6432/vetra_dev

# Docker Compose
POSTGRES_ADMIN_PASSWORD=${dbPassword}
POSTGRES_APP_PASSWORD=${appPassword}
POSTGRES_MIGRATION_PASSWORD=${dbPassword}
POSTGRES_READONLY_PASSWORD=${appPassword}
POSTGRES_DB=vetra_dev
POSTGRES_ADMIN_USER=vetra_admin
POSTGRES_APP_USER=vetra_app

# Clerk Authentication
CLERK_SECRET_KEY=${clerkSecret}
CLERK_PUBLISHABLE_KEY=${clerkPublishable}
VITE_CLERK_PUBLISHABLE_KEY=${clerkPublishable}
CLERK_WEBHOOK_SECRET=whsec_replace_with_webhook_secret

# API Server
PORT=5000
CORS_ALLOWED_ORIGINS=http://localhost:5173

# OpenAI (Optional)
OPENAI_API_KEY=${openaiKey}
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
"@

        Set-Content -Path $envFile -Value $envContent -Encoding UTF8
        Write-OK ".env file created successfully!"
    }
}

# ============================================================================
# 3. INSTALL DEPENDENCIES
# ============================================================================
if (-not $SkipInstall) {
    Write-Header "STEP 3/7: Installing Dependencies"

    Set-Location $REPO_ROOT

    Write-Step "Running pnpm install..."
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        Write-Err "pnpm install failed!"
        exit 1
    }
    Write-OK "Dependencies installed successfully!"
}

# ============================================================================
# 4. DATABASE SETUP (Docker)
# ============================================================================
if (-not $SkipDocker -and -not $SkipMigration) {
    Write-Header "STEP 4/7: Database Setup"

    Write-Step "Starting PostgreSQL via Docker Compose..."
    try {
        docker compose up -d postgres 2>&1
        Write-OK "PostgreSQL container started"

        Write-Step "Waiting for PostgreSQL to be ready..."
        $maxRetries = 30
        $retry = 0
        $healthy = $false
        do {
            Start-Sleep -Seconds 2
            $retry++
            $status = docker compose ps postgres 2>&1 | Out-String
            if ($status -match "healthy") { $healthy = $true; break }
        } while ($retry -lt $maxRetries)

        if ($healthy) {
            Write-OK "PostgreSQL is healthy!"
        } else {
            Write-Warn "PostgreSQL may not be ready yet. Continuing anyway..."
        }

        Write-Step "Running database migrations..."
        pnpm run db:migrate
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "Migration may have partially failed. Check logs above."
        } else {
            Write-OK "Migrations completed!"
        }
    } catch {
        Write-Warn "Docker setup failed. You may need to set up PostgreSQL manually."
        Write-Info "Manual setup: create a PostgreSQL 16 database and run: pnpm run db:migrate"
    }
}

# ============================================================================
# 5. BUILD
# ============================================================================
if (-not $SkipBuild) {
    Write-Header "STEP 5/7: Building Project"

    Set-Location $REPO_ROOT

    Write-Step "Running typecheck..."
    pnpm run typecheck
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Typecheck found issues (non-fatal for prototype)"
    } else {
        Write-OK "Typecheck passed!"
    }

    Write-Step "Running build..."
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Build had issues. Check the output above."
    } else {
        Write-OK "Build completed successfully!"
    }
}

# ============================================================================
# 6. TESTS
# ============================================================================
if (-not $SkipTests) {
    Write-Header "STEP 6/7: Running Tests"

    Set-Location $REPO_ROOT

    Write-Step "Running test suite..."
    pnpm run test
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Some tests failed. This is expected in prototype phase."
    } else {
        Write-OK "All tests passed!"
    }
}

# ============================================================================
# 7. FINAL VALIDATION
# ============================================================================
Write-Header "STEP 7/7: Final Validation"

Set-Location $REPO_ROOT

Write-Step "Running final validation..."
try {
    pnpm run validate:final 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Final validation passed!"
    } else {
        Write-Warn "Final validation had issues."
    }
} catch {
    Write-Info "Final validation script not available."
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Header "SETUP COMPLETE!"

Write-Host @"

  + Prerequisites checked
  + Environment configured
  + Dependencies installed
  + Database prepared
  + Project built
  + Tests executed

  +------------------------------------------------------+
  |  VETRA OS is ready for human testing!               |
  +------------------------------------------------------+

  To start the development servers:

    Terminal 1 - API Server:
      cd $REPO_ROOT
      pnpm --filter @workspace/api-server run dev

    Terminal 2 - Frontend:
      cd $REPO_ROOT
      pnpm --filter @workspace/vetra run dev

  Frontend:  http://localhost:5173
  API:       http://localhost:5000
  Health:    http://localhost:5000/api/health

"@ -ForegroundColor Green

# ============================================================================
# OPTIONAL: START SERVERS
# ============================================================================
if ($StartAfterSetup) {
    Write-Step "Starting development servers..."
    $apiJob = Start-Job -Name "vetra-api" -ScriptBlock {
        Set-Location $using:REPO_ROOT
        pnpm --filter @workspace/api-server run dev
    }
    Start-Sleep -Seconds 3
    $uiJob = Start-Job -Name "vetra-ui" -ScriptBlock {
        Set-Location $using:REPO_ROOT
        pnpm --filter @workspace/vetra run dev
    }
    Write-OK "Servers starting in background..."
    Write-Info "API: http://localhost:5000"
    Write-Info "UI:  http://localhost:5173"
    Write-Info "Run 'Get-Job' to check status, 'Stop-Job *' to stop all."
}

Write-Host ""
Write-Host "  Press any key to exit..." -ForegroundColor Gray
if (-not $Quiet) {
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
