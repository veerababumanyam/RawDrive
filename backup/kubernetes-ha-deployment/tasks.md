# Implementation Plan

- [ ] 1. Infrastructure Provisioning and Server Setup
  - [ ] 1.1 Provision 5 KVM8 servers from Hostinger
    - Order 5× KVM8 (8 vCPU, 16GB RAM, 400GB NVMe) with Ubuntu 22.04 LTS
    - Configure private networking between all nodes
    - Set up SSH key-based authentication
    - Configure hostnames: node1, node2, node3, node4, node5
    - Nodes 1-3: Control Plane + Worker (stacked topology)
    - Nodes 4-5: Dedicated database workers
    - _Requirements: 1.1, 2.1_

  - [ ] 1.2 OS-level hardening on all nodes
    - Update all packages: `apt update && apt upgrade -y`
    - Configure automatic security updates (unattended-upgrades)
    - Disable root SSH login, enforce key-based auth only
    - Configure SSH hardening (disable password auth, change default port)
    - Install and configure fail2ban for SSH brute-force protection
    - Remove unnecessary packages and services
    - Configure NTP/chrony for time synchronization
    - Set secure file permissions on sensitive directories
    - _Requirements: 7.1, 7.3_

  - [ ] 1.3 Configure HAProxy for control plane load balancing
    - Install HAProxy on a dedicated server or use kube-vip
    - Configure health checks for API server endpoints
    - Set up virtual IP for cluster endpoint
    - _Requirements: 2.4_

  - [ ] 1.4 Performance tuning - Kernel and system optimization
    - Configure kernel parameters for high-performance networking:
      - `net.core.somaxconn=65535`
      - `net.ipv4.tcp_max_syn_backlog=65535`
      - `net.core.netdev_max_backlog=65535`
      - `net.ipv4.tcp_tw_reuse=1`
      - `net.ipv4.ip_local_port_range=1024 65535`
    - Configure memory management:
      - `vm.swappiness=10`
      - `vm.max_map_count=262144` (for Elasticsearch/PostgreSQL)
    - Configure file descriptor limits:
      - `fs.file-max=2097152`
      - `fs.inotify.max_user_watches=524288`
    - Set ulimits for containers (nofile, nproc)
    - Enable TCP BBR congestion control for better throughput
    - _Requirements: 1.1, 8.5_

  - [ ] 1.5 Install Kubernetes prerequisites on all nodes
    - Disable swap on all nodes permanently
    - Load required kernel modules (overlay, br_netfilter)
    - Configure sysctl parameters for Kubernetes networking
    - Install containerd runtime with optimized configuration
    - Configure containerd for systemd cgroup driver
    - Install kubeadm, kubelet, kubectl v1.29
    - Pin Kubernetes package versions to prevent accidental upgrades
    - _Requirements: 1.1_

- [ ] 2. Kubernetes Cluster Bootstrap
  - [ ] 2.1 Initialize first control plane node with kubeadm
    - Create kubeadm configuration file with HA settings
    - Initialize cluster with --upload-certs flag
    - Save join tokens and certificate keys
    - Configure kubectl for cluster access
    - _Requirements: 2.1, 2.3_

  - [ ] 2.2 Join additional control plane nodes
    - Join cp2 and cp3 as control plane nodes
    - Verify etcd cluster health (3 members)
    - Verify API server load balancing
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 2.3 Join database worker nodes to the cluster
    - Join node4 and node5 as worker-only nodes
    - Verify node status and labels
    - Apply node labels: `node-role=database` for nodes 4-5
    - Apply node labels: `node-role=app` for nodes 1-3
    - Configure taints for database nodes to prevent app scheduling
    - _Requirements: 1.1_

  - [ ] 2.4 Install Calico CNI for pod networking
    - Deploy Calico operator and custom resources
    - Configure pod CIDR (10.244.0.0/16)
    - Verify pod-to-pod networking
    - _Requirements: 4.1_

  - [ ] 2.5 Kubernetes control plane hardening
    - Enable etcd encryption at rest for secrets:
      - Create EncryptionConfiguration with AES-CBC or AES-GCM
      - Configure kube-apiserver with `--encryption-provider-config`
    - Configure API server security:
      - Enable audit logging (`--audit-log-path`, `--audit-policy-file`)
      - Set `--anonymous-auth=false`
      - Configure admission controllers (PodSecurity, NodeRestriction)
    - Configure kubelet security on all nodes:
      - Set `--anonymous-auth=false`
      - Set `--authorization-mode=Webhook`
      - Enable `--protect-kernel-defaults=true`
    - Rotate certificates automatically (kubeadm default)
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ] 2.6 Kubernetes performance tuning
    - Configure kube-apiserver performance:
      - `--max-requests-inflight=400`
      - `--max-mutating-requests-inflight=200`
    - Configure etcd performance:
      - `--quota-backend-bytes=8589934592` (8GB)
      - Enable auto-compaction
    - Configure kubelet performance:
      - `--max-pods=110`
      - `--kube-reserved` and `--system-reserved` for resource management
      - `--eviction-hard` thresholds for node stability
    - Configure kube-proxy for IPVS mode (better performance than iptables)
    - _Requirements: 8.5, 1.1_

  - [ ] 2.7 Write property test for control plane quorum
    - **Property 1: Control Plane Quorum Maintenance**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [ ] 3. Storage Layer Setup
  - [ ] 3.1 Install Longhorn distributed storage
    - Deploy Longhorn via Helm chart
    - Configure default StorageClass
    - Set replication factor to 2 for HA
    - _Requirements: 5.1_

  - [ ] 3.2 Configure storage classes for different workloads
    - Create StorageClass for PostgreSQL (high IOPS)
    - Create StorageClass for Redis (fast storage)
    - Create StorageClass for backups (standard)
    - _Requirements: 5.1, 5.3, 5.4_

  - [ ] 3.3 Write property test for persistent volume durability
    - **Property 4: Persistent Volume Data Durability**
    - **Validates: Requirements 5.1, 5.3, 5.4**

