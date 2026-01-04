# Fix CORS and Rate Limiting Issues

## Changes Made

### 1. ✅ CORS Configuration Fixed
- Updated `backend/src/app/config/settings.py` to:
  - Parse `ALLOWED_CORS_ORIGINS` from JSON strings or comma-separated values
  - Automatically set default development origins when `APP_ENV=development`

### 2. ✅ Rate Limiting Made Development-Friendly
- Updated `backend/src/app/services/rate_limit_service.py` to use lenient limits in development:
  - Auth: 100 requests/minute (was 10 requests/15 minutes)
  - API: 1000 requests/minute (was 100)
  - Upload: 200 requests/hour (was 20)
  - Search: 300 requests/minute (was 30)

### 3. ✅ CORS Headers Added to Rate Limit Responses
- Updated `backend/src/app/middleware/rate_limit.py` to include CORS headers in 429 responses
- This ensures CORS works even when rate limited

### 4. ✅ React Router Warning Fixed
- Added `v7_startTransition` future flag to `frontend/src/App.tsx`

### 5. ✅ Redis Rate Limit Keys Cleared
- Cleared all rate limit keys from Redis

## ⚠️ ACTION REQUIRED: Restart Backend Server

The backend server needs to be restarted to pick up the code changes. Here's how:

### Option 1: If running with Docker Compose
```bash
cd /Users/v13478/Desktop/RawDrive
docker-compose -f infrastructure/docker/docker-compose.yml restart backend
```

### Option 2: If running locally with uvicorn
```bash
# Find and kill the existing process
pkill -f "uvicorn.*app.main"

# Restart the backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Option 3: If running in a terminal
1. Go to the terminal where the backend is running
2. Press `Ctrl+C` to stop it
3. Restart with: `python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`

## Verify Fixes

After restarting the backend:

1. **Test CORS**:
   ```bash
   curl -X OPTIONS http://localhost:8000/api/v1/auth/login \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -v
   ```
   Should see `access-control-allow-origin: http://localhost:5173`

2. **Test Rate Limit (should work now)**:
   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/login \
     -H "Origin: http://localhost:5173" \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   ```
   Should get a proper response (not 429) and CORS headers should be present

3. **Clear Browser Cache**:
   - Hard refresh the frontend: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows/Linux)
   - Or open DevTools → Network → check "Disable cache"

## Expected Behavior After Fix

- ✅ No CORS errors in browser console
- ✅ No 429 errors (unless you make 100+ requests/minute in dev)
- ✅ React Router warning should disappear after browser refresh
- ✅ Login requests should work properly

## Troubleshooting

If issues persist:

1. **Check backend logs** for errors:
   ```bash
   # Docker
   docker-compose logs backend
   
   # Local
   # Check the terminal where backend is running
   ```

2. **Verify environment variables**:
   ```bash
   # Check if APP_ENV is set to development
   echo $APP_ENV
   ```

3. **Check Redis connection**:
   ```bash
   redis-cli PING
   # Should return: PONG
   ```

4. **Clear browser cache completely**:
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Or use Incognito/Private mode


