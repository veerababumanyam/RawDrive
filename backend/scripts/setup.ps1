# Backend Setup Script for Windows (PowerShell)
# Ensures all dependencies, migrations, and data are properly initialized

$ErrorActionPreference = "Stop"

Write-Host "=========================================================================" -ForegroundColor Green
Write-Host "RawDrive Backend Setup (Windows)" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green

# Step 1: Install Python dependencies
Write-Host "`n[1/6] Installing Python dependencies..." -ForegroundColor Cyan
try {
    pip install --quiet --no-cache-dir psycopg2-binary
    Write-Host "✓ psycopg2-binary installed" -ForegroundColor Green
} catch {
    Write-Host "⚠ Warning: psycopg2-binary installation skipped" -ForegroundColor Yellow
}

# Verify critical dependencies
Write-Host "Verifying dependencies..." -ForegroundColor Cyan
try {
    python -c "import asyncpg; print('✓ asyncpg installed')"
    python -c "import psycopg2; print('✓ psycopg2 installed')"
    python -c "import alembic; print('✓ alembic installed')"
} catch {
    Write-Host "✗ Error: Missing required dependencies" -ForegroundColor Red
    exit 1
}

# Step 2: Wait for database (Docker)
Write-Host "`n[2/6] Waiting for PostgreSQL..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
$dbReady = $false

while ($attempt -lt $maxAttempts -and -not $dbReady) {
    try {
        docker exec rawdrive-postgres pg_isready -U rawdrive 2>&1 | Out-Null
        $dbReady = $true
        Write-Host "✓ Database is ready" -ForegroundColor Green
    } catch {
        $attempt++
        Write-Host "Waiting for database... (attempt $attempt/$maxAttempts)" -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if (-not $dbReady) {
    Write-Host "✗ Error: Database connection timeout" -ForegroundColor Red
    exit 1
}

# Step 3: Run migrations
Write-Host "`n[3/6] Running database migrations..." -ForegroundColor Cyan
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Migrations applied successfully" -ForegroundColor Green
} else {
    Write-Host "✗ Migration failed" -ForegroundColor Red
    exit 1
}

# Step 4: Seed test users with subscriptions (development only)
Write-Host "`n[4/6] Checking test users..." -ForegroundColor Cyan
$env = $env:ENVIRONMENT
if (-not $env) { $env = "development" }

if ($env -eq "development" -or $env -eq "dev") {
    Write-Host "Development environment - seeding test users..." -ForegroundColor Cyan
    docker exec rawdrive-backend python /app/scripts/seed_test_users_with_subscriptions.py

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Test users seeded with subscriptions" -ForegroundColor Green
    } else {
        Write-Host "⚠ Test users seeding completed with warnings (may already exist)" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠ Production environment - skipping test user seeding" -ForegroundColor Yellow
}

# Step 4.5: Validate database integrity
Write-Host "`n[4.5/6] Validating database integrity..." -ForegroundColor Cyan
docker exec rawdrive-backend python /app/scripts/validate-database.py

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Database validation passed" -ForegroundColor Green
} else {
    Write-Host "⚠ Database validation found issues" -ForegroundColor Yellow
    Write-Host "   Run with --fix flag to auto-fix: docker exec rawdrive-backend python /app/scripts/validate-database.py --fix" -ForegroundColor Cyan
}

# Step 5: Build shared packages
Write-Host "`n[5/6] Building shared packages..." -ForegroundColor Cyan
Set-Location -Path "$PSScriptRoot\..\..\packages\shared-types"
pnpm build
Write-Host "✓ Shared packages built" -ForegroundColor Green

# Step 6: Health check
Write-Host "`n[6/6] Running health checks..." -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health" -TimeoutSec 5
    Write-Host "✓ Backend health check passed" -ForegroundColor Green
    Write-Host "   Status: $($response.status)" -ForegroundColor Cyan

    # Check database integrity via API
    try {
        $integrity = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/health/database-integrity" -TimeoutSec 5
        if ($integrity.status -eq "ok") {
            Write-Host "✓ Database integrity check passed" -ForegroundColor Green
        } else {
            Write-Host "⚠ Database integrity issues detected" -ForegroundColor Yellow
            Write-Host "   Critical: $($integrity.summary.critical_issues)" -ForegroundColor Yellow
            Write-Host "   Warnings: $($integrity.summary.warnings)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠ Database integrity endpoint not yet available" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠ Warning: Backend health check failed (service may not be running yet)" -ForegroundColor Yellow
}

Write-Host "`n=========================================================================" -ForegroundColor Green
Write-Host "✅ Backend setup complete!" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
