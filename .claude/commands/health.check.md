---
description: Check health status of all RawDrive services
---

# Health Check All Services

Comprehensive health check for all RawDrive microservices and infrastructure.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**: 
  - [Observability Best Practices](../reference/observability-best-practices.md)
  - [Deployment Best Practices](../reference/deployment-best-practices.md)
  - [Microservices Patterns](../reference/microservices-patterns.md)

## Quick Check

```bash
# Check all Docker services status
manage-services.bat status

# Or use Docker Compose
docker compose -f infrastructure/docker/docker-compose.yml ps
```

## Detailed Health Checks

### 1. Infrastructure Services

#### PostgreSQL
```bash
# Check PostgreSQL is running
docker exec rawdrive-postgres pg_isready -U rawdrive

# Check database exists
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "SELECT version();"

# Check pgvector extension
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "SELECT * FROM pg_extension WHERE extname IN ('vector', 'pgvectorscale');"

# Check connection count
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c "SELECT count(*) FROM pg_stat_activity;"
```

#### Redis
```bash
# Check Redis is running
docker exec rawdrive-redis redis-cli ping

# Check memory usage
docker exec rawdrive-redis redis-cli INFO memory | grep used_memory_human

# Check connected clients
docker exec rawdrive-redis redis-cli INFO clients | grep connected_clients
```

#### PgBouncer
```bash
# Check PgBouncer status
docker exec rawdrive-pgbouncer psql -p 6432 -U rawdrive pgbouncer -c "SHOW POOLS;"

# Check active connections
docker exec rawdrive-pgbouncer psql -p 6432 -U rawdrive pgbouncer -c "SHOW CLIENTS;"
```

### 2. Microservices Health Endpoints

#### Backend API
```bash
curl -s http://localhost:8000/health/live | jq
curl -s http://localhost:8000/health/ready | jq
```

#### Gallery Service
```bash
curl -s http://localhost:8004/health/live | jq
curl -s http://localhost:8004/health/ready | jq
```

#### Billing Service
```bash
curl -s http://localhost:8005/health/live | jq
curl -s http://localhost:8005/health/ready | jq
```

#### Upload Service
```bash
curl -s http://localhost:8008/health/live | jq
curl -s http://localhost:8008/health/ready | jq
```

#### Onboarding Service
```bash
curl -s http://localhost:8006/health/live | jq
curl -s http://localhost:8006/health/ready | jq
```

#### Invitations Service
```bash
curl -s http://localhost:8007/health/live | jq
curl -s http://localhost:8007/health/ready | jq
```

#### Notifications Service
```bash
curl -s http://localhost:8010/health/live | jq
curl -s http://localhost:8010/health/ready | jq
```

#### Webhooks Service
```bash
curl -s http://localhost:8003/health/live | jq
curl -s http://localhost:8003/health/ready | jq
```

#### AI Service
```bash
curl -s http://localhost:8013/health/live | jq
curl -s http://localhost:8013/health/ready | jq
```

### 3. Monitoring Stack

#### Prometheus
```bash
# Check Prometheus is running
curl -s http://localhost:9090/-/healthy

# Check targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'
```

#### Grafana
```bash
# Check Grafana is running
curl -s http://localhost:3000/api/health | jq
```

#### Traefik
```bash
# Check Traefik dashboard
curl -s http://localhost:8080/api/overview | jq

# Check routers
curl -s http://localhost:8080/api/http/routers | jq
```

### 4. Frontend

```bash
# Check frontend is running (if started)
curl -s http://localhost:5173 -o /dev/null -w "HTTP Status: %{http_code}\n"
```

## Automated Health Check Script

Create a comprehensive health check script:

```powershell
# health-check.ps1
Write-Host "=== RawDrive Health Check ===" -ForegroundColor Cyan

# Infrastructure
Write-Host "`n[Infrastructure]" -ForegroundColor Yellow
docker exec rawdrive-postgres pg_isready -U rawdrive
docker exec rawdrive-redis redis-cli ping

# Microservices
Write-Host "`n[Microservices]" -ForegroundColor Yellow
$services = @(
    @{Name="Backend"; Port=8000},
    @{Name="Gallery"; Port=8004},
    @{Name="Billing"; Port=8005},
    @{Name="Upload"; Port=8008},
    @{Name="Webhooks"; Port=8003},
    @{Name="AI"; Port=8013}
)

foreach ($service in $services) {
    $response = Invoke-RestMethod -Uri "http://localhost:$($service.Port)/health/live" -ErrorAction SilentlyContinue
    if ($response.status -eq "alive") {
        Write-Host "✓ $($service.Name) Service: HEALTHY" -ForegroundColor Green
    } else {
        Write-Host "✗ $($service.Name) Service: UNHEALTHY" -ForegroundColor Red
    }
}

# Monitoring
Write-Host "`n[Monitoring]" -ForegroundColor Yellow
try {
    Invoke-RestMethod -Uri "http://localhost:9090/-/healthy" -ErrorAction Stop | Out-Null
    Write-Host "✓ Prometheus: HEALTHY" -ForegroundColor Green
} catch {
    Write-Host "✗ Prometheus: UNHEALTHY" -ForegroundColor Red
}

Write-Host "`n=== Health Check Complete ===" -ForegroundColor Cyan
```

## Expected Healthy Output

All services should return:

```json
{
  "status": "alive"
}
```

For readiness checks:

```json
{
  "status": "ready",
  "database": "connected",
  "redis": "connected"
}
```

## Common Issues

### Service Not Responding
```bash
# Check if container is running
docker ps | grep rawdrive

# Check container logs
docker logs rawdrive-<service-name> --tail 50

# Restart service
docker compose -f infrastructure/docker/docker-compose.yml restart <service-name>
```

### Database Connection Issues
```bash
# Check PostgreSQL logs
docker logs rawdrive-postgres --tail 50

# Check connection string
docker exec rawdrive-backend env | grep DATABASE_URL

# Test connection
docker exec rawdrive-backend python -c "from sqlalchemy import create_engine; engine = create_engine('postgresql://rawdrive:rawdrive@postgres:5432/rawdrive'); print(engine.connect())"
```

### Redis Connection Issues
```bash
# Check Redis logs
docker logs rawdrive-redis --tail 50

# Test connection
docker exec rawdrive-backend python -c "import redis; r = redis.from_url('redis://redis:6379/0'); print(r.ping())"
```

## Monitoring Dashboard

Access Grafana for visual health monitoring:
- URL: http://localhost:3000
- Username: admin
- Password: admin

Check the "RawDrive Services Overview" dashboard for:
- Service uptime
- Request rates
- Error rates
- Response times
- Resource usage

## Notes

- Run health checks before and after deployments
- Set up automated health checks in CI/CD
- Monitor Prometheus alerts for proactive issue detection
- All services should respond within 2 seconds
- Database connections should be pooled via PgBouncer
