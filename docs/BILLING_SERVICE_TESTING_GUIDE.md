# Billing Service Testing Guide - Windows PowerShell

**Date**: January 6, 2026
**Environment**: Docker Desktop for Windows

## Prerequisites

- Docker Desktop running on Windows
- PowerShell 5.1 or later
- Project located at: `C:\Users\admin\Desktop\RawDrive`

## Quick Test (Copy & Paste to PowerShell)

Open PowerShell as Administrator and run:

```powershell
# Navigate to project
cd C:\Users\admin\Desktop\RawDrive

# Verify Docker is running
docker --version

# Start billing service stack
Write-Host "`n=== Starting Billing Service ===" -ForegroundColor Cyan
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d billing-service postgres redis

# Wait for startup
Write-Host "`nWaiting 20 seconds for services to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# Check container status
Write-Host "`n=== Container Status ===" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "NAMES|billing|postgres|redis"

# Test health endpoint
Write-Host "`n=== Health Check Test ===" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8006/health" -UseBasicParsing
    Write-Host "Status: $($health.status)" -ForegroundColor Green
    Write-Host "Database: $($health.checks.database)" -ForegroundColor $(if($health.checks.database -eq "up"){"Green"}else{"Red"})
    Write-Host "Redis: $($health.checks.redis)" -ForegroundColor $(if($health.checks.redis -eq "up"){"Green"}else{"Red"})
    Write-Host "Circuit Breaker: $($health.circuit_breaker.state)" -ForegroundColor $(if($health.circuit_breaker.state -eq "closed"){"Green"}else{"Yellow"})
} catch {
    Write-Host "Health check FAILED: $_" -ForegroundColor Red
}

# Check logs for errors
Write-Host "`n=== Recent Logs (last 20 lines) ===" -ForegroundColor Cyan
docker logs rawdrive-billing-service --tail 20

Write-Host "`n=== Testing Complete ===" -ForegroundColor Green
Write-Host "Direct access: http://localhost:8006/health"
Write-Host "OpenAPI docs:  http://localhost:8006/docs"
Write-Host "Metrics:       http://localhost:8006/metrics"
```

## Detailed Testing Steps

### Step 1: Verify Docker Desktop

```powershell
# Check Docker version
docker --version
# Expected: Docker version 24.x.x or higher

# Check Docker Compose
docker compose version
# Expected: Docker Compose version v2.x.x

# List running containers
docker ps
```

### Step 2: Start Billing Service

```powershell
cd C:\Users\admin\Desktop\RawDrive

# Start only billing-related services
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d billing-service postgres redis

# Check logs during startup
docker logs rawdrive-billing-service -f
# Press Ctrl+C to exit log view
```

**Expected Log Output**:
```
INFO:     Started server process [1]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### Step 3: Run Automated Tests

```powershell
# Run the comprehensive test script
.\scripts\test-billing-setup.ps1
```

**Expected Output**:
```
=====================================
Billing Microservice Integration Tests
=====================================

1. Health Check Tests
-------------------------------------
Testing: Health endpoint (direct)... [PASS]

2. Metrics Tests
-------------------------------------
Testing: Metrics endpoint... [PASS]

...

Test Summary
=====================================
Passed: 7
Failed: 0

[SUCCESS] All tests passed!
```

### Step 4: Manual Endpoint Testing

```powershell
# Test 1: Health Check
Invoke-RestMethod -Uri "http://localhost:8006/health" | ConvertTo-Json -Depth 10

# Test 2: Metrics (Prometheus format)
(Invoke-WebRequest -Uri "http://localhost:8006/metrics").Content | Select-String "billing_"

# Test 3: OpenAPI Documentation
Start-Process "http://localhost:8006/docs"
```

### Step 5: Test Traefik Routing (Optional)

If Traefik is running:

```powershell
# Start Traefik
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d traefik

# Test billing API via Traefik (expects 401 without auth)
Invoke-WebRequest -Uri "http://localhost/api/v1/subscription" -SkipHttpErrorCheck -UseBasicParsing

# Expected: 401 Unauthorized (no auth token provided)
```

### Step 6: Inspect Database Connection

```powershell
# Check database connection pool status
$health = Invoke-RestMethod -Uri "http://localhost:8006/health"
$health.checks.database
# Expected: "up"

# Connect to database and verify tables
docker exec -it rawdrive-postgres psql -U rawdrive -d rawdrive -c "\dt payment_transactions"
# Expected: Table "payment_transactions" exists
```

### Step 7: Test Redis Connection

```powershell
# Check Redis status
$health = Invoke-RestMethod -Uri "http://localhost:8006/health"
$health.circuit_breaker

# Expected:
# state: "closed"
# failure_count: 0
```

## Troubleshooting

### Issue: Container Won't Start

```powershell
# Check container logs
docker logs rawdrive-billing-service

# Check if port 8006 is already in use
netstat -ano | findstr :8006

# If port is busy, stop conflicting service or change port in docker-compose.dev.yml
```

