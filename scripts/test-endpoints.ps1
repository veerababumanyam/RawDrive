# Quick Endpoint Testing Script
# Run this after services are started

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Upload Service Endpoint Tests" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:8005"
$allPassed = $true

# Test 1: Health
Write-Host "[1/4] Testing /health..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 5
    if ($response.status -eq "ok") {
        Write-Host "✅ PASSED - Status: $($response.status), Service: $($response.service)" -ForegroundColor Green
    }
    else {
        Write-Host "❌ FAILED - Unexpected response" -ForegroundColor Red
        $allPassed = $false
    }
}
catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 2: Ready
Write-Host "[2/4] Testing /ready..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/ready" -Method Get -TimeoutSec 5
    if ($response.status -eq "ready") {
        Write-Host "✅ PASSED - Status: ready" -ForegroundColor Green
        Write-Host "   PostgreSQL: $($response.checks.postgres)" -ForegroundColor Gray
        Write-Host "   Redis: $($response.checks.redis)" -ForegroundColor Gray
        if ($response.checks.r2) {
            Write-Host "   R2: $($response.checks.r2)" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "❌ FAILED - Service not ready" -ForegroundColor Red
        $allPassed = $false
    }
}
catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 3: Metrics
Write-Host "[3/4] Testing /metrics..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/metrics" -Method Get -TimeoutSec 5
    $content = $response.Content

    # Check for key metrics
    $hasUploadConcurrent = $content -match "upload_concurrent_total"
    $hasUploadRequests = $content -match "upload_requests_total"
    $hasServiceInfo = $content -match "upload_service_info"

    if ($hasUploadConcurrent -and $hasUploadRequests -and $hasServiceInfo) {
        Write-Host "✅ PASSED - All key metrics present" -ForegroundColor Green
        Write-Host "   upload_concurrent_total: ✓" -ForegroundColor Gray
        Write-Host "   upload_requests_total: ✓" -ForegroundColor Gray
        Write-Host "   upload_service_info: ✓" -ForegroundColor Gray
    }
    else {
        Write-Host "❌ FAILED - Missing metrics" -ForegroundColor Red
        if (-not $hasUploadConcurrent) { Write-Host "   Missing: upload_concurrent_total" -ForegroundColor Red }
        if (-not $hasUploadRequests) { Write-Host "   Missing: upload_requests_total" -ForegroundColor Red }
        if (-not $hasServiceInfo) { Write-Host "   Missing: upload_service_info" -ForegroundColor Red }
        $allPassed = $false
    }
}
catch {
    Write-Host "❌ FAILED - $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 4: Auth (should fail without token)
Write-Host "[4/4] Testing authentication..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/v1/uploads" -Method Post -TimeoutSec 5 -ErrorAction Stop
    Write-Host "❌ FAILED - Auth should reject unauthenticated requests" -ForegroundColor Red
    $allPassed = $false
}
catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ PASSED - Correctly rejected unauthenticated request (401)" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  WARNING - Unexpected status code: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "All Tests PASSED! ✅" -ForegroundColor Green
}
else {
    Write-Host "Some Tests FAILED ❌" -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Show service info
Write-Host "Service Information:" -ForegroundColor Yellow
Write-Host "  URL: $baseUrl" -ForegroundColor White
Write-Host "  Health: $baseUrl/health" -ForegroundColor Gray
Write-Host "  Ready: $baseUrl/ready" -ForegroundColor Gray
Write-Host "  Metrics: $baseUrl/metrics" -ForegroundColor Gray
Write-Host "  Docs: $baseUrl/docs" -ForegroundColor Gray
Write-Host ""

# Next steps
if ($allPassed) {
    Write-Host "Ready for frontend testing!" -ForegroundColor Green
    Write-Host "1. Add to frontend/.env:" -ForegroundColor White
    Write-Host "   VITE_FEATURE_UPLOAD_MICROSERVICE=true" -ForegroundColor Gray
    Write-Host "   VITE_UPLOAD_SERVICE_URL=http://localhost:8005" -ForegroundColor Gray
    Write-Host "2. Start frontend: cd frontend && npm run dev" -ForegroundColor White
    Write-Host "3. Upload a file and check browser DevTools Network tab" -ForegroundColor White
}
