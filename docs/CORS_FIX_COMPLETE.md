# Complete Fix for SSL and CORS Issues in Local Development

## Problem Summary

Two related issues were preventing the frontend from connecting to the backend:

1. **SSL Certificate Error** (RESOLVED)
   - Error: `ERR_CERT_AUTHORITY_INVALID`
   - Cause: Traefik forcing HTTPS redirects with invalid localhost certificate
   - Fix: Created development Traefik configs without HTTPS redirect

2. **CORS Preflight Error** (CURRENT)
   - Error: "Redirect is not allowed for a preflight request"
   - Cause: Traefik intercepting OPTIONS preflight requests
   - Fix: **Bypass Traefik for local development**

## Solution Applied

### Simple Approach: Direct Backend Connection

Instead of routing through Traefik (`http://localhost:80/api`), the frontend now connects directly to the backend on port 8000 (`http://localhost:8000/api`).

**Benefits:**
- ✅ No Traefik CORS complexity
- ✅ Backend CORS middleware handles everything correctly
- ✅ Faster requests (no proxy overhead)
- ✅ Better debugging experience
- ✅ Standard FastAPI + React development pattern

## Files Changed

### 1. Frontend Environment Configuration
**File**: `frontend/.env.development`

```bash
# API URL - Direct backend connection for local development
# Bypasses Traefik to avoid CORS preflight issues
# Backend CORS middleware handles cross-origin requests correctly
VITE_API_URL=http://localhost:8000
```

**Previous value**: `VITE_API_URL=http://localhost` (went through Traefik on port 80)

### 2. Backend CORS Configuration (No Changes Needed)
**File**: `.env:35`

Already correctly configured:
```bash
ALLOWED_CORS_ORIGINS=["http://localhost:5173","http://localhost:3000","http://localhost:3002","http://localhost:8000","https://rawdrive.in","https://www.rawdrive.in","https://rawdrive.ai","https://www.rawdrive.ai","https://rawdrive.de","https://www.rawdrive.de"]
```

The backend's FastAPI CORS middleware (in `backend/src/app/main.py:130-138`) properly handles:
- OPTIONS preflight requests
- Cross-origin credentials
- All required CORS headers

### 3. Traefik Development Configs (Created Earlier)
**Files**:
- `infrastructure/docker/traefik/traefik.dev.yaml` - No HTTPS redirect
- `infrastructure/docker/traefik/dynamic.dev.yaml` - HTTP-only routing

These files fix the SSL issue but Traefik is now bypassed for API calls in local development.

## How to Apply This Fix

### Step 1: Restart Frontend Dev Server

**CRITICAL**: The Vite dev server must be restarted to pick up the new `VITE_API_URL`.

```powershell
# Navigate to frontend directory
cd C:\Users\admin\Desktop\RawDrive\frontend

# Stop the current dev server
# Press Ctrl+C in the terminal where npm run dev is running

# Start the dev server again
npm run dev
```

You should see output like:
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose

VITE_API_URL: http://localhost:8000
```

### Step 2: Clear Browser Cache

To ensure no cached redirects or CORS preflight responses:

1. Open DevTools (F12)
2. Right-click the reload button
3. Select "Empty Cache and Hard Reload"

OR

1. Ctrl+Shift+Delete
2. Select "Cached images and files"
3. Click "Clear data"

### Step 3: Test the Connection

1. Open browser to: **http://localhost:5173**
2. Open DevTools Console (F12)
3. Try logging in with test credentials
4. **Expected**:
   - ✅ Requests go to `http://localhost:8000/api/v1/auth/login`
   - ✅ No CORS errors
   - ✅ No SSL certificate errors
   - ✅ Login succeeds

## Verification Steps

### 1. Check Backend is Running

```powershell
# Test backend health endpoint directly
curl http://localhost:8000/health

# Expected response:
# {"status":"healthy"}
```

### 2. Check Docker Containers

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "backend"

# Expected: rawdrive-backend container running with port 127.0.0.1:8000->8000/tcp
```

### 3. Check Backend Logs

```powershell
docker logs rawdrive-backend --tail 50

