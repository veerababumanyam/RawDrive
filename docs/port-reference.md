# RawDrive Port Assignment Reference

All ports are configured via `PORT_*` variables in `infrastructure/docker/.env`. Never hardcode port numbers — always reference the env var.

## Infrastructure Services

| Service | Default Port | Environment Variable | Notes |
|---------|-------------|---------------------|-------|
| Traefik HTTP | 80 | PORT_TRAEFIK_HTTP | Main entry, routes to services |
| Traefik HTTPS | 443 | PORT_TRAEFIK_HTTPS | Production TLS |
| Traefik Dashboard | 8080 | PORT_TRAEFIK_DASHBOARD | Dev only |
| Traefik Metrics | 8082 | PORT_TRAEFIK_METRICS | For Prometheus/KEDA |
| PostgreSQL | 5432 | PORT_POSTGRES | TimescaleDB with pgvector |
| Redis | 6379 | PORT_REDIS | Cache & sessions |
| PgBouncer | 6432 | PORT_PGBOUNCER | Connection pooler |
| Prometheus | 9090 | PORT_PROMETHEUS | Metrics collection |
| Alertmanager | 9093 | PORT_ALERTMANAGER | Alert routing |
| Grafana | 3000 | PORT_GRAFANA | Dashboards (admin/admin) |
| Loki | 3100 | PORT_LOKI | Log aggregation |
| Promtail | 9080 | PORT_PROMTAIL | Log shipping |
| Milvus | 19530 | PORT_MILVUS | Vector DB |
| Milvus Metrics | 9091 | PORT_MILVUS_METRICS | Vector DB metrics |
| MinIO API | 9000 | PORT_MINIO | Object storage for Milvus |
| MinIO Console | 9001 | PORT_MINIO_CONSOLE | MinIO web UI (minioadmin/minioadmin) |
| etcd | 2379 | PORT_ETCD | Service discovery for Milvus |
| One-API | 3002 | PORT_ONE_API | LLM gateway |
| Redis Exporter | 9121 | PORT_REDIS_EXPORTER | Redis metrics |
| Node Exporter | 9100 | PORT_NODE_EXPORTER | Host metrics |

## Application Microservices

| Service | Default Port | Environment Variable | Container | Purpose |
|---------|-------------|---------------------|-----------|---------|
| Backend | 8000 | PORT_BACKEND | rawdrive-backend | Main FastAPI API |
| Face Worker | 8001 | PORT_FACE_WORKER | rawdrive-face-worker | Face detection |
| Content Worker | 8002 | PORT_CONTENT_WORKER | rawdrive-content-worker | Content processing |
| Quality Worker | 8003 | PORT_QUALITY_WORKER | rawdrive-quality-worker | Quality analysis |
| Gallery Service | 8004 | PORT_GALLERY | rawdrive-gallery-service | Gallery viewing |
| Billing Service | 8005 | PORT_BILLING | rawdrive-billing-service | Payments |
| Onboarding | 8006 | PORT_ONBOARDING | rawdrive-onboarding-service | Registration |
| Invitations API | 8007 | PORT_INVITATIONS | rawdrive-invitations-api | Wedding invitations |
| Upload Service | 8008 | PORT_UPLOAD | rawdrive-upload-service | TUS file uploads |
| Invitations Worker | 8009 | PORT_INVITATIONS_WORKER | rawdrive-invitations-worker | Email processing |
| Notifications | 8010 | PORT_NOTIFICATIONS | rawdrive-notifications-service | Multi-channel |
| Client Service | 8011 | PORT_CLIENT | rawdrive-client-service | CRM |
| AI Processing | 8012 | PORT_AI_PROCESSING | rawdrive-ai-processing | Embeddings, CLIP |
| AI Service | 8013 | PORT_AI_SERVICE | rawdrive-ai-service-mcp | AI orchestration |
| Webhooks | 8015 | PORT_WEBHOOKS | rawdrive-webhooks-service | Event delivery |
| Growth / Face | 8016 | PORT_FACE_SERVICE | rawdrive-growth-service | Referrals |

## Port Ranges

- **80-443**: HTTP/HTTPS (Traefik)
- **2379**: Service discovery (etcd)
- **3000-3100**: Monitoring & Tools (Grafana, Loki, One-API)
- **5432-6432**: Databases (PostgreSQL, PgBouncer)
- **6379**: Cache (Redis)
- **8000-8016**: Application Microservices & Workers
- **8080-8082**: Traefik Internal (Dashboard, Metrics)
- **9000-9121**: Object Storage, Exporters & Metrics
- **19530**: Vector DB (Milvus)

## Health Check Endpoints

All application microservices expose `/health`:

```bash
# Quick check all services
for port in 8000 8004 8005 8006 8007 8008 8010 8011 8012 8013 8015 8016; do
  echo "Port $port: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/health)"
done
```

## Access URLs (Development)

- **Frontend**: http://localhost:5173 (Vite dev server)
- **Frontend via Traefik**: http://localhost
- **Backend API**: http://localhost:8000 or http://localhost/api
- **Traefik Dashboard**: http://localhost:8080
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9090
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## Changing Ports

1. Update the `PORT_*` variable in `infrastructure/docker/.env`
2. Restart: `docker compose -f infrastructure/docker/docker-compose.yml up -d`

## Troubleshooting

```powershell
# Find what's using a port
netstat -ano | findstr ":8000"

# Check all running containers and ports
docker ps --format "table {{.Names}}\t{{.Ports}}"
```
