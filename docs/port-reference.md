# RawDrive Port Assignment Reference

Quick reference for all service ports in the RawDrive application.

## Infrastructure Services

| Service | Port | Environment Variable | Notes |
|---------|------|---------------------|-------|
| Traefik HTTP | 80 | PORT_TRAEFIK_HTTP | Redirects to HTTPS |
| Traefik HTTPS | 443 | PORT_TRAEFIK_HTTPS | Main entry point |
| Traefik Dashboard | 8080 | PORT_TRAEFIK_DASHBOARD | Dev only |
| Traefik Metrics | 8082 | PORT_TRAEFIK_METRICS | For Prometheus/KEDA |
| PostgreSQL | 5432 | PORT_POSTGRES | TimescaleDB with pgvector |
| Redis | 6379 | PORT_REDIS | Cache & sessions |
| Redis Exporter | 9121 | PORT_REDIS_EXPORTER | Metrics |
| PgBouncer | 6432 | PORT_PGBOUNCER | Connection pooler |
| Prometheus | 9090 | PORT_PROMETHEUS | Metrics collection |
| Alertmanager | 9093 | PORT_ALERTMANAGER | Alert routing |
| Grafana | 3000 | PORT_GRAFANA | Dashboards |
| Loki | 3100 | PORT_LOKI | Log aggregation |
| Promtail | 9080 | PORT_PROMTAIL | Log shipping |
| Node Exporter | 9100 | PORT_NODE_EXPORTER | Host metrics |
| One-API | 3002 | PORT_ONE_API | LLM gateway (external) |
| One-API Internal | 3002 | PORT_ONE_API_INTERNAL | LLM gateway (internal) |

## Application Microservices

| Service | Port | Environment Variable | Purpose |
|---------|------|---------------------|---------|
| Backend | 8000 | PORT_BACKEND | Main FastAPI backend |
| Face Worker | 8001 | PORT_FACE_WORKER | Face detection worker |
| Content Worker | 8002 | PORT_CONTENT_WORKER | Content processing |
| Quality Worker | 8003 | PORT_QUALITY_WORKER | Quality analysis |
| Gallery Service | 8004 | PORT_GALLERY | Gallery viewing & proofing |
| Billing Service | 8005 | PORT_BILLING | Subscriptions & payments |
| Onboarding Service | 8006 | PORT_ONBOARDING | User registration |
| Invitations API | 8007 | PORT_INVITATIONS | Wedding invitations |
| Upload Service | 8008 | PORT_UPLOAD | TUS file uploads |
| Invitations Worker | 8009 | PORT_INVITATIONS_WORKER | Email worker |

## Port Ranges

- **80-443**: HTTP/HTTPS (Traefik)
- **3000-3100**: Monitoring & Tools (Grafana, Loki, One-API)
- **5432-6432**: Databases (PostgreSQL, PgBouncer)
- **6379**: Cache (Redis)
- **8000-8009**: Application Microservices
- **8080-8082**: Traefik Internal (Dashboard, Metrics)
- **9000-9121**: Exporters & Metrics (Prometheus, Alertmanager, etc.)

## Health Check Endpoints

All application microservices expose a `/health` endpoint:

```bash
# Backend
curl http://localhost:8000/health

# Face Worker
curl http://localhost:8001/health

# Content Worker
curl http://localhost:8002/health

# Quality Worker
curl http://localhost:8003/health

# Gallery Service
curl http://localhost:8004/health

# Billing Service
curl http://localhost:8005/health

# Onboarding Service
curl http://localhost:8006/health

# Invitations API
curl http://localhost:8007/health

# Upload Service
curl http://localhost:8008/health
```

## Access URLs (Development)

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Traefik Dashboard**: http://localhost:8080
- **Grafana**: http://localhost:3000
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

## Production Access (via Traefik)

All services are accessed through Traefik reverse proxy:
- **Frontend**: https://rawdrive.ai
- **Backend API**: https://rawdrive.ai/api
- **Grafana**: https://rawdrive.ai/grafana

## Notes

1. All ports are defined in `.env` file
2. Infrastructure services use standard ports internally (isolated in containers)
3. Application microservices use unique ports (8000-8009)
4. All services bind to `127.0.0.1` (localhost) for security
5. External access is through Traefik reverse proxy
6. Port conflicts have been eliminated

## Changing Ports

To change a service port:

1. Update the corresponding `PORT_*` variable in `.env`
2. Restart the Docker services:
   ```bash
   docker compose -f infrastructure/docker/docker-compose.yml down
   docker compose -f infrastructure/docker/docker-compose.yml up -d
   ```

## Troubleshooting

### Port Already in Use

```powershell
# Find what's using a port
netstat -ano | findstr ":8000"

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

### Check All Service Ports

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

### Verify No Conflicts

```powershell
# Check all application ports
8000..8009 | ForEach-Object {
    $port = $_
    try {
        $null = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
        Write-Host "Port $port is in use" -ForegroundColor Green
    } catch {
        Write-Host "Port $port is free" -ForegroundColor Yellow
    }
}
```