### Issue: Database Connection Failed

```powershell
# Check if postgres is running
docker ps | findstr postgres

# Restart postgres
docker compose -f infrastructure/docker/docker-compose.dev.yml restart postgres

# Wait 10 seconds and retry
Start-Sleep -Seconds 10
Invoke-RestMethod -Uri "http://localhost:8006/health"
```

### Issue: Redis Connection Failed

```powershell
# Check if redis is running
docker ps | findstr redis

# Restart redis
docker compose -f infrastructure/docker/docker-compose.dev.yml restart redis

# Check circuit breaker recovers
Start-Sleep -Seconds 5
Invoke-RestMethod -Uri "http://localhost:8006/health" | ConvertTo-Json
```

### Issue: 404 Not Found on Endpoints

```powershell
# Verify the service is listening on correct port
docker port rawdrive-billing-service

# Expected: 8000/tcp -> 127.0.0.1:8006

# Check if service started successfully
docker inspect rawdrive-billing-service --format='{{.State.Status}}'
# Expected: running
```

## Webhook Testing (Advanced)

### Test Razorpay Webhook

```powershell
# Set your webhook secret
$WEBHOOK_SECRET = "your_razorpay_webhook_secret"

# Create test payload
$payload = @{
    event = "payment.captured"
    payload = @{
        payment = @{
            entity = @{
                id = "pay_test_123"
                amount = 99900
                currency = "INR"
            }
        }
    }
} | ConvertTo-Json -Depth 10

# Generate HMAC signature
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($WEBHOOK_SECRET)
$signature = [BitConverter]::ToString($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($payload))).Replace("-","").ToLower()

# Send webhook
Invoke-WebRequest -Uri "http://localhost/webhooks/razorpay" `
    -Method POST `
    -Headers @{
        "Content-Type" = "application/json"
        "X-Razorpay-Signature" = $signature
    } `
    -Body $payload
```

### Test Stripe Webhook (with Stripe CLI)

```powershell
# Install Stripe CLI first: https://stripe.com/docs/stripe-cli

# Forward webhooks to local endpoint
stripe listen --forward-to localhost/webhooks/stripe

# Trigger test event
stripe trigger payment_intent.succeeded
```

## Performance Testing

### Load Test (Simple)

```powershell
# Test concurrent requests
1..10 | ForEach-Object -Parallel {
    Invoke-RestMethod -Uri "http://localhost:8006/health"
} -ThrottleLimit 10

Write-Host "10 concurrent requests completed successfully"
```

### Metrics Collection

```powershell
# Collect metrics before
$metrics_before = (Invoke-WebRequest -Uri "http://localhost:8006/metrics").Content

# Make 100 requests
1..100 | ForEach-Object {
    Invoke-RestMethod -Uri "http://localhost:8006/health" | Out-Null
}

# Collect metrics after
$metrics_after = (Invoke-WebRequest -Uri "http://localhost:8006/metrics").Content

# Compare
Write-Host "Request count increased:" -ForegroundColor Cyan
$metrics_after | Select-String "billing_http_requests_total"
```

## Cleanup

```powershell
# Stop billing service
docker compose -f infrastructure/docker/docker-compose.dev.yml stop billing-service

# Stop all services
docker compose -f infrastructure/docker/docker-compose.dev.yml down

# Remove volumes (caution: deletes data)
docker compose -f infrastructure/docker/docker-compose.dev.yml down -v
```

## Next Steps After Testing

1. **If All Tests Pass**:
   - Deploy to staging environment
   - Configure production environment variables
   - Set up monitoring dashboards
   - Document any custom configuration

2. **If Tests Fail**:
   - Check logs: `docker logs rawdrive-billing-service`
   - Verify .env file has required variables
   - Ensure database migrations are applied
   - Check network connectivity between containers

3. **Production Deployment**:
   - Update secrets in Kubernetes
   - Deploy with: `kubectl apply -k infrastructure/kubernetes/base/billing-service/`
   - Monitor KEDA autoscaling
   - Configure Razorpay/Stripe production webhooks

## Summary Checklist

After testing, verify:

- [ ] Health check returns `{"status": "healthy"}`
- [ ] Database connection status is `"up"`
- [ ] Redis connection status is `"up"`
- [ ] Circuit breaker state is `"closed"`
- [ ] Metrics endpoint returns Prometheus metrics
- [ ] OpenAPI docs accessible at `/docs`
- [ ] Container logs show no errors
- [ ] Service responds to 100+ concurrent requests
- [ ] Port 8006 is accessible (dev) or 8005 (prod)

## Support

- **Full Setup Guide**: `BILLING_SERVICE_SETUP_COMPLETE.md`
- **Service README**: `services/billing-service/README.md`
- **Architecture Docs**: `docs/ARCHITECTURE.md`
- **Logs**: `docker logs rawdrive-billing-service -f`

---

**Ready to Test!** 🚀

Copy the "Quick Test" section above into PowerShell to start testing immediately.
