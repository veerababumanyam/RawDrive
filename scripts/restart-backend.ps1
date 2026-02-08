# Restart Backend Service Script for Windows Docker Desktop
# This restarts the backend container and checks connectivity

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   RawDrive Backend Restart & Diagnostic Script" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Restart the backend container
Write-Host "[Step 1] Restarting backend container..." -ForegroundColor Yellow
docker restart rawdrive-backend

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Backend container restarted" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Could not restart backend. Is it running?" -ForegroundColor Red
    Write-Host "Try: docker compose up -d backend" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 2: Wait for backend to be healthy
Write-Host "[Step 2] Waiting for backend to be healthy..." -ForegroundColor Yellow
$max_attempts = 20
$attempt = 0

while ($attempt -lt $max_attempts) {
    $attempt++
    Write-Host "Checking... ($attempt/$max_attempts)" -NoNewline

    try {
        $response = Invoke-WebRequest -Uri "http://localhost/health/live" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-Host " [OK]" -ForegroundColor Green
            $healthy = $true
            break
        }
    } catch {
        # Try direct connection to backend
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8000/health/live" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Host " [OK - Direct]" -ForegroundColor Green
                Write-Host "Note: Backend accessible on port 8000 but not through Traefik!" -ForegroundColor Yellow
                $healthy = $true
                break
            }
        } catch {
            # Not healthy yet
        }
    }

    Write-Host "..."
    Start-Sleep -Seconds 2
}

Write-Host ""

# Step 3: Test API connectivity
Write-Host "[Step 3] Testing API connectivity..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost/api/v1/" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] API is accessible via Traefik!" -ForegroundColor Green
    }
} catch {
    Write-Host "[FAIL] API not accessible via Traefik" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 4: Test OAuth endpoint
Write-Host "[Step 4] Testing OAuth endpoint..." -ForegroundColor Yellow

try {
    $oauthUrl = "http://localhost/api/v1/auth/oauth/google/start?redirect_uri=" + [System.Web.HttpUtility]::UrlEncode("http://localhost/workspace")
    $response = Invoke-WebRequest -Uri $oauthUrl -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction SilentlyContinue

    if ($response.StatusCode -eq 302) {
        $location = $response.Headers.Location
        if ($location -match "accounts.google.com") {
            Write-Host "[OK] OAuth endpoint redirects to Google!" -ForegroundColor Green
            Write-Host "Google URL: $location" -ForegroundColor Cyan

            # Extract redirect_uri from Google URL
            $uri = [System.Uri]$location
            $query = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
            $redirectUri = $query['redirect_uri']

            Write-Host ""
            Write-Host "IMPORTANT: Make sure this redirect URI is configured in Google Cloud Console:" -ForegroundColor Yellow
            Write-Host "  $redirectUri" -ForegroundColor White
        }
    }
} catch {
    Write-Host "[FAIL] OAuth endpoint test failed" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Diagnostic Complete!" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If OAuth still doesn't work:" -ForegroundColor Yellow
Write-Host "1. Check Google Cloud Console for correct redirect URI" -ForegroundColor White
Write-Host "2. Check backend logs: docker logs rawdrive-backend" -ForegroundColor White
Write-Host "3. Check Traefik logs: docker logs rawdrive-traefik" -ForegroundColor White
