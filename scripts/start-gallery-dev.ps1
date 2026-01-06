# Quick Start Script for Gallery Microservice Development
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Starting Gallery Microservice Stack" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "Checking Docker Desktop..." -ForegroundColor Yellow
$dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
if ($dockerVersion) {
    Write-Host "[OK] Docker is running (version: $dockerVersion)" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Docker is not responding" -ForegroundColor Red
    Write-Host "Please start Docker Desktop first" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Check .env file
Write-Host "Checking environment configuration..." -ForegroundColor Yellow
if (-not (Test-Path "$ProjectRoot\.env")) {
    Write-Host "[WARNING] .env file not found!" -ForegroundColor Yellow
    if (Test-Path "$ProjectRoot\.env.example") {
        Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
        Copy-Item "$ProjectRoot\.env.example" "$ProjectRoot\.env"
        Write-Host "[OK] .env file created" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] .env.example not found!" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] .env file exists" -ForegroundColor Green
}
Write-Host ""

# Start services
Write-Host "Starting services with Docker Compose..." -ForegroundColor Yellow
Write-Host "Command: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d" -ForegroundColor Gray
Write-Host ""

Set-Location $ProjectRoot
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[OK] Services started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Waiting for services to be healthy (15 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 15

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Services Status" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "NAMES|gallery|postgres|redis|traefik"

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Quick Access Links" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Gallery (direct):   http://localhost:8004/health" -ForegroundColor White
    Write-Host "Gallery (Traefik):  http://localhost/api/v1/galleries" -ForegroundColor White
    Write-Host "Traefik Dashboard:  http://traefik.localhost:8080" -ForegroundColor White
    Write-Host "Metrics:            http://localhost:8004/metrics" -ForegroundColor White
    Write-Host "Backend API:        http://localhost:8000" -ForegroundColor White
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Next Steps" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "1. Run tests: .\scripts\test-gallery-setup.ps1" -ForegroundColor Yellow
    Write-Host "2. View logs: docker logs rawdrive-gallery-service -f" -ForegroundColor Yellow
    Write-Host "3. Start frontend: cd frontend && npm run dev" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERROR] Failed to start services" -ForegroundColor Red
    Write-Host "Check the error messages above" -ForegroundColor Yellow
    exit 1
}