# Should show:
# - Application started
# - CORS origins configured
# - Health endpoint ready
```

### 4. Test CORS Directly

```powershell
# Send OPTIONS preflight request
curl -X OPTIONS http://localhost:8000/api/v1/auth/login `
  -H "Origin: http://localhost:5173" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: Content-Type,Authorization" `
  -v

# Expected headers in response:
# Access-Control-Allow-Origin: http://localhost:5173
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS
# Access-Control-Allow-Credentials: true
```

## Troubleshooting

### Still Getting CORS Errors

1. **Verify environment file**:
   ```powershell
   cat frontend\.env.development
   # Should show: VITE_API_URL=http://localhost:8000
   ```

2. **Verify Vite picked up the change**:
   - Check terminal where `npm run dev` is running
   - Should see the new VITE_API_URL value

3. **Check browser DevTools Network tab**:
   - Requests should go to `http://localhost:8000/api/...`
   - NOT `http://localhost/api/...` (that's Traefik)

4. **Clear ALL browser data**:
   ```
   Ctrl+Shift+Delete → All time → Everything
   ```

### Backend Not Responding

1. **Check backend is running**:
   ```powershell
   docker ps | Select-String "backend"
   ```

2. **Check backend logs for errors**:
   ```powershell
   docker logs rawdrive-backend --tail 100
   ```

3. **Restart backend container**:
   ```powershell
   docker compose -f infrastructure/docker/docker-compose.yml restart backend
   ```

4. **Check port availability**:
   ```powershell
   netstat -ano | findstr :8000
   # Should show docker-proxy listening on 127.0.0.1:8000
   ```

### Login Still Fails

1. **Check database is running**:
   ```powershell
   docker ps | Select-String "postgres"
   ```

2. **Check test user exists**:
   ```powershell
   docker exec rawdrive-backend python -m app.scripts.create_test_user
   ```

3. **Check backend database connection**:
   ```powershell
   docker logs rawdrive-backend | Select-String "database"
   ```

## Testing Checklist

After applying the fix, verify:

- [ ] Frontend dev server restarted
- [ ] Browser cache cleared
- [ ] Frontend loads at `http://localhost:5173`
- [ ] Backend responds at `http://localhost:8000/health`
- [ ] Browser console shows requests to `http://localhost:8000/api/...`
- [ ] No CORS preflight errors in console
- [ ] No SSL certificate errors in console
- [ ] Login form submits successfully
- [ ] Auth tokens received and stored
- [ ] Protected routes work after login

## Access URLs Reference

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend (Dev) | http://localhost:5173 | Vite dev server with HMR |
| Backend (Direct) | http://localhost:8000 | FastAPI backend (USE THIS) |
| Backend Health | http://localhost:8000/health | Health check endpoint |
| Backend Docs | http://localhost:8000/docs | OpenAPI/Swagger UI |
| Traefik Dashboard | http://localhost:8080 | Traefik admin UI |
| Grafana | http://localhost:3000 | Monitoring (if using docker-compose) |

## Production Deployment

**Important**: This configuration is for LOCAL DEVELOPMENT ONLY.

In production:
- Frontend should use `VITE_API_URL=https://api.rawdrive.ai` (or your domain)
- Traefik handles SSL/TLS termination
- Proper CORS origins configured for production domains
- No direct backend access (goes through Traefik/API Gateway)

## Alternative: Keep Traefik in Local Dev

If you want to use Traefik in local development:

1. Set `VITE_API_URL=http://localhost` in `.env.development`
2. Add CORS preflight handling to `infrastructure/docker/traefik/dynamic.dev.yaml`
3. See plan file: `C:\Users\admin\.claude\plans\ticklish-sauteeing-cray.md`

**Recommendation**: Stick with direct backend connection for simplicity.

## Summary

The fix involves a single environment variable change:
```bash
VITE_API_URL=http://localhost:8000
```

This allows the frontend to connect directly to the FastAPI backend, bypassing Traefik and its CORS complexity. The backend's CORS middleware handles all cross-origin requests correctly.

**Next Step**: Restart your frontend dev server and test login!
