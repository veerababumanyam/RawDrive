#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Pre-Deployment Validation Script for RawDrive
.DESCRIPTION
    Comprehensive validation before deploying to production.
    Checks database integrity, runs tests, validates configuration.
.PARAMETER Environment
    Target environment (staging, production)
.PARAMETER SkipTests
    Skip running test suite (not recommended)
.EXAMPLE
    .\scripts\pre-deployment-check.ps1 -Environment production
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet('staging', 'production')]
    [string]$Environment = 'staging',

    [Parameter(Mandatory=$false)]
    [switch]$SkipTests
)

$ErrorActionPreference = "Continue"

# Colors
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"
$Cyan = "Cyan"
$White = "White"

# Track results
$checks_passed = 0
$checks_failed = 0
$checks_warning = 0
$critical_failures = @()

function Write-CheckHeader {
    param([string]$Title)
    Write-Host "`n$("=" * 70)" -ForegroundColor $Cyan
    Write-Host " $Title" -ForegroundColor $Cyan
    Write-Host "$("=" * 70)" -ForegroundColor $Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor $Green
    $script:checks_passed++
}

function Write-Failure {
    param([string]$Message, [switch]$Critical)
    Write-Host "❌ $Message" -ForegroundColor $Red
    $script:checks_failed++
    if ($Critical) {
        $script:critical_failures += $Message
    }
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor $Yellow
    $script:checks_warning++
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor $Cyan
}

# Header
Clear-Host
Write-Host "`n╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $Cyan
Write-Host "║   RawDrive Pre-Deployment Validation                         ║" -ForegroundColor $Cyan
Write-Host "║   Environment: $($Environment.PadRight(47)) ║" -ForegroundColor $Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $Cyan

# Check 1: Docker Services Running
Write-CheckHeader "1. Docker Services Status"

$required_services = @(
    "rawdrive-backend",
    "rawdrive-postgres",
    "rawdrive-redis"
)

foreach ($service in $required_services) {
    $status = docker ps --filter "name=$service" --format "{{.Status}}"
    if ($status -match "Up") {
        Write-Success "$service is running"
    } else {
        Write-Failure "$service is not running" -Critical
    }
}

# Check 2: Database Connection
Write-CheckHeader "2. Database Connectivity"

try {
    $pg_result = docker exec rawdrive-postgres pg_isready -U rawdrive 2>&1
    if ($pg_result -match "accepting connections") {
        Write-Success "PostgreSQL is accepting connections"
    } else {
        Write-Failure "PostgreSQL not ready" -Critical
    }
} catch {
    Write-Failure "Failed to connect to PostgreSQL" -Critical
}

# Check 3: Database Migrations
Write-CheckHeader "3. Database Migrations"

try {
    $current_rev = docker exec rawdrive-backend alembic current 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Migration status: $current_rev"

        # Check if on latest
        $head_rev = docker exec rawdrive-backend alembic heads 2>&1
        if ($current_rev -match $head_rev) {
            Write-Success "Database is on latest migration"
        } else {
            Write-Failure "Database is not on latest migration" -Critical
            Write-Info "Current: $current_rev"
            Write-Info "Latest: $head_rev"
        }
    } else {
        Write-Failure "Failed to check migration status" -Critical
    }
} catch {
    Write-Failure "Migration check failed: $($_.Exception.Message)" -Critical
}

# Check 4: Database Integrity
Write-CheckHeader "4. Database Integrity"

try {
    $validation_output = docker exec rawdrive-backend python /app/scripts/validate-database.py 2>&1
    $validation_exit = $LASTEXITCODE

    if ($validation_exit -eq 0) {
        Write-Success "Database validation passed"
    } else {
        Write-Failure "Database validation found critical issues" -Critical
        Write-Host $validation_output -ForegroundColor $Red
    }
} catch {
    Write-Failure "Database validation failed: $($_.Exception.Message)" -Critical
}

# Check 5: Health Check Endpoints
Write-CheckHeader "5. API Health Checks"

$health_endpoints = @{
    "Basic Health" = "http://localhost:8000/api/v1/health"
    "Database Integrity" = "http://localhost:8000/api/v1/health/database-integrity"
    "Detailed Health" = "http://localhost:8000/api/v1/health/detailed"
}

foreach ($endpoint in $health_endpoints.GetEnumerator()) {
    try {
        $response = Invoke-RestMethod -Uri $endpoint.Value -TimeoutSec 5 -ErrorAction Stop
        if ($response.status -eq "ok") {
            Write-Success "$($endpoint.Key): OK"
        } else {
            Write-Warning "$($endpoint.Key): $($response.status)"
            if ($response.summary) {
                Write-Info "  Critical: $($response.summary.critical_issues)"
                Write-Info "  Warnings: $($response.summary.warnings)"
            }
        }
    } catch {
        Write-Failure "$($endpoint.Key) endpoint unreachable"
    }
}

# Check 6: Environment Configuration
Write-CheckHeader "6. Environment Configuration"

$required_env_vars = @(
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SECRET"
)

# Check in backend container
foreach ($var in $required_env_vars) {
    try {
        $value = docker exec rawdrive-backend printenv $var 2>&1
        if ($value -and $value -notmatch "error") {
            Write-Success "$var is set"
        } else {
            Write-Failure "$var is not set" -Critical
        }
    } catch {
        Write-Warning "Could not check $var"
    }
}

# Check 7: Required Plans Exist
Write-CheckHeader "7. Subscription Plans"

