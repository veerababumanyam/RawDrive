# Upload Service Testing Script
# Run this in PowerShell to test the upload microservice

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Upload Microservice Testing Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Navigate to project root
Set-Location "C:\Users\admin\Desktop\RawDrive"

# Step 1: Start Infrastructure Services
Write-Host "[1/6] Starting infrastructure services (PostgreSQL, Redis)..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis

Write-Host "Waiting 10 seconds for services to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 10

# Check if postgres and redis are running
$postgresStatus = docker ps --filter "name=postgres" --format "{{.Status}}"
$redisStatus = docker ps --filter "name=redis" --format "{{.Status}}"

Write-Host "PostgreSQL Status: $postgresStatus" -ForegroundColor $(if ($postgresStatus -match "Up") { "Green" } else { "Red" })
Write-Host "Redis Status: $redisStatus" -ForegroundColor $(if ($redisStatus -match "Up") { "Green" } else { "Red" })
Write-Host ""

# Step 2: Start Upload Service
Write-Host "[2/6] Starting upload-service (port 8005)..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d upload-service

Write-Host "Waiting 15 seconds for upload-service to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 15

# Check upload-service status
$uploadStatus = docker ps --filter "name=upload-service" --format "{{.Status}}"
Write-Host "Upload Service Status: $uploadStatus" -ForegroundColor $(if ($uploadStatus -match "Up") { "Green" } else { "Red" })
Write-Host ""

# Step 3: Check Logs
Write-Host "[3/6] Checking upload-service logs..." -ForegroundColor Yellow
Write-Host "Last 20 log lines:" -ForegroundColor Gray
docker compose -f infrastructure/docker/docker-compose.dev.yml logs --tail=20 upload-service
Write-Host ""

# Step 4: Test Health Endpoint
Write-Host "[4/6] Testing /health endpoint..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "http://localhost:8005/health" -Method Get
    Write-Host "✅ Health check PASSED" -ForegroundColor Green
    Write-Host "Response: $($healthResponse | ConvertTo-Json)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Health check FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 5: Test Readiness Endpoint
Write-Host "[5/6] Testing /ready endpoint..." -ForegroundColor Yellow
try {
    $readyResponse = Invoke-RestMethod -Uri "http://localhost:8005/ready" -Method Get
    Write-Host "✅ Readiness check PASSED" -ForegroundColor Green
    Write-Host "Response: $($readyResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Gray

    # Check individual services
    if ($readyResponse.checks.postgres -eq $true) {
        Write-Host "  ✅ PostgreSQL: Connected" -ForegroundColor Green
    } else {
        Write-Host "  ❌ PostgreSQL: Failed" -ForegroundColor Red
    }

    if ($readyResponse.checks.redis -eq $true) {
        Write-Host "  ✅ Redis: Connected" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Redis: Failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Readiness check FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Step 6: Test Metrics Endpoint
Write-Host "[6/6] Testing /metrics endpoint..." -ForegroundColor Yellow
try {
    $metricsResponse = Invoke-WebRequest -Uri "http://localhost:8005/metrics" -Method Get
    Write-Host "✅ Metrics endpoint PASSED" -ForegroundColor Green

    # Check for key metrics
    $metricsContent = $metricsResponse.Content
    if ($metricsContent -match "upload_concurrent_total") {
        Write-Host "  ✅ upload_concurrent_total metric found" -ForegroundColor Green
    }
    if ($metricsContent -match "upload_requests_total") {
        Write-Host "  ✅ upload_requests_total metric found" -ForegroundColor Green
    }
    if ($metricsContent -match "upload_service_info") {
        Write-Host "  ✅ upload_service_info metric found" -ForegroundColor Green
    }

    # Show first 10 lines of metrics
    Write-Host "`nFirst 10 lines of metrics output:" -ForegroundColor Gray
    ($metricsContent -split "`n" | Select-Object -First 10) | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} catch {
    Write-Host "❌ Metrics endpoint FAILED: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testing Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. If all tests passed, the service is ready!" -ForegroundColor White
Write-Host "2. Enable feature flag in frontend/.env:" -ForegroundColor White
Write-Host "   VITE_FEATURE_UPLOAD_MICROSERVICE=true" -ForegroundColor Gray
Write-Host "   VITE_UPLOAD_SERVICE_URL=http://localhost:8005" -ForegroundColor Gray
Write-Host "3. Start frontend: cd frontend && npm run dev" -ForegroundColor White
Write-Host "4. Test file upload through the UI" -ForegroundColor White
Write-Host ""
Write-Host "To view live logs: docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f upload-service" -ForegroundColor Gray
Write-Host "To stop services: docker compose -f infrastructure/docker/docker-compose.dev.yml down" -ForegroundColor Gray
