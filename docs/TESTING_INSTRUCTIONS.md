# Upload Microservice Testing Instructions

## 🚀 Quick Start (PowerShell)

### Option 1: Automated Testing (Recommended)

Run the automated test script that starts services and runs all tests:

```powershell
cd C:\Users\admin\Desktop\RawDrive
.\scripts\test-upload-service.ps1
```

This script will:
1. Start PostgreSQL and Redis
2. Start the upload-service
3. Test all health endpoints
4. Verify metrics are working
5. Display comprehensive results

### Option 2: Manual Step-by-Step

```powershell
# Navigate to project
cd C:\Users\admin\Desktop\RawDrive

# Start services
.\scripts\start-upload-service.ps1

# Test endpoints (after services are up)
.\scripts\test-endpoints.ps1
```

---

## 📋 Test Scripts Created

| Script | Purpose |
|--------|---------|
| `scripts/test-upload-service.ps1` | Complete automated testing suite |
| `scripts/start-upload-service.ps1` | Quick start for all services |
| `scripts/test-endpoints.ps1` | Test endpoints after services are running |

---

## 🧪 Manual Testing Steps

### Step 1: Start Infrastructure

```powershell
# Start PostgreSQL and Redis
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres redis

# Wait for services to be healthy
Start-Sleep -Seconds 10

# Verify services are running
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

**Expected Output:**
```
NAME                STATUS              PORTS
rawdrive-postgres-1 Up 10 seconds       0.0.0.0:5432->5432/tcp
rawdrive-redis-1    Up 10 seconds       0.0.0.0:6379->6379/tcp
```

### Step 2: Start Upload Service

```powershell
# Start upload-service
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d upload-service

# Wait for service to initialize
Start-Sleep -Seconds 15

# Check service status
docker compose -f infrastructure/docker/docker-compose.dev.yml ps upload-service
```

**Expected Output:**
```
NAME                      STATUS              PORTS
rawdrive-upload-service-1 Up 15 seconds       0.0.0.0:8005->8080/tcp
```

### Step 3: Check Logs

```powershell
# View logs (last 20 lines)
docker compose -f infrastructure/docker/docker-compose.dev.yml logs --tail=20 upload-service

# Follow logs in real-time
docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f upload-service
```

**Expected Log Output:**
```
Upload service started - service=upload-service version=1.0.0 environment=development
Database pool initialized
Redis connected
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8080
```

### Step 4: Test Health Endpoint

```powershell
Invoke-RestMethod -Uri "http://localhost:8005/health" -Method Get
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "upload-service"
}
```

### Step 5: Test Readiness Endpoint

```powershell
Invoke-RestMethod -Uri "http://localhost:8005/ready" -Method Get
```

**Expected Response:**
```json
{
  "status": "ready",
  "service": "upload-service",
  "version": "1.0.0",
  "checks": {
    "postgres": true,
    "redis": true
  }
}
```

**If you get 503 Service Unavailable:**
- Check PostgreSQL is running: `docker ps | Select-String postgres`
- Check Redis is running: `docker ps | Select-String redis`
- Check service logs for connection errors

### Step 6: Test Metrics Endpoint

```powershell
$metrics = Invoke-WebRequest -Uri "http://localhost:8005/metrics" -Method Get
$metrics.Content | Select-String "upload_concurrent_total"
```

**Expected Output:**
```
upload_concurrent_total{workspace_id="..."} 0
```

### Step 7: Test Authentication

```powershell
# This should fail with 401
try {
    Invoke-RestMethod -Uri "http://localhost:8005/api/v1/upload/session" -Method Post
} catch {
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
}
```

**Expected Output:**
```
Status Code: 401
```

This confirms the AuthMiddleware is working correctly.

---

## 🎨 Frontend Integration Testing

### Step 1: Enable Feature Flag

Create or edit `frontend/.env`:

```bash
VITE_FEATURE_UPLOAD_MICROSERVICE=true
VITE_UPLOAD_SERVICE_URL=http://localhost:8005
```

### Step 2: Start Frontend

```powershell
cd frontend
npm run dev
```

### Step 3: Test Upload Flow

1. **Open browser** → `http://localhost:3000`
2. **Login** with test credentials
3. **Open DevTools** (F12) → Network tab
4. **Upload a file** via the gallery
5. **Verify in Network tab:**
   - Request to `http://localhost:8005/api/v1/upload/session`
   - Response contains `upload_id` and `upload_url`
6. **Verify upload completes** → Asset appears in gallery

### Step 4: Feature Flag Toggle Test

**Disable feature flag:**
```bash
# Change in frontend/.env
VITE_FEATURE_UPLOAD_MICROSERVICE=false
```

**Restart frontend and test:**
- Upload should now go to `http://localhost:8000/api/v1/workspaces/.../uploads`
- Main backend handles the upload

**Re-enable feature flag:**
```bash
VITE_FEATURE_UPLOAD_MICROSERVICE=true
```

**Verify:**
- Upload goes back to `http://localhost:8005/api/v1/upload/session`

---

## 🔍 Verification Checklist

### Backend Service ✅

- [ ] **Service starts without errors**
  ```powershell
  docker compose logs upload-service | Select-String "error" -NotMatch
  ```

- [ ] **Database connection successful**
  ```powershell
  docker compose logs upload-service | Select-String "Database pool initialized"
  ```

- [ ] **Redis connection successful**
  ```powershell
  docker compose logs upload-service | Select-String "Redis connected"
  ```

