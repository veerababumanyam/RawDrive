# Kubernetes & Scaling Best Practices

A guide for production-grade scaling and orchestration of RawDrive on K8s.

---

## 1. Cluster Architecture

### Node Pools
*   **General Pool:** Stateless APIs (`gallery-service`, `billing-service`).
*   **Worker Pool:** High CPU/Memory nodes for async workers (`ai-worker`, `upload-worker`). Enable Spot Instances here for cost savings.
*   **Data Pool:** (Optional) NVMe SSD nodes if running stateful sets (Milvus/Redis) on-cluster.

### Namespaces
Isolate resources logically.
*   `rawdrive-prod`: Production workloads.
*   `rawdrive-staging`: Pre-prod testing.
*   `monitoring`: Prometheus/Grafana stack.
*   `ingress`: Traefik/Cert-Manager.

---

## 2. Horizontal Pod Autoscaling (HPA)

### CPU/Memory Scaling
Standard K8s HPA for synchronous APIs.
*   **Metric:** Scale when `averageUtilization > 75%`.
*   **Behavior:** Scale up fast, scale down slow (stabilization window).

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: gallery-service
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

---

## 3. Event-Driven Autoscaling (KEDA)

For background workers, CPU usage is a laggy metric. Scale based on **Queue Depth**.

### Setup
Deploy KEDA operator in the cluster.

### ScaledObject
Scale `upload-worker` based on Redis List length or RabbitMQ count.

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: upload-worker-scaler
spec:
  scaleTargetRef:
    name: upload-worker
  minReplicaCount: 0  # Scale to zero if no jobs!
  maxReplicaCount: 50
  triggers:
  - type: redis
    metadata:
      address: redis:6379
      listName: upload_queue
      listLength: "10" # Target 10 jobs per pod
```

---

## 4. Resilience & Availability

### Pod Disruption Budgets (PDB)
Ensure minimum availability during node upgrades.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: gallery-service
```

### Probes
*   **Liveness:** "Am I dead?" (Restart container).
*   **Readiness:** "Can I take traffic?" (Remove from Load Balancer).
*   **Startup:** "Have I finished booting?" (Protect slow starters like AI models).

---

## 5. Configuration Management (Helm)

Don't apply raw YAMLs. Use Helm Charts.

### RawDrive Chart Structure
*   `charts/rawdrive-service`: Generic template for any microservice.
*   `values.yaml`: Default config.
*   `values-prod.yaml`: Production overrides.

```yaml
# values-prod.yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

---

## 6. Storage & State

### StatefulSets
If running Redis/Postgres on K8s (not recommended, prefer Cloud Managed):
*   Use `StatefulSet` for stable network IDs (`redis-0`, `redis-1`).
*   Use `PersistentVolumeClaims` (PVC) with `Retain` policy.

### Secrets
*   **External Secrets Operator:** Sync secrets from AWS Secrets Manager / Azure Key Vault into K8s Secrets. Avoid storing Base64 secrets in Git.
