# Start gallery service for local development
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Starting Gallery Service for local development..." -ForegroundColor Green

# Check if .env exists
if (-not (Test-Path "$ProjectRoot\.env")) {
    Write-Host "Error: .env file not found. Copy .env.example and configure." -ForegroundColor Red
    exit 1
}

# Build gallery service
Write-Host "Building gallery service..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\infrastructure\docker\docker-compose.dev.yml" build gallery-service

# Start dependencies
Write-Host "Starting dependencies (PostgreSQL, Redis)..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\infrastructure\docker\docker-compose.dev.yml" up -d postgres redis

# Wait for dependencies
Write-Host "Waiting for dependencies..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Start gallery service
Write-Host "Starting gallery service..." -ForegroundColor Yellow
docker compose -f "$ProjectRoot\infrastructure\docker\docker-compose.dev.yml" up -d gallery-service

# Show logs
Write-Host ""
Write-Host "Gallery service started! Logs:" -ForegroundColor Green
docker compose -f "$ProjectRoot\infrastructure\docker\docker-compose.dev.yml" logs -f gallery-service
