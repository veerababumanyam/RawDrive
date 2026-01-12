# 🚀 RawDrive Docker Quick Start

## One-Command Startup

```bash
# Windows (Command Prompt)
start-all-services.bat

# Windows (PowerShell)
.\start-all-services.ps1

# Or use the management script
manage-services.bat start
```

## ✅ Auto-Restart Enabled

All services are configured with `restart: unless-stopped`, which means:
- **Services automatically start when Docker Desktop starts**
- Services restart automatically if they crash
- Services stay stopped only if you manually stop them

## 📋 Service Management Commands

```bash
# Start all services
manage-services.bat start

# Stop all services
manage-services.bat stop

# Restart all services
manage-services.bat restart

# Check status
manage-services.bat status

# View logs (all services)
manage-services.bat logs

# View logs (specific service)
manage-services.bat logs gallery-service
```

## 🌐 Service URLs

| Service | URL | Status |
|---------|-----|--------|
| **Backend** | http://localhost:8000 | Main API |
| **Gallery Service** | http://localhost:8004 | Gallery & Magic Links |
| **Billing Service** | http://localhost:8005 | Payments & Subscriptions |
| **Onboarding Service** | http://localhost:8006 | User Registration |
| **Invitations Service** | http://localhost:8007 | Wedding Invitations |
| **Upload Service** | http://localhost:8008 | TUS File Uploads |
| **Traefik Dashboard** | http://localhost:8080 | API Gateway |
| **Grafana** | http://localhost:3000 | Dashboards (admin/admin) |
| **Prometheus** | http://localhost:9090 | Metrics |
| **Postgres** | localhost:5432 | Database |
| **Redis** | localhost:6379 | Cache |

## 📊 All Services (20 total)

### Microservices (6)
- ✅ **backend** (port 8000) - Main API
- ✅ **gallery-service** (port 8004) - Gallery viewing
- ✅ **billing-service** (port 8005) - Payments
- ✅ **onboarding-service** (port 8006) - Registration
- ✅ **invitations-api** (port 8007) - Invitations
- ✅ **upload-service** (port 8008) - File uploads

### Workers (4)
- ✅ **face-worker** (port 8001) - Face detection
- ✅ **content-worker** (port 8002) - Content analysis
- ✅ **quality-worker** (port 8003) - Quality scoring
- ✅ **invitations-worker** (port 8009) - Email processing

### Infrastructure (10)
- ✅ **postgres** (port 5432) - PostgreSQL 16 + pgvector
- ✅ **redis** (port 6379) - Redis 7
- ✅ **pgbouncer** (port 6432) - Connection pooler
- ✅ **traefik** (ports 80, 443, 8080, 8082) - API Gateway
- ✅ **prometheus** (port 9090) - Metrics collection
- ✅ **grafana** (port 3000) - Dashboards
- ✅ **loki** (port 3100) - Log aggregation
- ✅ **promtail** (port 9080) - Log collection
- ✅ **alertmanager** (port 9093) - Alerts
- ✅ **one-api** (port 3002) - AI gateway

## 🔧 Direct Docker Compose Commands

```bash
# Start all services
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d

# Stop all services
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env down

# Restart all services
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env restart

# View status
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env ps

# View logs (all)
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env logs -f

# View logs (specific service)
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env logs -f gallery-service

# Rebuild a service
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d --build gallery-service
```

## 🐛 Troubleshooting

### Port Already in Use
If you see "port already in use" errors:
```bash
# Check what's using the port (example: port 8004)
netstat -ano | findstr :8004

# Kill the process (replace PID with actual process ID)
taskkill //F //PID <PID>
```

### Service Won't Start
```bash
# Check logs for the specific service
manage-services.bat logs <service-name>

# Example: Check gallery service logs
manage-services.bat logs gallery-service

# Rebuild and restart the service
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env up -d --build <service-name>
```

### Check Service Health
```bash
# View detailed status
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env ps

# Check health of specific container
docker inspect rawdrive-gallery-service --format='{{.State.Health.Status}}'
```

### Reset Everything
```bash
# Stop and remove all containers, networks, volumes
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env down -v

# Start fresh
start-all-services.bat
```

## 📝 Notes

1. **First-time startup** may take 2-3 minutes as Docker builds images
2. **Health checks** run every 10-30 seconds (wait for "healthy" status)
3. **Auto-restart** is configured - services will start with Docker Desktop
4. **Environment variables** are loaded from `.env` file in project root
5. **Logs** are collected by Loki and available in Grafana

## 🎯 Quick Health Check

```bash
# Check if all services are healthy
docker compose -f infrastructure/docker/docker-compose.yml --env-file .env ps | findstr "healthy"

# Should show:
# - postgres (healthy)
# - redis (healthy)
# - gallery-service (healthy)
# - billing-service (healthy)
# - onboarding-service (healthy)
# - upload-service (healthy)
# - invitations-api (healthy)
# - face-worker (healthy)
# - content-worker (healthy)
# - quality-worker (healthy)
```

## 📚 Additional Resources

- **Full Documentation**: [CLAUDE.md](./CLAUDE.md)
- **Architecture**: [docs/ARCHITECTURE_QUICK_REFERENCE.md](./docs/ARCHITECTURE_QUICK_REFERENCE.md)
- **Troubleshooting**: [docs/troubleshooting/](./docs/troubleshooting/)
- **Runbooks**: [docs/runbooks/](./docs/runbooks/)
