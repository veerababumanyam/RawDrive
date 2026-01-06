# Gallery Microservice Scripts

Quick reference for starting and testing the gallery microservice.

## Quick Start

### 1. Start Everything (Recommended for first-time setup)

```powershell
# Start gallery service with all dependencies
.\scripts\start-gallery-dev.ps1
```

This script will:
- ✓ Check Docker is running
- ✓ Verify .env file exists (creates from .env.example if missing)
- ✓ Start PostgreSQL, Redis, and Gallery service
- ✓ Wait for services to be healthy
- ✓ Display status and access links

### 2. Test the Integration

```powershell
# Run comprehensive integration tests
.\scripts\test-gallery-setup.ps1
```

This script tests:
- ✓ Docker connectivity
- ✓ Required containers running
- ✓ Gallery service health endpoint
- ✓ Traefik routing configuration
- ✓ Prometheus metrics endpoint
- ✓ Traefik dashboard API
- ✓ Container logs

### 3. Individual Service Management

```powershell
# Start only gallery service (if dependencies already running)
.\scripts\dev-gallery-service.ps1

# Or use docker compose directly
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d gallery-service

# View logs
docker logs rawdrive-gallery-service -f

# Restart gallery service
docker restart rawdrive-gallery-service

# Stop gallery service
docker stop rawdrive-gallery-service
```

## Access Points

Once running, access the service at:

- **Direct Health Check**: http://localhost:8004/health
- **Via Traefik**: http://localhost/api/v1/galleries
- **Metrics**: http://localhost:8004/metrics
- **Traefik Dashboard**: http://traefik.localhost:8080

## Troubleshooting

### Port 8004 already in use
```powershell
# Find what's using the port
netstat -ano | findstr :8004

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or change the port in docker-compose.dev.yml to 8005
```

### Container won't start
```powershell
# Check container logs
docker logs rawdrive-gallery-service

# Remove and recreate container
docker compose -f infrastructure/docker/docker-compose.dev.yml rm -f gallery-service
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d gallery-service
```

### Traefik routing not working
```powershell
# Restart Traefik to reload configuration
docker restart rawdrive-traefik

# Verify routers are loaded
curl http://traefik.localhost:8080/api/http/routers | ConvertFrom-Json | Where-Object { $_.name -like "*gallery*" }
```

### Database connection errors
```powershell
# Check if PostgreSQL is running
docker ps | findstr postgres

# Check if database exists
docker exec rawdrive-postgres psql -U rawdrive -c "\l"

# Check gallery service can connect
docker exec rawdrive-gallery-service curl http://localhost:8000/health
```

## Development Workflow

### Standard Development Flow

1. **Start services**:
   ```powershell
   .\scripts\start-gallery-dev.ps1
   ```

2. **Make code changes** in `services/gallery-service/`

3. **Restart to apply changes**:
   ```powershell
   docker restart rawdrive-gallery-service
   ```

4. **View logs**:
   ```powershell
   docker logs rawdrive-gallery-service -f
   ```

5. **Test changes**:
   ```powershell
   .\scripts\test-gallery-setup.ps1
   ```

### Hot Reload Development

The dev compose file mounts the source code, so changes should auto-reload:

```powershell
# Start with volume mount
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d gallery-service

# Edit files in services/gallery-service/
# Changes should auto-reload (check logs)
```

## Environment Variables

Required in `.env`:
```bash
# JWT (must match backend)
JWT_SECRET=your-secret-here

# R2 Storage
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=rawdrive
```

Optional tuning:
```bash
GALLERY_DB_POOL_MIN_SIZE=10
GALLERY_DB_POOL_MAX_SIZE=100
GALLERY_REDIS_MAX_CONNECTIONS=50
```

## Testing with Frontend

After starting the gallery service, test frontend integration:

```powershell
# Start frontend
cd frontend
npm run dev

# Open browser to http://localhost:3000
# Navigate to gallery management
# API calls should automatically route through Traefik to gallery service
```

## Production Deployment

For Kubernetes deployment, see:
- `infrastructure/kubernetes/base/gallery-service/README.md`
- `infrastructure/kubernetes/base/gallery-service/secrets-template.yaml`
