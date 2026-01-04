# Face Detection Worker - Troubleshooting Guide

> **Last Updated:** January 2026
> **Service:** `rawdrive-face-worker`
> **Port:** 8001 (internal health check)

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Common Issues & Solutions](#common-issues--solutions)
3. [Diagnostic Commands](#diagnostic-commands)
4. [Configuration Reference](#configuration-reference)
5. [Recovery Procedures](#recovery-procedures)
6. [Performance Tuning](#performance-tuning)

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Backend API   │────▶│  PostgreSQL DB   │◀────│  Face Worker    │
│   (port 8000)   │     │  (port 5432)     │     │  (port 8001)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │                       │                        ▼
        │                       │               ┌─────────────────┐
        │                       │               │  Cloud Vision   │
        │                       │               │  (Google API)   │
        │                       │               └─────────────────┘
        │                       │                        │
        │                       │                        ▼
        │                       │               ┌─────────────────┐
        │                       │               │  ONNX Runtime   │
        │                       │               │  (Embeddings)   │
        │                       │               └─────────────────┘
        ▼                       ▼                        │
┌─────────────────┐     ┌──────────────────┐            │
│     Redis       │◀────│  face_detection  │◀───────────┘
│   (port 6379)   │     │     _jobs        │
└─────────────────┘     └──────────────────┘
```

### Job Flow

1. **Backend API** creates a `face_detection_jobs` record with status `pending`
2. **Face Worker** polls for pending jobs (every 5 seconds)
3. Worker claims job (sets status to `processing`)
4. Worker downloads photo from R2, decrypts it
5. **Cloud Vision API** detects face bounding boxes
6. **ONNX Runtime** generates 512-dimensional embeddings
7. **Face Cluster Service** groups similar faces
8. Worker creates `faces` and `face_groups` records
9. Worker generates face thumbnails
10. Job marked as `completed`

---

## Common Issues & Solutions

### 1. OOM (Out of Memory) Kills

**Symptoms:**
- Jobs stuck in `processing` status
- Container restarts unexpectedly
- Docker events show `oom` events

**Root Cause:**
ONNX face recognition models require ~500MB each. With high concurrent jobs, peak memory exceeds container limits.

**Diagnosis:**
```bash
# Check for OOM events
docker events --since 1h --filter 'container=rawdrive-face-worker' --filter 'event=oom'

# Check current memory usage
docker stats rawdrive-face-worker --no-stream

# Check container restarts
docker inspect rawdrive-face-worker --format '{{.RestartCount}}'
```

**Solution:**
1. Reduce `CONCURRENT_JOBS` in `face_detection_worker.py`:
   ```python
   CONCURRENT_JOBS = 2  # Safe for 2GB memory limit
   ```

2. Increase memory limit in `docker-compose.yml`:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2G  # Minimum for 2 concurrent jobs
   ```

**Memory Requirements:**
| Concurrent Jobs | Minimum Memory |
|-----------------|----------------|
| 1               | 1GB            |
| 2               | 2GB            |
| 3               | 2.5GB          |
| 5               | 4GB            |

---

### 2. Jobs Stuck in "Processing" Status

**Symptoms:**
- People panel shows "Scanning X photos" indefinitely
- Jobs have `processing` status for > 3 minutes
- No new face groups appearing

**Root Cause:**
- Worker crashed (OOM, exception) while processing
- Container restarted mid-job
- Database connection lost during processing

**Diagnosis:**
```bash
# Check stuck jobs
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT id, status, started_at, NOW() - started_at as duration
   FROM face_detection_jobs
   WHERE status = 'processing'
   ORDER BY started_at;"

# Check worker logs for errors
docker logs rawdrive-face-worker 2>&1 | grep -i 'error\|exception\|fail'
```

**Solution:**
```bash
# Manual reset of stuck jobs
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "UPDATE face_detection_jobs
   SET status = 'pending', started_at = NULL, error_message = NULL
   WHERE status = 'processing';"

# Or wait for automatic recovery (STALE_JOB_TIMEOUT_MINUTES = 3)
```

---

### 3. "Decryption Failed" Errors

**Symptoms:**
- Jobs fail with "Failed to download/decrypt photo: Decryption failed"
- All jobs failing, not just specific photos

**Root Cause:**
`ENCRYPTION_MASTER_KEY` environment variable not passed to face-worker container.

**Diagnosis:**
```bash
# Check if encryption key is set in container
docker exec rawdrive-face-worker env | grep ENCRYPTION

# Should output something like:
# ENCRYPTION_MASTER_KEY=<64-hex-chars>
```

**Solution:**
```bash
# Restart with explicit env file
cd /opt/RawDrive/infrastructure/docker
docker compose --env-file ../../.env up -d face-worker --force-recreate
```

---

### 4. Cloud Vision API Errors

**Symptoms:**
- Jobs fail with "Cloud Vision API error"
- 403 Forbidden or 401 Unauthorized errors

**Root Cause:**
- Google Cloud credentials not mounted
- Service account lacks Vision API permissions
- API quota exceeded

**Diagnosis:**
```bash
# Check if credentials file is mounted
docker exec rawdrive-face-worker ls -la /run/secrets/gcp-credentials.json

# Check credential file validity
docker exec rawdrive-face-worker cat /run/secrets/gcp-credentials.json | head -5
```

**Solution:**
1. Ensure `GOOGLE_APPLICATION_CREDENTIALS_FILE` is set in `.env`
2. Verify service account has `roles/vision.user` permission
3. Check API quota in Google Cloud Console

---

### 5. No Faces Detected (False Negatives)

**Symptoms:**
- Jobs complete successfully but 0 faces detected
- Photos clearly contain faces

**Root Cause:**
- Image too small or low quality
- Faces too small in frame (< 5% of image)
- Non-frontal faces (extreme angles)

**Diagnosis:**
```bash
# Check completed jobs with 0 faces
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT id, faces_detected, provider_used
   FROM face_detection_jobs
   WHERE status = 'completed' AND faces_detected = 0;"
```

**Solution:**
- This is expected behavior for some images
- Cloud Vision has minimum face size requirements
- Consider adjusting `min_detection_confidence` if available

---

### 6. Database Connection Errors

**Symptoms:**
- "Connection refused" or "too many connections" errors
- Worker fails to start

**Root Cause:**
- PostgreSQL not ready
- Connection pool exhausted
- Network issues between containers

**Diagnosis:**
```bash
# Check PostgreSQL health
docker exec rawdrive-postgres pg_isready -U rawdrive

# Check connection count
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT count(*) FROM pg_stat_activity WHERE datname = 'rawdrive';"
```

**Solution:**
```bash
# Restart face-worker (will reconnect)
docker restart rawdrive-face-worker

# If pool exhausted, restart PostgreSQL (last resort)
docker restart rawdrive-postgres
```

---

## Diagnostic Commands

### Quick Health Check
```bash
# All-in-one status check
echo "=== Container Status ===" && \
docker ps --filter name=rawdrive-face-worker --format "Status: {{.Status}}" && \
echo "" && \
echo "=== Memory Usage ===" && \
docker stats rawdrive-face-worker --no-stream --format "{{.MemUsage}} ({{.MemPerc}})" && \
echo "" && \
echo "=== Job Status ===" && \
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT status, COUNT(*) FROM face_detection_jobs GROUP BY status;"
```

### Job Queue Status
```bash
# Pending jobs
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT COUNT(*) as pending FROM face_detection_jobs WHERE status = 'pending';"

# Jobs by status with timing
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT status, COUNT(*),
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_sec
   FROM face_detection_jobs
   GROUP BY status;"
```

### Worker Logs
```bash
# Recent logs
docker logs rawdrive-face-worker --tail 50

# Errors only
docker logs rawdrive-face-worker 2>&1 | grep -i 'error\|exception\|fail' | tail -20

# Follow logs in real-time
docker logs rawdrive-face-worker -f
```

### Face Data Statistics
```bash
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "SELECT
     (SELECT COUNT(*) FROM faces) as total_faces,
     (SELECT COUNT(*) FROM face_groups) as total_groups,
     (SELECT COUNT(*) FROM face_groups WHERE name IS NOT NULL) as named_groups;"
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Required | PostgreSQL connection string |
| `REDIS_URL` | Required | Redis connection string |
| `ENCRYPTION_MASTER_KEY` | Required | 64-char hex key for photo decryption |
| `GOOGLE_APPLICATION_CREDENTIALS` | Required | Path to GCP credentials JSON |
| `DB_POOL_MIN_SIZE` | 1 | Minimum DB connections |
| `DB_POOL_MAX_SIZE` | 5 | Maximum DB connections |

### Worker Constants (face_detection_worker.py)

| Constant | Default | Description |
|----------|---------|-------------|
| `CONCURRENT_JOBS` | 2 | Max parallel jobs (memory-dependent) |
| `POLLING_INTERVAL_SECONDS` | 5 | How often to check for new jobs |
| `JOB_TIMEOUT_SECONDS` | 120 | Max time per job before timeout |
| `STALE_JOB_TIMEOUT_MINUTES` | 3 | Auto-recovery for stuck jobs |
| `RETRY_DELAY_SECONDS` | 60 | Wait time before retry on failure |
| `MAX_RETRIES` | 3 | Max retry attempts per job |

### Docker Resource Limits (docker-compose.yml)

```yaml
face-worker:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
      reservations:
        cpus: '0.5'
        memory: 512M
```

---

## Recovery Procedures

### Full Worker Recovery
```bash
# 1. Stop the worker
docker stop rawdrive-face-worker

# 2. Reset all stuck jobs
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "UPDATE face_detection_jobs
   SET status = 'pending', started_at = NULL, error_message = NULL
   WHERE status = 'processing';"

# 3. Restart with fresh state
cd /opt/RawDrive/infrastructure/docker
docker compose --env-file ../../.env up -d face-worker --force-recreate

# 4. Monitor recovery
docker logs rawdrive-face-worker -f
```

### Reset Failed Jobs for Retry
```bash
# Reset jobs that failed (will retry up to MAX_RETRIES)
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "UPDATE face_detection_jobs
   SET status = 'pending', started_at = NULL, error_message = NULL, retry_count = 0
   WHERE status = 'failed' AND retry_count < 3;"
```

### Clear All Jobs (Fresh Start)
```bash
# WARNING: This deletes all face detection history
docker exec rawdrive-postgres psql -U rawdrive -d rawdrive -c \
  "TRUNCATE face_detection_jobs CASCADE;"
```

### Rebuild Worker Container
```bash
cd /opt/RawDrive/infrastructure/docker
docker compose build face-worker --no-cache
docker compose --env-file ../../.env up -d face-worker --force-recreate
```

---

## Performance Tuning

### Optimal Settings by Server Specs

| Server RAM | CPU Cores | CONCURRENT_JOBS | Memory Limit |
|------------|-----------|-----------------|--------------|
| 4GB        | 2         | 1               | 1.5GB        |
| 8GB        | 4         | 2               | 2GB          |
| 16GB       | 8         | 4               | 4GB          |
| 32GB       | 16        | 8               | 8GB          |

### Monitoring Queries

```sql
-- Job processing rate (last hour)
SELECT
  date_trunc('minute', completed_at) as minute,
  COUNT(*) as jobs_completed
FROM face_detection_jobs
WHERE completed_at > NOW() - INTERVAL '1 hour'
GROUP BY 1
ORDER BY 1;

-- Average processing time by provider
SELECT
  provider_used,
  COUNT(*) as total_jobs,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_seconds,
  AVG(faces_detected) as avg_faces
FROM face_detection_jobs
WHERE status = 'completed'
GROUP BY provider_used;

-- Failed jobs analysis
SELECT
  error_message,
  COUNT(*) as occurrences
FROM face_detection_jobs
WHERE status = 'failed'
GROUP BY error_message
ORDER BY occurrences DESC
LIMIT 10;
```

---

## Related Documentation

- [Backend API Documentation](../TechnicalSpecs/API.md)
- [Docker Compose Configuration](../../infrastructure/docker/docker-compose.yml)
- [Face Detection Service](../../backend/src/app/services/face_detection_service.py)
- [Face Cluster Service](../../backend/src/app/services/face_cluster_service.py)

---

## Changelog

| Date | Change |
|------|--------|
| 2026-01-04 | Reduced CONCURRENT_JOBS from 5 to 2 to prevent OOM |
| 2026-01-04 | Reduced STALE_JOB_TIMEOUT_MINUTES from 10 to 3 for faster recovery |
| 2026-01-04 | Increased memory limit from 1GB to 2GB |
