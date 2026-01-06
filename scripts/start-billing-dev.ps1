# Quick Start Script for Billing Microservice Development
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Starting Billing Microservice Stack" -ForegroundColor Cyan
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

# Verify required environment variables
Write-Host "Checking billing-specific environment variables..." -ForegroundColor Yellow
$envContent = Get-Content "$ProjectRoot\.env" -Raw
$requiredVars = @(
    "JWT_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    if ($envContent -notmatch "$var=.+") {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "[WARNING] Missing or empty environment variables:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "  - $var" -ForegroundColor Red
    }
    Write-Host "Please update .env file with required values" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "[OK] Required environment variables configured" -ForegroundColor Green
}
Write-Host ""

# Start services
Write-Host "Starting services with Docker Compose..." -ForegroundColor Yellow
Write-Host "Command: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d" -ForegroundColor Gray
Write-Host ""

Set-Location $ProjectRoot
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d billing-service postgres redis

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
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "NAMES|billing|postgres|redis"

    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Quick Access Links" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Billing (direct):   http://localhost:8006/health" -ForegroundColor White
    Write-Host "Billing (Traefik):  http://localhost/api/v1/subscription" -ForegroundColor White
    Write-Host "Metrics:            http://localhost:8006/metrics" -ForegroundColor White
    Write-Host "OpenAPI Docs:       http://localhost:8006/docs" -ForegroundColor White
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Webhook Testing" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Razorpay:           http://localhost/webhooks/razorpay" -ForegroundColor White
    Write-Host "Stripe:             http://localhost/webhooks/stripe" -ForegroundColor White
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "Next Steps" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "1. Run tests: .\scripts\test-billing-setup.ps1" -ForegroundColor Yellow
    Write-Host "2. View logs: docker logs rawdrive-billing-service -f" -ForegroundColor Yellow
    Write-Host "3. Test webhook: See README.md for webhook testing examples" -ForegroundColor Yellow
    Write-Host "4. Start Traefik: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d traefik" -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "[ERROR] Failed to start services" -ForegroundColor Red
    Write-Host "Check the error messages above" -ForegroundColor Yellow
    exit 1
}
