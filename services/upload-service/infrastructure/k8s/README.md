# Upload Service Kubernetes Manifests

This directory contains all Kubernetes manifests for deploying the upload-service microservice.

## Files

- **deployment.yaml** - Pod specification with resource limits and health checks
- **service.yaml** - ClusterIP service for load balancing
- **configmap.yaml** - Non-sensitive configuration (environment variables)
- **secret.yaml** - Sensitive credentials (template - populate from 1Password)
- **ingressroute.yaml** - Traefik v3 routing rules for external access
- **kustomization.yaml** - Kustomize aggregation of all resources

## Deployment

### Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured
- Traefik v3 installed
- KEDA installed (for autoscaling)

### Deploy to Kubernetes

```bash
# Deploy upload-service
kubectl apply -k services/upload-service/infrastructure/k8s/

# Verify deployment
kubectl get pods -l app=upload-service
kubectl get svc upload-service

# Check logs
kubectl logs -f deployment/upload-service
```

### Deploy KEDA Autoscaling

```bash
# Deploy KEDA ScaledObject
kubectl apply -k services/upload-service/infrastructure/keda/

# Verify autoscaling
kubectl get scaledobject upload-service-scaling
kubectl get hpa
```

## Configuration

### Environment Variables (ConfigMap)

See `configmap.yaml` for all environment variables.

### Secrets

Secrets are stored in 1Password. To create the secret:

1. Get values from 1Password
2. Create secret from template: `kubectl create secret generic upload-service-secret --from-literal=DATABASE_URL=... --from-literal=REDIS_URL=...`

### Resource Limits

- **Requests**: 100m CPU, 256Mi memory
- **Limits**: 500m CPU, 512Mi memory

### Autoscaling

- **Min replicas**: 2
- **Max replicas**: 50
- **Triggers**:
  - Kafka lag > 100 messages
  - Concurrent uploads > 50
  - Request rate > 1000/min

## Monitoring

Health checks:
- **Liveness**: `GET /health/live` (no dependencies)
- **Readiness**: `GET /health/ready` (checks DB + Redis)
- **Metrics**: `GET /metrics` (Prometheus format)

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Check events
kubectl get events --sort-by='.lastTimestamp'
```

### Service not accessible

```bash
# Check service endpoints
kubectl get endpoints upload-service

# Check IngressRoute
kubectl get ingressroute upload-service-ingress
```

### Autoscaling not working

```bash
# Check KEDA status
kubectl get scaledobject upload-service-scaling -o yaml

# Check metrics
kubectl get --raw "/apis/external.metrics.k8s.io/v1beta1"
```

## Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/upload-service

# Check rollout status
kubectl rollout status deployment/upload-service
```

## Related Documentation

- [DEPLOYMENT.md](../../docs/DEPLOYMENT.md) - Comprehensive deployment guide
- [TROUBLESHOOTING.md](../../docs/TROUBLESHOOTING.md) - Common issues and fixes