- [ ] **Health endpoint returns 200**
  ```powershell
  (Invoke-WebRequest -Uri "http://localhost:8005/health").StatusCode
  # Expected: 200
  ```

- [ ] **Readiness endpoint validates dependencies**
  ```powershell
  $ready = Invoke-RestMethod -Uri "http://localhost:8005/ready"
  $ready.checks.postgres -and $ready.checks.redis
  # Expected: True
  ```

- [ ] **Metrics endpoint returns Prometheus format**
  ```powershell
  (Invoke-WebRequest -Uri "http://localhost:8005/metrics").Content | Select-String "upload_concurrent_total"
  # Should find metric
  ```

- [ ] **Auth middleware rejects unauthenticated requests**
  ```powershell
  # Should return 401
  try { Invoke-RestMethod -Uri "http://localhost:8005/api/v1/upload/session" -Method Post } catch { $_.Exception.Response.StatusCode }
  ```

### Frontend Integration ✅

- [ ] **Feature flag disabled routes to main backend**
  - Network tab shows: `localhost:8000/api/v1/workspaces/.../uploads`

- [ ] **Feature flag enabled routes to upload service**
  - Network tab shows: `localhost:8005/api/v1/upload/session`

- [ ] **File upload completes successfully**
  - Session created
  - File uploaded
  - Commit successful
  - Asset appears in gallery

- [ ] **Error handling works**
  - Try uploading with service stopped
  - Should show user-friendly error

---

## 📊 Monitoring

### View Live Metrics

```powershell
# Fetch metrics every 5 seconds
while ($true) {
    Clear-Host
    Write-Host "Upload Service Metrics - $(Get-Date)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    $metrics = (Invoke-WebRequest -Uri "http://localhost:8005/metrics").Content
    $metrics | Select-String "upload_concurrent_total|upload_requests_total|upload_errors_total"
    Start-Sleep -Seconds 5
}
```

### View Live Logs

```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml logs -f upload-service
```

### Check Service Health

```powershell
# Continuous health check
while ($true) {
    $health = Invoke-RestMethod -Uri "http://localhost:8005/health"
    $ready = Invoke-RestMethod -Uri "http://localhost:8005/ready"
    Write-Host "$(Get-Date) - Health: $($health.status), Ready: $($ready.status), PG: $($ready.checks.postgres), Redis: $($ready.checks.redis)"
    Start-Sleep -Seconds 5
}
```

---

## 🔧 Troubleshooting

### Service Won't Start

**Check container logs:**
```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml logs upload-service
```

**Common issues:**
1. **PostgreSQL not running** → Start: `docker compose up -d postgres`
2. **Redis not running** → Start: `docker compose up -d redis`
3. **Port 8005 already in use** → Stop other services or change port
4. **Database connection error** → Check DATABASE_URL in .env

### Health Check Fails (503)

**Verify dependencies:**
```powershell
# Test PostgreSQL
docker exec rawdrive-postgres-1 psql -U rawdrive -d rawdrive -c "SELECT 1"

# Test Redis
docker exec rawdrive-redis-1 redis-cli ping
```

### Frontend Not Routing to Upload Service

**Verify configuration:**
```powershell
# Check .env file
Get-Content frontend/.env | Select-String "UPLOAD"
```

**Should show:**
```
VITE_FEATURE_UPLOAD_MICROSERVICE=true
VITE_UPLOAD_SERVICE_URL=http://localhost:8005
```

**Restart frontend dev server:**
```powershell
cd frontend
# Press Ctrl+C to stop
npm run dev
```

### Metrics Not Working

**Check metrics module:**
```powershell
docker compose logs upload-service | Select-String "metrics"
```

**Should see:**
```
Initialize metrics with version
```

---

## 🛑 Stopping Services

```powershell
# Stop all services
docker compose -f infrastructure/docker/docker-compose.dev.yml down

# Stop only upload-service
docker compose -f infrastructure/docker/docker-compose.dev.yml stop upload-service

# Restart upload-service
docker compose -f infrastructure/docker/docker-compose.dev.yml restart upload-service
```

---

## 📈 Performance Testing

### Load Test with Multiple Uploads

```powershell
# Simulate 100 concurrent health checks
1..100 | ForEach-Object -Parallel {
    Invoke-RestMethod -Uri "http://localhost:8005/health"
} -ThrottleLimit 50

Write-Host "Completed 100 requests"

# Check metrics
$metrics = Invoke-WebRequest -Uri "http://localhost:8005/metrics"
$metrics.Content | Select-String "upload_requests_total"
```

---

## ✅ Success Criteria

All of these should pass:

1. ✅ Service starts without errors
2. ✅ `/health` returns 200
3. ✅ `/ready` returns 200 with postgres=true, redis=true
4. ✅ `/metrics` returns Prometheus format with real data
5. ✅ Auth middleware rejects unauthenticated requests (401)
6. ✅ Frontend routes to upload service when flag enabled
7. ✅ File upload completes successfully
8. ✅ Feature flag toggle works instantly

---

## 📞 Need Help?

**Check logs:**
```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml logs upload-service
```

**Check container status:**
```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml ps
```

**Restart everything:**
```powershell
docker compose -f infrastructure/docker/docker-compose.dev.yml restart
```

---

## 🎊 You're Ready!

Once all tests pass, the upload microservice is fully operational and ready for:
- Local development
- Integration testing
- Performance testing
- Production deployment (with proper secrets configured)

Next: See [UPLOAD_SERVICE_DEPLOYMENT_GUIDE.md](UPLOAD_SERVICE_DEPLOYMENT_GUIDE.md) for production deployment strategy.
