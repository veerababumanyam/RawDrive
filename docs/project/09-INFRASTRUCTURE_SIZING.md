# Infrastructure Sizing & Scaling Guide

**Last Updated**: January 5, 2026

## Overview

This document provides sizing guidelines for deploying RawDrive at various scales, from a Proof of Concept (POC) to a large Enterprise deployment. Estimates are based on typical usage patterns for professional photographers (high storage, bursty uploads, heavy image processing).

## Sizing Tiers

| Tier | Scale | Concurrent Users | Total Storage | Target Environment |
|------|-------|------------------|---------------|-------------------|
| **POC / Dev** | 1-5 Users | < 5 | < 1TB | Local Docker / Small VPS |
| **Small Team** | 5-50 Users | 10+ | 1-10TB | Single High-Perf VPS / Small K8s |
| **Medium Business** | 50-500 Users | 100+ | 10-100TB | Kubernetes Cluster (Managed) |
| **Enterprise** | 500+ Users | 500+ | > 100TB | Regulated Multi-Region K8s |

---

## Component Sizing Guidelines

### 1. Compute & Memory (Kubernetes Nodes / VPS)

| Service Component | POC / Dev Resources | Small Team Resources | Medium Business Resources | Notes |
|-------------------|---------------------|----------------------|---------------------------|-------|
| **Frontend (React)** | 0.5 vCPU / 512MB RAM | 1 vCPU / 1GB RAM | 2x Replicas (1 vCPU / 2GB) | Serves static assets + SSR if enabled. |
| **API Backend** | 1 vCPU / 1GB RAM | 2 vCPU / 4GB RAM | 3x Replicas (2 vCPU / 4GB) | FastAPI is CPU bound during heavy serialization. |
| **Background Workers** | 1 vCPU / 1GB RAM | 2 vCPU / 4GB RAM | 5x Replicas (2 vCPU / 8GB) | **Critical Node**: Handles image resize/AI. High CPU usage. |
| **AI Service (Core)** | Optional | 1x GPU Node (T4) | 3x GPU Nodes (L4/A10) | **Mandatory for AI-Native Features** (Face/Object Detection). |

### 2. Database (PostgreSQL & Vector)

*   **Storage**: SSD NVMe is **mandatory**.
*   **Extensions**: `pgvector` is **REQUIRED** for semantic search and AI features.
*   **Vector Sizing**: Approx 2KB per photo for embeddings (Clip/ResNet).
    *   1M Photos = ~2GB Vector Index (RAM resident for speed).

| Tier | vCPU | RAM | Storage | Connections |
|------|------|-----|---------|-------------|
| **POC** | 2 | 4GB | 50GB | 50 |
| **Small** | 4 | 8GB | 200GB | 200 (Use PGBouncer) |
| **Medium** | 8 | 32GB | 1TB+ | 500 (Use PGBouncer) |

### 3. Caching & Message Queue (Redis)

*   **Usage**: Session management, BullMQ job queues, API caching.
*   **Configuration**: Persistence (AOF) enabled for reliability.

| Tier | vCPU | RAM | Mode |
|------|------|-----|------|
| **POC** | 1 | 1GB | Standalone |
| **Small** | 2 | 4GB | Standalone |
| **Medium** | 4 | 16GB | Cluster / High-Availability |

### 4. Object Storage (S3 / R2 / Minio)

*   **RawDrive recommends Cloudflare R2** for zero egress fees.
*   **Estimation Strategy**:
    *   Average Raw Photo: 40MB
    *   Average Processed JPG: 5MB
    *   Thumbnails/Derivatives: ~2MB per photo

| Usage Profile | 10k Photos | 100k Photos | 1M Photos |
|---------------|------------|-------------|-----------|
| **Storage Needed** | ~470 GB | ~4.7 TB | ~47 TB |

---

## Storage & Bandwidth Estimation Variables

Use these variables to calculate your specific infrastructure costs.

*   **Average Upload Size**: 50MB per file (Raw + High-Res JPG).
*   **Derivative Expansion**: +20% storage overhead for generated thumbnails and web-optimized versions.
*   **Database Growth**: ~1KB metadata record per photo.
    *   *Example*: 1 Million photos = ~1GB database size just for photo records (excluding user/analytics data).

## Deployment Recommendations

### "Best Open Source" Budget Stack (Small Team)
Runs comfortably on a single robust dedicated server (e.g., Hetzner AX series) to minimize costs while maintaining control.

*   **Hardware**: AMD Ryzen 9, 64GB RAM, 2x 1TB NVMe (RAID 1).
*   **Software**:
    *   **Orchestration**: Docker Compose or K3s.
    *   **Reverse Proxy**: Caddy (Auto HTTPS).
    *   **Database**: Native Postgres on host (for NVMe speed).
    *   **Storage**: Minio (local) or R2 (cloud backup).

### High Availability Stack (Medium/Enterprise)
Designed for uptimes >99.9% and burst scaling.

*   **Orchestration**: Managed Kubernetes (GKE / EKS / DigitalOcean K8s).
*   **Database**: Managed PostgreSQL (AWS RDS / Google Cloud SQL).
*   **Storage**: Cloudflare R2 (Primary) + AWS S3 Glacier (Cold Backup).
*   **CDN**: Cloudflare Enterprise.

---

## Scalability Bottlenecks

1.  **Image Processing**: The `background-worker` process is the most resource-intensive. Scale this horizontally based on Queue Depth metrics from Redis.
2.  **Vector Search Latency**: As the library grows >1M photos, `pgvector` index build times and search latency increase. Mitigate by increasing RAM to keep the HNSW index in memory.
3.  **Database IOPS**: Heavy write loads during bulk ingestion. Ensure database is on high-IOPS storage.
3.  **Bandwidth**: If self-hosting standard S3 compatible storage, egress fees can effectively double infrastructure costs. **Always use Cloudflare R2 or Wasabi for active hot storage.**
