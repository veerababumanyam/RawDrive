# Integration Test Script for Billing Microservice
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Billing Microservice Integration Tests" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$testsPassed = 0
$testsFailed = 0

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [int]$ExpectedStatus = 200,
        [hashtable]$Headers = @{},
        [string]$Method = "GET"
    )

    Write-Host "Testing: $Name..." -ForegroundColor Yellow -NoNewline

    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -SkipHttpErrorCheck -UseBasicParsing -TimeoutSec 5

        if ($response.StatusCode -eq $ExpectedStatus) {
            Write-Host " [PASS]" -ForegroundColor Green
            $script:testsPassed++
            return $true
        } else {
            Write-Host " [FAIL]" -ForegroundColor Red
            Write-Host "  Expected: $ExpectedStatus, Got: $($response.StatusCode)" -ForegroundColor Red
            $script:testsFailed++
            return $false
        }
    } catch {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        return $false
    }
}

# Test 1: Health Check (Direct)
Write-Host ""
Write-Host "1. Health Check Tests" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
Test-Endpoint -Name "Health endpoint (direct)" -Url "http://localhost:8006/health"

# Test 2: Metrics Endpoint
Write-Host ""
Write-Host "2. Metrics Tests" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
Test-Endpoint -Name "Metrics endpoint" -Url "http://localhost:8006/metrics"

# Test 3: Traefik Routing
Write-Host ""
Write-Host "3. Traefik Routing Tests" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
Write-Host "NOTE: These tests require Traefik to be running" -ForegroundColor Yellow
Write-Host ""

# Check if Traefik is running
$traefikRunning = docker ps --filter "name=rawdrive-traefik" --format "{{.Names}}" 2>$null
if ($traefikRunning) {
    Write-Host "[OK] Traefik is running" -ForegroundColor Green

    # Test Traefik routing (will fail with 401 without auth token, but that's expected)
    Test-Endpoint -Name "Billing API via Traefik (expects 401)" -Url "http://localhost/api/v1/subscription" -ExpectedStatus 401
    Test-Endpoint -Name "Webhook endpoint via Traefik (expects 401)" -Url "http://localhost/webhooks/razorpay" -ExpectedStatus 401 -Method "POST"
} else {
    Write-Host "[SKIP] Traefik is not running" -ForegroundColor Yellow
    Write-Host "  Start with: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d traefik" -ForegroundColor Gray
}

# Test 4: Database Connection
Write-Host ""
Write-Host "4. Database Connection Test" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8006/health" -UseBasicParsing
    $dbStatus = $healthResponse.checks.database

    if ($dbStatus -eq "up") {
        Write-Host "Database connection: [PASS]" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "Database connection: [FAIL]" -ForegroundColor Red
        Write-Host "  Status: $dbStatus" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "Database connection: [FAIL]" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 5: Redis Connection
Write-Host ""
Write-Host "5. Redis Connection Test" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8006/health" -UseBasicParsing
    $redisStatus = $healthResponse.checks.redis

    if ($redisStatus -eq "up") {
        Write-Host "Redis connection: [PASS]" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "Redis connection: [FAIL]" -ForegroundColor Red
        Write-Host "  Status: $redisStatus" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "Redis connection: [FAIL]" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Test 6: Circuit Breaker State
Write-Host ""
Write-Host "6. Circuit Breaker Test" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8006/health" -UseBasicParsing
    $circuitState = $healthResponse.circuit_breaker.state

    if ($circuitState -eq "closed") {
        Write-Host "Circuit breaker state: [PASS] (closed - healthy)" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "Circuit breaker state: [WARN] ($circuitState)" -ForegroundColor Yellow
        Write-Host "  Note: Redis may be experiencing issues" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Circuit breaker check: [SKIP]" -ForegroundColor Yellow
}

# Test 7: Container Logs Check
Write-Host ""
Write-Host "7. Container Logs Check" -ForegroundColor Cyan
Write-Host "-------------------------------------" -ForegroundColor Cyan
try {
    $logs = docker logs rawdrive-billing-service --tail 20 2>&1

    if ($logs -match "error|exception|failed" -and $logs -notmatch "test") {
        Write-Host "Container logs: [WARN] Found error messages" -ForegroundColor Yellow
        Write-Host "  Run 'docker logs rawdrive-billing-service' to investigate" -ForegroundColor Gray
    } else {
        Write-Host "Container logs: [PASS] No critical errors" -ForegroundColor Green
        $testsPassed++
    }
} catch {
    Write-Host "Container logs: [FAIL]" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    $testsFailed++
}

# Summary
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "[SUCCESS] All tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Billing service is ready for development" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Test with authentication token" -ForegroundColor White
    Write-Host "2. Test webhook processing (see README.md)" -ForegroundColor White
    Write-Host "3. Start frontend: cd frontend && npm run dev" -ForegroundColor White
    exit 0
} else {
    Write-Host "[FAILURE] Some tests failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check service logs: docker logs rawdrive-billing-service" -ForegroundColor White
    Write-Host "2. Verify .env configuration" -ForegroundColor White
    Write-Host "3. Ensure database migrations are up to date" -ForegroundColor White
    Write-Host "4. Check Docker container status: docker ps" -ForegroundColor White
    exit 1
}
