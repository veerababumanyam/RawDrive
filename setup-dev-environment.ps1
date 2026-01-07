# RawDrive Development Environment Setup (Windows)
# Complete setup script for new developers or clean installations

$ErrorActionPreference = "Continue"  # Continue on errors to show all issues

Write-Host "=========================================================================" -ForegroundColor Green
Write-Host "RawDrive Development Environment Setup" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "This script will set up your complete development environment:" -ForegroundColor Cyan
Write-Host "  1. Start Docker services" -ForegroundColor White
Write-Host "  2. Run database migrations" -ForegroundColor White
Write-Host "  3. Seed test users" -ForegroundColor White
Write-Host "  4. Build shared packages" -ForegroundColor White
Write-Host "  5. Setup frontend dependencies" -ForegroundColor White
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/7] Checking prerequisites..." -ForegroundColor Cyan

# Check Docker Desktop
try {
    docker --version | Out-Null
    Write-Host "✓ Docker installed" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker not found. Please install Docker Desktop for Windows." -ForegroundColor Red
    Write-Host "  Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check Docker is running
try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js installed ($nodeVersion)" -ForegroundColor Green
    $skipFrontend = $false
} catch {
    Write-Host "⚠ Node.js not found. Frontend setup will be skipped." -ForegroundColor Yellow
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Yellow
    $skipFrontend = $true
}

# Check pnpm
if (-not $skipFrontend) {
    try {
        pnpm --version | Out-Null
        Write-Host "✓ pnpm installed" -ForegroundColor Green
    } catch {
        Write-Host "⚠ pnpm not found, installing..." -ForegroundColor Yellow
        npm install -g pnpm
    }
}

# Step 2: Start Docker services
Write-Host "`n[2/7] Starting Docker services..." -ForegroundColor Cyan
docker compose -f infrastructure/docker/docker-compose.yml up -d

Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Wait for backend to be healthy
$maxAttempts = 30
$attempt = 0
$backendReady = $false

while ($attempt -lt $maxAttempts -and -not $backendReady) {
    try {
        $status = docker ps --filter "name=rawdrive-backend" --format "{{.Status}}"
        if ($status -match "healthy") {
            $backendReady = $true
            Write-Host "✓ Backend service is healthy" -ForegroundColor Green
        } else {
            $attempt++
            Write-Host "Waiting for backend... (attempt $attempt/$maxAttempts)" -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    } catch {
        $attempt++
        Start-Sleep -Seconds 3
    }
}

if (-not $backendReady) {
    Write-Host "✗ Backend service failed to start within timeout" -ForegroundColor Red
    Write-Host "Check logs with: docker compose -f infrastructure/docker/docker-compose.yml logs backend" -ForegroundColor Yellow
    exit 1
}

# Step 3: Install backend dependencies
Write-Host "`n[3/7] Installing backend dependencies..." -ForegroundColor Cyan
try {
    docker exec rawdrive-backend pip install --quiet psycopg2-binary
    Write-Host "✓ Backend dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "⚠ Some dependencies may already be installed" -ForegroundColor Yellow
}

# Step 4: Run database migrations
Write-Host "`n[4/7] Running database migrations..." -ForegroundColor Cyan
try {
    docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"
    Write-Host "✓ Database migrations completed" -ForegroundColor Green
} catch {
    Write-Host "✗ Migration failed" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Seed test users
Write-Host "`n[5/7] Seeding test users..." -ForegroundColor Cyan
try {
    docker exec -e DATABASE_URL="postgresql://rawdrive:rawdrive@postgres:5432/rawdrive" `
        rawdrive-backend python seed_all_test_users.py | Select-String -Pattern "✓|Created|Summary"
    Write-Host "✓ Test users seeded" -ForegroundColor Green
} catch {
    Write-Host "⚠ Test user seeding may have had issues" -ForegroundColor Yellow
}

# Step 6: Build shared packages
if (-not $skipFrontend) {
    Write-Host "`n[6/7] Building shared packages..." -ForegroundColor Cyan

    $packages = @("shared-types", "shared-constants", "shared-validation", "shared-utils")

    foreach ($pkg in $packages) {
        $pkgPath = "packages\$pkg"
        if (Test-Path $pkgPath) {
            Write-Host "Building @rawdrive/$pkg..." -ForegroundColor Cyan
            Push-Location $pkgPath

            # Clean and build
            if (Test-Path "dist") {
                Remove-Item -Recurse -Force dist
            }

            pnpm build

            if (Test-Path "dist") {
                Write-Host "✓ $pkg built successfully" -ForegroundColor Green
            } else {
                Write-Host "⚠ $pkg build may have failed" -ForegroundColor Yellow
            }

            Pop-Location
        }
    }

    # Install frontend dependencies
    Write-Host "`nInstalling frontend dependencies..." -ForegroundColor Cyan
    Push-Location frontend
    pnpm install
    Pop-Location

    Write-Host "✓ Shared packages built" -ForegroundColor Green
} else {
    Write-Host "`n[6/7] Skipping frontend setup (Node.js not available)" -ForegroundColor Yellow
}

# Step 7: Health checks
Write-Host "`n[7/7] Running health checks..." -ForegroundColor Cyan

$services = @{
    "rawdrive-backend" = 8000
    "rawdrive-postgres" = 5432
    "rawdrive-redis" = 6379
}

foreach ($service in $services.Keys) {
    $status = docker ps --filter "name=$service" --format "{{.Names}}"
    if ($status -match $service) {
        Write-Host "✓ $service is running" -ForegroundColor Green
    } else {
        Write-Host "✗ $service is not running" -ForegroundColor Red
    }
}

# Final summary
Write-Host "`n=========================================================================" -ForegroundColor Green
Write-Host "✅ Development Environment Setup Complete!" -ForegroundColor Green
Write-Host "=========================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Services are running:" -ForegroundColor Cyan
Write-Host "  Backend API:     http://localhost:8000" -ForegroundColor White
Write-Host "  Frontend:        http://localhost:5173 (run: cd frontend; pnpm dev)" -ForegroundColor White
Write-Host "  Traefik:         http://localhost:8080" -ForegroundColor White
Write-Host "  Grafana:         http://localhost:3000 (admin/admin)" -ForegroundColor White
Write-Host ""
Write-Host "Test Users (password: Test@123):" -ForegroundColor Cyan
Write-Host "  free@test.rawdrive.in" -ForegroundColor White
Write-Host "  business@test.rawdrive.in" -ForegroundColor White
Write-Host "  enterprise@test.rawdrive.in" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Start frontend: cd frontend; pnpm dev" -ForegroundColor White
Write-Host "  2. Open browser: http://localhost:5173" -ForegroundColor White
Write-Host "  3. Login with any test user" -ForegroundColor White
Write-Host ""
Write-Host "Documentation:" -ForegroundColor Cyan
Write-Host "  docs\DOCKER_QUICK_START.md" -ForegroundColor White
Write-Host "  CLAUDE.md" -ForegroundColor White
Write-Host "  README.md" -ForegroundColor White
Write-Host ""
