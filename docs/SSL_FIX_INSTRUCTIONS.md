# SSL Certificate Fix for Local Development

## Problem Summary

The frontend was experiencing `ERR_CERT_AUTHORITY_INVALID` errors when trying to connect to the backend API. This was caused by:

1. **Traefik forcing HTTPS redirects** for all HTTP traffic (port 80 → port 443)
2. **Invalid SSL certificate** for `localhost` (Let's Encrypt certificates don't work for localhost)
3. **Connection failures** resulting in repeated retry attempts

## Solution Applied

Created development-specific Traefik configurations that:
- ✅ Disable HTTPS redirects for local development
- ✅ Use HTTP only (port 80) without SSL
- ✅ Configure proper routing for `localhost`
- ✅ Maintain separation from production configs

## Changes Made

### 1. New Traefik Development Configs

- **`infrastructure/docker/traefik/traefik.dev.yaml`**
  Development static configuration (no HTTPS redirect, no Let's Encrypt)

- **`infrastructure/docker/traefik/dynamic.dev.yaml`**
  Development dynamic configuration (HTTP routing for localhost)

- **`infrastructure/docker/traefik/README.md`**
  Documentation for Traefik configuration

### 2. Updated Docker Compose

**File**: `infrastructure/docker/docker-compose.yml`

```yaml
# Changed from:
- ./traefik/traefik.yaml:/etc/traefik/traefik.yaml:ro
- ./traefik/dynamic.yaml:/etc/traefik/dynamic.yaml:ro

# To:
- ./traefik/traefik.dev.yaml:/etc/traefik/traefik.yaml:ro
- ./traefik/dynamic.dev.yaml:/etc/traefik/dynamic.yaml:ro
```

### 3. Updated Frontend Environment

**File**: `frontend/.env.development`

```bash
# Changed from:
VITE_API_URL=

# To:
VITE_API_URL=http://localhost
```

## How to Apply the Fix

### Step 1: Stop All Containers

Open PowerShell or Command Prompt in the RawDrive directory:

```powershell
cd C:\Users\admin\Desktop\RawDrive
docker compose -f infrastructure/docker/docker-compose.yml down
```

### Step 2: Restart with New Configuration

```powershell
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### Step 3: Verify Traefik is Using HTTP

Check Traefik logs to confirm it's using the development config:

```powershell
docker logs rawdrive-traefik --tail 50
```

You should see:
- No Let's Encrypt certificate errors
- Entry point `web` on port 80 (without redirect to websecure)
- Routes configured for `localhost`

### Step 4: Restart Frontend Development Server

If your frontend is still running, restart it to pick up the new environment variables:

```powershell
cd frontend
npm run dev
```

### Step 5: Test the Connection

1. Open your browser to: http://localhost:3000
2. Try logging in
3. You should NO longer see `ERR_CERT_AUTHORITY_INVALID` errors

## Verification Checklist

- [ ] Docker containers are running: `docker ps`
- [ ] Traefik is healthy: `docker logs rawdrive-traefik | Select-String -Pattern "error"`
- [ ] Frontend can reach backend: Check browser console for successful API calls
- [ ] No SSL errors in browser console
- [ ] Login works successfully

## Access URLs

After the fix, these URLs should work:

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 (dev server) |
| Frontend (via Traefik) | http://localhost |
| Backend API | http://localhost/api |
| Backend Direct | http://localhost:8000 |
| Traefik Dashboard | http://localhost:8080 |
| Grafana | http://localhost/grafana |

## Troubleshooting

### Port Conflicts

If you see "port already in use" errors:

```powershell
# Check what's using port 80
netstat -ano | findstr :80

# Check what's using port 443
netstat -ano | findstr :443
```

### Still Getting SSL Errors

1. **Clear browser cache**: Ctrl+Shift+Delete → Clear cached images and files
2. **Hard refresh**: Ctrl+F5
3. **Check .env file**: Ensure `frontend/.env.development` has `VITE_API_URL=http://localhost`
4. **Verify Traefik config**: `docker exec rawdrive-traefik cat /etc/traefik/traefik.yaml`

### Backend Not Responding

```powershell
# Check backend health
docker exec rawdrive-backend curl http://localhost:8000/health

# Check backend logs
docker logs rawdrive-backend --tail 100
```

## Production Deployment

When deploying to production:
1. Use `traefik.yaml` and `dynamic.yaml` (without `.dev`)
2. Configure domain name and Let's Encrypt email
3. Ensure DNS points to your server
4. Let's Encrypt will automatically provision SSL certificates

See: [infrastructure/docker/traefik/README.md](infrastructure/docker/traefik/README.md)

## Support

If you still experience issues:
1. Check Traefik dashboard: http://localhost:8080
2. Review Traefik logs: `docker logs rawdrive-traefik`
3. Check backend logs: `docker logs rawdrive-backend`
4. Verify network connectivity: `docker network inspect rawdrive-network`
