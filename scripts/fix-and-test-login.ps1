# Fix Backend and Test Login Flow
# This script restarts the backend, seeds test users, and runs Playwright tests

Write-Host "=== RawDrive Login Fix & Test ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Restart backend to apply JWT fix
Write-Host "[1/5] Restarting backend container..." -ForegroundColor Yellow
docker compose -f infrastructure/docker/docker-compose.yml restart backend
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to restart backend" -ForegroundColor Red
    exit 1
}

# Wait for backend to start
Write-Host "Waiting 8 seconds for backend to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 8

# Step 2: Verify backend health
Write-Host "[2/5] Checking backend health..." -ForegroundColor Yellow
$healthResponse = curl -s http://localhost:8000/health 2>&1
if ($healthResponse -match "healthy") {
    Write-Host "✓ Backend is healthy" -ForegroundColor Green
} else {
    Write-Host "ERROR: Backend health check failed" -ForegroundColor Red
    Write-Host "Response: $healthResponse" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Checking backend logs..." -ForegroundColor Yellow
    docker logs rawdrive-backend --tail 30
    exit 1
}

# Step 3: Check JWT keys are mounted
Write-Host "[3/5] Verifying JWT keys in container..." -ForegroundColor Yellow
$jwtKeys = docker exec rawdrive-backend ls -la /run/secrets/ 2>&1
if ($jwtKeys -match "jwt_private_key" -and $jwtKeys -match "jwt_public_key") {
    Write-Host "✓ JWT keys are mounted correctly" -ForegroundColor Green
} else {
    Write-Host "WARNING: JWT keys might not be mounted correctly" -ForegroundColor Yellow
    Write-Host $jwtKeys
}

# Step 4: Seed test users
Write-Host "[4/5] Seeding test users..." -ForegroundColor Yellow
$seedOutput = docker exec rawdrive-backend python /app/seed_all_test_users.py 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Test users seeded successfully" -ForegroundColor Green
} else {
    Write-Host "WARNING: Test user seeding may have issues (might already exist)" -ForegroundColor Yellow
    Write-Host $seedOutput -ForegroundColor Gray
}

Write-Host ""
Write-Host "[5/5] Backend is ready! Running Playwright tests..." -ForegroundColor Yellow
Write-Host ""

# Step 5: Run Playwright login tests
npx playwright test tests/login.spec.ts --grep "successfully log in" --reporter=line

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Login is working!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now login at: http://localhost:5173/signin" -ForegroundColor Cyan
    Write-Host "Email: business@test.rawdrive.in" -ForegroundColor Cyan
    Write-Host "Password: Test@123" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Test failed. Checking backend logs..." -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    docker logs rawdrive-backend --tail 50
}