$required_plans = @('starter', 'professional', 'enterprise', 'studio')
foreach ($plan in $required_plans) {
    try {
        $exists = docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -tAc "SELECT COUNT(*) FROM plans WHERE code='$plan'" 2>&1
        if ($exists -eq "1") {
            Write-Success "Plan '$plan' exists"
        } else {
            Write-Failure "Plan '$plan' is missing" -Critical
        }
    } catch {
        Write-Warning "Could not check plan '$plan'"
    }
}

# Check 8: Test Suite
if (-not $SkipTests) {
    Write-CheckHeader "8. Test Suite"

    # Backend tests
    Write-Info "Running backend tests..."
    try {
        $test_output = docker exec rawdrive-backend pytest backend/tests/test_session_service.py -v 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Backend tests passed"
        } else {
            Write-Failure "Backend tests failed"
            Write-Host $test_output -ForegroundColor $Red
        }
    } catch {
        Write-Warning "Could not run backend tests: $($_.Exception.Message)"
    }

    # Frontend tests (if available)
    if (Test-Path "frontend/package.json") {
        Write-Info "Running frontend tests..."
        try {
            Push-Location frontend
            $npm_test = npm test 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Frontend tests passed"
            } else {
                Write-Warning "Frontend tests had issues"
            }
            Pop-Location
        } catch {
            Write-Warning "Could not run frontend tests"
            Pop-Location
        }
    }
} else {
    Write-CheckHeader "8. Test Suite"
    Write-Warning "Tests skipped (--SkipTests flag)"
}

# Check 9: Login Flow Test
Write-CheckHeader "9. Login Flow Validation"

try {
    $login_response = Invoke-RestMethod `
        -Uri "http://localhost:8000/api/v1/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"free@test.rawdrive.in","password":"Test@123"}' `
        -ErrorAction Stop

    if ($login_response.tokens.access_token) {
        Write-Success "Login endpoint working"

        # Test workspace access
        $token = $login_response.tokens.access_token
        $workspace_id = $login_response.user.workspace_id

        try {
            $workspace = Invoke-RestMethod `
                -Uri "http://localhost:8000/api/v1/workspaces/$workspace_id" `
                -Headers @{"Authorization" = "Bearer $token"} `
                -ErrorAction Stop

            Write-Success "Workspace access working"
        } catch {
            Write-Failure "Workspace access failed" -Critical
        }
    } else {
        Write-Failure "Login endpoint returned invalid response" -Critical
    }
} catch {
    Write-Failure "Login endpoint failed" -Critical
    Write-Info "Error: $($_.Exception.Message)"
}

# Check 10: Security Headers (Production only)
if ($Environment -eq "production") {
    Write-CheckHeader "10. Security Headers"

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/health" -ErrorAction Stop
        $headers = $response.Headers

        $required_headers = @{
            "X-Content-Type-Options" = "nosniff"
            "X-Frame-Options" = "DENY"
            "X-XSS-Protection" = "1; mode=block"
        }

        foreach ($header in $required_headers.GetEnumerator()) {
            if ($headers[$header.Key] -eq $header.Value) {
                Write-Success "$($header.Key) header set correctly"
            } else {
                Write-Warning "$($header.Key) header missing or incorrect"
            }
        }
    } catch {
        Write-Warning "Could not check security headers"
    }
}

# Final Summary
Write-Host "`n" -NoNewline
Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $Cyan
Write-Host "║   VALIDATION SUMMARY                                         ║" -ForegroundColor $Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $Cyan

Write-Host "`nResults:" -ForegroundColor $White
Write-Host "  ✅ Passed:   $checks_passed" -ForegroundColor $Green
Write-Host "  ❌ Failed:   $checks_failed" -ForegroundColor $Red
Write-Host "  ⚠️  Warnings: $checks_warning" -ForegroundColor $Yellow

if ($critical_failures.Count -gt 0) {
    Write-Host "`nCRITICAL FAILURES:" -ForegroundColor $Red
    foreach ($failure in $critical_failures) {
        Write-Host "  • $failure" -ForegroundColor $Red
    }
}

# Deployment Recommendation
Write-Host "`n" -NoNewline
if ($checks_failed -eq 0 -and $critical_failures.Count -eq 0) {
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $Green
    Write-Host "║   ✅ DEPLOYMENT APPROVED                                     ║" -ForegroundColor $Green
    Write-Host "║   All critical checks passed. Safe to deploy.                ║" -ForegroundColor $Green
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $Green

    if ($checks_warning -gt 0) {
        Write-Host "`n⚠️  Note: $checks_warning warnings detected. Review recommended." -ForegroundColor $Yellow
    }

    exit 0
} else {
    Write-Host "╔═══════════════════════════════════════════════════════════════╗" -ForegroundColor $Red
    Write-Host "║   ❌ DEPLOYMENT BLOCKED                                      ║" -ForegroundColor $Red
    Write-Host "║   Critical issues found. Do NOT deploy until resolved.       ║" -ForegroundColor $Red
    Write-Host "╚═══════════════════════════════════════════════════════════════╝" -ForegroundColor $Red

    Write-Host "`nRecommended Actions:" -ForegroundColor $Yellow
    Write-Host "  1. Review error messages above" -ForegroundColor $White
    Write-Host "  2. Run: docker exec rawdrive-backend python /app/scripts/validate-database.py --fix" -ForegroundColor $White
    Write-Host "  3. Check: docs/TROUBLESHOOTING_LOGIN_AND_WORKSPACE.md" -ForegroundColor $White
    Write-Host "  4. Re-run this script after fixes" -ForegroundColor $White

    exit 1
}
