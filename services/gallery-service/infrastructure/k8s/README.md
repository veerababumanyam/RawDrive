# Gallery Service Kubernetes Deployment

## Overview

The gallery service is a high-performance microservice optimized for handling 50K concurrent gallery views with KEDA autoscaling.

## Creating Secrets

The service requires sensitive credentials that should not be committed to version control.

### Step 1: Create secrets.yaml

```bash
# Copy the template
cp secrets-template.yaml secrets.yaml

# Edit secrets.yaml and fill in actual credentials
# Note: secrets.yaml is gitignored automatically
```

### Step 2: Fill in Required Values

Edit `secrets.yaml` and replace placeholder values:

- `DATABASE_URL` - PostgreSQL connection string (format: `postgresql://USER:PASSWORD@HOST:5432/rawdrive`)
- `DATABASE_READ_REPLICA_URL` - Optional read replica connection string (can be same as DATABASE_URL)
- `REDIS_URL` - Redis connection string (format: `redis://HOST:6379/0`)
- `JWT_SECRET` - **CRITICAL**: Must match the main backend's JWT_SECRET
- `R2_ENDPOINT` - Cloudflare R2 endpoint URL
- `R2_ACCESS_KEY_ID` - R2 access key
- `R2_SECRET_ACCESS_KEY` - R2 secret key
- `R2_BUCKET_NAME` - R2 bucket name (e.g., `rawdrive-prod`)

### Step 3: Apply to Cluster

```bash
# Apply the secrets
kubectl apply -f secrets.yaml

# Verify secrets were created
kubectl get secret gallery-service-secrets

# View secret keys (values are base64 encoded)
kubectl describe secret gallery-service-secrets
```

## Environment Variables

### Sensitive (in Secret)

All sensitive credentials go in `secrets.yaml`:
- Database credentials
- Redis credentials
- JWT signing secret
- R2 storage credentials

### Non-Sensitive (in ConfigMap)

All non-sensitive configuration is in `configmap.yaml`:
- Service metadata (name, version, debug mode)
- Pool sizes and connection limits
- Cache TTL values
- Rate limiting settings
- Security policies (PIN/password attempts)

## Deployment

```bash
# Deploy the entire gallery service stack
kubectl apply -k infrastructure/kubernetes/base/gallery-service/

# Check deployment status
kubectl get pods -l app=gallery-service

# Check service
kubectl get svc gallery-service

# View logs
kubectl logs -l app=gallery-service --tail=100 -f
```

## KEDA Autoscaling

The gallery service uses KEDA to automatically scale based on:
- HTTP requests per second (RPS)
- WebSocket connections
- P95 latency

Scaling configuration is in `../keda/gallery-scaledobject.yaml`.

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name>

# Common issues:
# 1. Secrets not created: Create secrets.yaml and apply
# 2. Image not found: Build and push Docker image
# 3. Database unreachable: Check DATABASE_URL in secret
```

### Authentication errors

```bash
# Verify JWT_SECRET matches backend
kubectl get secret gallery-service-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d
kubectl get secret backend-secrets -o jsonpath='{.data.JWT_SECRET}' | base64 -d

# They should be identical
```

### Connection pool exhausted

```bash
# Increase pool size in configmap.yaml
# DB_POOL_MAX_SIZE: "200"  # Increase from 100

# Apply changes
kubectl apply -f configmap.yaml
kubectl rollout restart deployment/gallery-service
```

## Monitoring

```bash
# Check metrics endpoint
kubectl port-forward svc/gallery-service 8004:8000
curl http://localhost:8004/metrics

# View in Grafana
# Metrics are automatically scraped by Prometheus
```