- [ ] 4. Checkpoint - Verify cluster foundation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Ingress and TLS Configuration
  - [ ] 5.1 Install Nginx Ingress Controller
    - Deploy Nginx Ingress via Helm
    - Configure as DaemonSet on worker nodes
    - Set up external traffic policy
    - _Requirements: 4.2_

  - [ ] 5.2 Install cert-manager for automated TLS
    - Deploy cert-manager via Helm
    - Create ClusterIssuer for Let's Encrypt
    - Configure DNS challenge or HTTP challenge
    - _Requirements: 4.3_

  - [ ] 5.3 Configure Ingress rate limiting
    - Add rate limiting annotations to Ingress
    - Configure 100 req/min default limit
    - Set stricter limits for auth endpoints
    - _Requirements: 4.5_

  - [ ] 5.4 Write property test for TLS certificate validity
    - **Property 5: Ingress TLS Certificate Validity**
    - **Validates: Requirements 4.3**

- [ ] 6. Database Layer Deployment
  - [ ] 6.1 Create RawDrive namespace and secrets
    - Create namespace with labels
    - Create secrets for database credentials
    - Create secrets for external API keys (R2, AI inference service, Stripe)
    - _Requirements: 7.2_

  - [ ] 6.2 Deploy PostgreSQL StatefulSet
    - Create StatefulSet with 50GB PVC
    - Configure resource requests and limits
    - Set up liveness and readiness probes
    - Configure backup sidecar container
    - _Requirements: 3.3, 5.3_

  - [ ] 6.3 Deploy Redis Sentinel for HA caching
    - Deploy Redis with Sentinel configuration
    - Configure 3 Sentinel replicas
    - Set up 10GB persistent storage
    - _Requirements: 3.4, 5.4_

  - [ ] 6.4 Configure fully automated PostgreSQL backups to Cloudflare R2
    - Deploy pgBackRest as sidecar container (runs continuously, zero manual effort)
    - Configure automatic WAL archiving to R2 (continuous, every 5 minutes)
    - Create Kubernetes CronJob for daily full backups (runs automatically at 2 AM)
    - Create Kubernetes CronJob for 6-hourly incremental backups (runs automatically)
    - Configure automatic retention cleanup (7-day full, 14-day incremental)
    - Enable Point-in-Time Recovery (PITR) capability
    - Test restore procedure from R2
    - **All backups run automatically after deployment - zero manual effort**
    - _Requirements: 5.5, 2.5, 9.4_

