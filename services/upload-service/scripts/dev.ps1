# Quick Start Script for Upload Service
# Run this to start all required services

Write-Host "Starting RawDrive Upload Service..." -ForegroundColor Cyan
Write-Host ""

Set-Location "C:\Users\admin\Desktop\RawDrive"

# Start infrastructure
Write-Host "Starting PostgreSQL and Redis..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis

Start-Sleep -Seconds 10

# Start upload service
Write-Host "Starting upload-service..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d upload-service

Start-Sleep -Seconds 5

# Show status
Write-Host ""
Write-Host "Services Started:" -ForegroundColor Green
docker compose -f infrastructure/docker/docker-compose.dev.yml ps

Write-Host ""
Write-Host "Testing endpoints in 10 seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Quick health check
Write-Host ""
Write-Host "Health Check:" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8005/health" -Method Get
    Write-Host "✅ Service is UP: $($health.service)" -ForegroundColor Green
} catch {
    Write-Host "❌ Service is DOWN" -ForegroundColor Red
    Write-Host "Check logs: docker compose -f infrastructure/docker/docker-compose.dev.yml logs upload-service" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "View logs: docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f upload-service" -ForegroundColor Gray
Write-Host "Run tests: .\scripts\test-upload-service.ps1" -ForegroundColor Gray
