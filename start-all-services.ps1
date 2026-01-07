# ============================================
# RawDrive - Start All Microservices
# ============================================
# This script starts all microservices with auto-restart enabled
# Services will automatically restart when Docker Desktop starts

Write-Host "🚀 Starting RawDrive Microservices..." -ForegroundColor Cyan
Write-Host ""

# Change to the correct directory
Set-Location $PSScriptRoot

# Start all services with docker compose
Write-Host "📦 Starting Docker Compose stack..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

# Check if the command succeeded
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ All services started successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Service Status:" -ForegroundColor Cyan
    docker compose -f infrastructure/docker/docker-compose.yml ps
    Write-Host ""
    Write-Host "🔄 Auto-restart is ENABLED for all services" -ForegroundColor Green
    Write-Host "   Services will automatically start when Docker Desktop starts" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📝 Quick Commands:" -ForegroundColor Cyan
    Write-Host "   View logs:    docker compose -f infrastructure/docker/docker-compose.yml logs -f [service-name]" -ForegroundColor Gray
    Write-Host "   Stop all:     docker compose -f infrastructure/docker/docker-compose.yml down" -ForegroundColor Gray
    Write-Host "   Restart all:  docker compose -f infrastructure/docker/docker-compose.yml restart" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🌐 Service URLs:" -ForegroundColor Cyan
    Write-Host "   Backend:      http://localhost:8000" -ForegroundColor Gray
    Write-Host "   Gallery:      http://localhost:8004" -ForegroundColor Gray
    Write-Host "   Billing:      http://localhost:8005" -ForegroundColor Gray
    Write-Host "   Onboarding:   http://localhost:8006" -ForegroundColor Gray
    Write-Host "   Upload:       http://localhost:8008" -ForegroundColor Gray
    Write-Host "   Invitations:  http://localhost:8007" -ForegroundColor Gray
    Write-Host "   Traefik:      http://localhost:8080 (Dashboard)" -ForegroundColor Gray
    Write-Host "   Prometheus:   http://localhost:9090" -ForegroundColor Gray
    Write-Host "   Grafana:      http://localhost:3000" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Failed to start services!" -ForegroundColor Red
    Write-Host "   Check the error messages above" -ForegroundColor Gray
    exit 1
}