- [ ] 7. Application Deployment
  - [ ] 7.1 Create Helm chart for RawDrive application
    - Create Chart.yaml and values.yaml
    - Create templates for all Kubernetes resources
    - Configure environment-specific values files
    - _Requirements: 10.1_

  - [ ] 7.2 Deploy Backend API with HPA
    - Create Deployment with 3 replicas
    - Configure pod anti-affinity rules
    - Set up HPA with 70% CPU target
    - Configure resource requests (500m CPU, 512Mi memory)
    - _Requirements: 3.1, 3.6, 8.1, 8.2, 8.5_

  - [ ] 7.3 Deploy Frontend Nginx pods
    - Create Deployment with 3 replicas
    - Configure static asset serving
    - Set up caching headers
    - _Requirements: 3.2_

  - [ ] 7.4 Deploy BullMQ worker pods
    - Create Deployment for background workers
    - Configure resource limits
    - Set up job queue connections
    - _Requirements: 3.5_

  - [ ] 7.5 Configure Ingress for application routing
    - Create Ingress resource with TLS
    - Configure path-based routing
    - Set up rate limiting annotations
    - _Requirements: 4.2, 4.3, 4.5_

  - [ ] 7.6 Write property test for pod anti-affinity distribution
    - **Property 2: Pod Distribution Anti-Affinity**
    - **Validates: Requirements 3.1, 3.6**

  - [ ] 7.7 Write property test for HPA scaling response
    - **Property 3: Horizontal Pod Autoscaler Response**
    - **Validates: Requirements 8.1, 8.2**

- [ ] 8. Checkpoint - Verify application deployment
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Security and DDoS Protection
  - [ ] 9.1 Configure Cloudflare as reverse proxy with DDoS protection
    - Enable Cloudflare proxy (orange cloud) for domain
    - Configure SSL/TLS to Full (Strict) mode
    - Enable automatic DDoS mitigation
    - Set up rate limiting rules (100 req/min per IP)
    - Configure firewall rules for bad bots
    - Enable Under Attack Mode trigger
    - _Requirements: 7.3, 4.5_

  - [ ] 9.2 Configure UFW firewall on all nodes
    - Allow only Cloudflare IPs for ports 80/443
    - Restrict SSH to specific admin IPs
    - Allow internal cluster communication (10.0.0.0/8)
    - Block all other inbound traffic
    - _Requirements: 7.3_

  - [ ] 9.3 Create NetworkPolicies for pod isolation
    - Create policy for backend pods
    - Create policy for database pods
    - Create policy for Redis pods
    - Allow only required traffic paths
    - _Requirements: 7.3_

  - [ ] 9.4 Configure RBAC for service accounts
    - Create service accounts for each component
    - Apply least-privilege roles
    - Configure role bindings
    - _Requirements: 7.1_

  - [ ] 9.5 Enable Pod Security Standards
    - Apply restricted policy to rawdrive namespace
    - Configure security contexts for all pods
    - Disable privilege escalation
    - Run containers as non-root
    - _Requirements: 7.1, 7.3_

  - [ ] 9.6 Configure Nginx Ingress security
    - Add security headers (CSP, HSTS, X-Frame-Options)
    - Configure rate limiting annotations
    - Enable ModSecurity WAF (optional)
    - Set up stricter limits for auth endpoints
    - _Requirements: 4.5, 7.3_

  - [ ] 9.7 Write property test for network policy isolation
    - **Property 7: Network Policy Isolation**
    - **Validates: Requirements 7.3**

- [ ] 10. Monitoring Stack Deployment
  - [ ] 10.1 Install Prometheus stack via Helm
    - Deploy kube-prometheus-stack
    - Configure 30-day metric retention
    - Set up persistent storage for Prometheus
    - _Requirements: 6.1_

  - [ ] 10.2 Configure Grafana dashboards
    - Import RawDrive application dashboards
    - Configure PostgreSQL dashboard
    - Configure Redis dashboard
    - Configure Kubernetes cluster dashboard
    - _Requirements: 6.2_

  - [ ] 10.3 Install Loki for centralized logging
    - Deploy Loki stack with Promtail
    - Configure log retention
    - Set up log aggregation from all pods
    - _Requirements: 6.3_

  - [ ] 10.4 Configure AlertManager notifications
    - Set up Alertmanager notifications (email and/or webhook)
    - Create alert rules for critical conditions
    - Configure memory utilization alerts (80% threshold)
    - _Requirements: 6.4, 8.3_

  - [ ] 10.5 Deploy node-exporter on all nodes
    - Install node-exporter DaemonSet
    - Configure system metrics collection
    - _Requirements: 6.5_

