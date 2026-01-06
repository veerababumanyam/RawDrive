# Gallery Microservice Integration Test Script
# Run this after starting Docker Desktop

$ErrorActionPreference = "Continue"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Gallery Microservice Integration Test" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Check Docker is running
Write-Host "[1/7] Checking Docker Desktop..." -ForegroundColor Yellow
try {
    $dockerVersion = docker version --format '{{.Server.Version}}' 2>$null
    if ($dockerVersion) {
        Write-Host "   ✓ Docker is running (version: $dockerVersion)" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Docker is not responding" -ForegroundColor Red
        Write-Host "   Please start Docker Desktop and try again" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "   ✗ Docker command not found" -ForegroundColor Red
    Write-Host "   Please ensure Docker Desktop is installed and running" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Test 2: Check if containers are running
Write-Host "[2/7] Checking required containers..." -ForegroundColor Yellow
$containers = docker ps --format '{{.Names}}' 2>$null
$requiredContainers = @("rawdrive-postgres", "rawdrive-redis", "rawdrive-gallery-service")
$missingContainers = @()

foreach ($container in $requiredContainers) {
    if ($containers -contains $container) {
        Write-Host "   ✓ $container is running" -ForegroundColor Green
    } else {
        Write-Host "   ✗ $container is NOT running" -ForegroundColor Red
        $missingContainers += $container
    }
}

if ($missingContainers.Count -gt 0) {
    Write-Host ""
    Write-Host "Missing containers detected. Starting them now..." -ForegroundColor Yellow
    Write-Host "Running: docker compose -f infrastructure/docker/docker-compose.dev.yml up -d" -ForegroundColor Cyan
    docker compose -f infrastructure/docker/docker-compose.dev.yml up -d
    Write-Host "Waiting 10 seconds for services to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
}
Write-Host ""

# Test 3: Test gallery service health (direct)
Write-Host "[3/7] Testing gallery service health endpoint (direct)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8004/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ Health check passed (Status: $($response.StatusCode))" -ForegroundColor Green
        Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ Health check failed (Status: $($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Cannot connect to gallery service" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Checking container logs:" -ForegroundColor Yellow
    docker logs rawdrive-gallery-service --tail 20
}
Write-Host ""

# Test 4: Test Traefik routing
Write-Host "[4/7] Testing Traefik routing..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/v1/galleries/../health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ Traefik routing works (Status: $($response.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Traefik routing failed (Status: $($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Traefik routing not working" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure Traefik container is running: docker ps | findstr traefik" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Test metrics endpoint
Write-Host "[5/7] Testing Prometheus metrics endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8004/metrics" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ Metrics available (Status: $($response.StatusCode))" -ForegroundColor Green
        $metrics = $response.Content -split "`n" | Select-String -Pattern "gallery_|http_" | Select-Object -First 5
        Write-Host "   Sample metrics:" -ForegroundColor Gray
        $metrics | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    } else {
        Write-Host "   ✗ Metrics failed (Status: $($response.StatusCode))" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Cannot fetch metrics" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Check Traefik dashboard
Write-Host "[6/7] Checking Traefik dashboard..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://traefik.localhost:8080/api/http/routers" -UseBasicParsing -TimeoutSec 5
    $routersJson = $response.Content | ConvertFrom-Json
    $galleryRouters = $routersJson | Where-Object { $_.name -like "*gallery*" }

    if ($galleryRouters.Count -gt 0) {
        Write-Host "   ✓ Gallery routers found in Traefik:" -ForegroundColor Green
        $galleryRouters | ForEach-Object {
            Write-Host "     - $($_.name) (priority: $($_.priority), status: $($_.status))" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ✗ No gallery routers found in Traefik" -ForegroundColor Red
        Write-Host "   Try restarting Traefik: docker restart rawdrive-traefik" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ✗ Cannot access Traefik dashboard" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 7: Check container logs
Write-Host "[7/7] Recent gallery service logs..." -ForegroundColor Yellow
docker logs rawdrive-gallery-service --tail 10 2>&1
Write-Host ""

# Summary
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open Traefik dashboard: http://traefik.localhost:8080" -ForegroundColor White
Write-Host "  2. View full metrics: http://localhost:8004/metrics" -ForegroundColor White
Write-Host "  3. Test gallery API from frontend or Postman" -ForegroundColor White
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  docker logs rawdrive-gallery-service -f     # Follow logs" -ForegroundColor White
Write-Host "  docker ps | findstr gallery                  # Check status" -ForegroundColor White
Write-Host "  docker restart rawdrive-gallery-service     # Restart service" -ForegroundColor White
Write-Host ""