- [ ] 11. Fully Automated Backup and Disaster Recovery
  - [ ] 11.1 Install Velero for automated secrets and cluster state backup
    - Deploy Velero with AWS plugin (S3-compatible for R2)
    - Configure Cloudflare R2 as backup location
    - Set up credentials for R2 access
    - **GitOps Strategy:** Application manifests recovered from GitHub/Helm, not Velero
    - _Requirements: 9.1_

  - [ ] 11.2 Configure Velero Schedule for automated daily backups
    - Create Velero Schedule CR (runs automatically at 2 AM daily)
    - Include: secrets, configmaps, certificates, PVCs metadata
    - Exclude: pods, deployments, services, ingresses (recreatable from Helm)
    - Configure automatic 30-day retention with TTL
    - **Zero manual effort after deployment**
    - _Requirements: 9.1, 9.4_

  - [ ] 11.3 Configure automated etcd snapshots
    - Create Kubernetes CronJob for etcd snapshots (every 6 hours)
    - Upload encrypted snapshots to R2 automatically
    - Configure automatic 7-day retention cleanup
    - **Zero manual effort after deployment**
    - _Requirements: 2.5, 9.1_

  - [ ] 11.4 Configure backup failure alerting
    - Create AlertManager rules for backup job failures
    - Configure Alertmanager notifications (email/webhook; optional Mattermost/Matrix)
    - Alert if any backup misses scheduled run
    - **Automatic monitoring - no manual checking required**
    - _Requirements: 6.4, 9.1_

  - [ ] 11.5 Test backup and restore procedures
    - Perform test backup
    - Restore to test namespace
    - Verify data integrity
    - Document recovery procedures
    - _Requirements: 9.3_

  - [ ] 11.6 Write property test for backup restoration integrity
    - **Property 6: Backup Restoration Integrity**
    - **Validates: Requirements 9.1, 9.3**

- [ ] 12. CI/CD and GitOps Setup
  - [ ] 12.1 Create GitHub Actions workflow for deployments
    - Configure Docker image build and push
    - Set up Helm chart deployment
    - Configure environment-specific deployments
    - _Requirements: 10.4_

  - [ ] 12.2 Configure container image security scanning
    - Integrate Trivy scanner in GitHub Actions pipeline
    - Scan images for vulnerabilities before push to registry
    - Block deployment if HIGH/CRITICAL vulnerabilities found
    - Generate SBOM (Software Bill of Materials) for each image
    - Configure automated weekly scans of deployed images
    - _Requirements: 7.5_

  - [ ] 12.3 Configure rolling update strategy
    - Set maxSurge and maxUnavailable
    - Configure PodDisruptionBudget
    - Set up automatic rollback on failure
    - _Requirements: 10.2, 10.3_

  - [ ] 12.4 Write property test for rolling update zero downtime
    - **Property 8: Rolling Update Zero Downtime**
    - **Validates: Requirements 10.2**

  - [ ] 12.5 Install ArgoCD for GitOps (optional)
    - Deploy ArgoCD
    - Configure application sync
    - Set up repository access
    - _Requirements: 10.5_

- [ ] 13. Resource Optimization, Quotas, and Performance Testing
  - [ ] 13.1 Configure ResourceQuotas for namespace
    - Set CPU and memory quotas
    - Configure storage quotas
    - Set pod count limits
    - _Requirements: 11.3_

  - [ ] 13.2 Configure LimitRanges for default resources
    - Set default CPU/memory requests
    - Set default CPU/memory limits
    - _Requirements: 8.5_

  - [ ] 13.3 Database performance tuning
    - Configure PostgreSQL performance parameters:
      - `shared_buffers=4GB` (25% of RAM)
      - `effective_cache_size=12GB` (75% of RAM)
      - `work_mem=256MB`
      - `maintenance_work_mem=1GB`
      - `max_connections=200`
      - `wal_buffers=64MB`
    - Configure Redis performance:
      - `maxmemory=4gb`
      - `maxmemory-policy=allkeys-lru`
      - Enable `tcp-keepalive`
    - _Requirements: 3.3, 3.4, 8.5_

  - [ ] 13.4 Load testing and capacity validation
    - Install k6 or Locust for load testing
    - Create load test scenarios for:
      - Photo upload (concurrent uploads)
      - Gallery browsing (read-heavy)
      - API endpoints (mixed workload)
    - Run baseline load test (100 concurrent users)
    - Validate HPA scaling triggers correctly
    - Document performance baselines and thresholds
    - _Requirements: 8.1, 8.2, 1.1_

- [ ] 14. Documentation and Runbooks
  - [ ] 14.1 Create cluster administration documentation
    - Document node addition procedures
    - Document scaling procedures
    - Create troubleshooting guide
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 14.2 Create disaster recovery runbook
    - Document automated backup architecture (all backups run automatically)
    - Document restore procedures for each backup type
    - Document GitOps recovery: `helm upgrade` for app manifests
    - Create DR drill checklist
    - Include: "No manual backup intervention required - all automated"
    - _Requirements: 9.3, 9.5_

- [ ] 15. Final Checkpoint - Complete system verification
  - Ensure all tests pass, ask the user if questions arise.
