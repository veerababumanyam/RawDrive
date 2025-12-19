# Scalability Analysis: Processing Architecture

## Current State: ⚠️ **SYNCHRONOUS PROCESSING** (Not Scalable)

### Problem

**All processing happens synchronously during the upload commit request:**

```python
# backend/src/app/services/upload_service.py:commit_upload()
async def commit_upload(...):
    # 1. Verify checksum ✅ (fast)
    # 2. Generate thumbnail ❌ (SLOW - blocks request)
    # 3. Generate preview ❌ (SLOW - blocks request)
    # 4. Encrypt all variants ❌ (SLOW - blocks request)
    # 5. Upload to R2 ❌ (SLOW - blocks request)
    # 6. Return response
```

**Impact for 20k-100k users:**
- ❌ API workers blocked for 5-30 seconds per upload
- ❌ Request timeouts on large files
- ❌ Poor user experience (slow uploads)
- ❌ Cannot scale horizontally (CPU-bound processing)
- ❌ Database connection pool exhaustion
- ❌ Memory spikes during processing

### Current Processing Flow

```
User Upload → API Endpoint → Synchronous Processing → Response
                              ├─ Thumbnail generation (2-5s)
                              ├─ Preview generation (3-10s)
                              ├─ Encryption (1-3s)
                              └─ R2 upload (2-5s)
                              Total: 8-23 seconds blocking API worker
```

## Required State: ✅ **ASYNCHRONOUS PROCESSING** (Scalable)

### Solution: Background Job Queue

**Processing should happen asynchronously:**

```python
# Fast commit (returns immediately)
async def commit_upload(...):
    # 1. Verify checksum ✅
    # 2. Store original to R2 ✅
    # 3. Create asset record (status='processing') ✅
    # 4. Enqueue background job ✅
    # 5. Return immediately ✅ (< 1 second)

# Background worker processes
async def process_asset_job(asset_id):
    # 1. Generate thumbnail
    # 2. Generate preview
    # 3. Encrypt variants
    # 4. Upload to R2
    # 5. Update asset status='available'
```

### Scalable Processing Flow

```
User Upload → API Endpoint → Fast Commit (<1s) → Response
                              └─ Enqueue Job → Background Worker Pool
                                               ├─ Worker 1: Process asset A
                                               ├─ Worker 2: Process asset B
                                               ├─ Worker 3: Process asset C
                                               └─ ... (scales horizontally)
```

## Architecture Recommendations

### 1. Use Existing Task Queue System

**You already have `TaskQueueService`** (`backend/src/app/services/task_queue.py`):
- ✅ Redis-backed queue
- ✅ Retry logic with exponential backoff
- ✅ Priority support
- ✅ Worker pool with concurrency control

**Missing**: Image processing handlers registered to the queue.

### 2. Refactor Upload Service

**Current** (`upload_service.py:commit_upload`):
```python
# ❌ Synchronous processing
thumbnail_data = image_processing_service.generate_thumbnail(...)
preview_data = image_processing_service.generate_preview(...)
encrypted_original = encryption_service.encrypt_file(...)
# ... blocks for 10-20 seconds
```

**Should be**:
```python
# ✅ Fast commit
async def commit_upload(...):
    # Store original only
    await storage_service.upload_encrypted_file(original_data)
    
    # Create asset with status='processing'
    asset_id = await create_asset(..., status='processing')
    
    # Enqueue background job
    await task_queue.enqueue(
        'asset.process',
        {'asset_id': asset_id, 'workspace_id': workspace_id},
        priority=TaskPriority.HIGH
    )
    
    return {'asset_id': asset_id, 'status': 'processing'}
```

### 3. Create Background Worker Handlers

**New file**: `backend/src/app/services/asset_processing_worker.py`

```python
from app.services.task_queue import register_handler, TaskHandler
from app.services.image_processing_service import ImageProcessingService
from app.services.raw_processing_service import RawProcessingService
from app.services.encryption_service import EncryptionService
from app.services.r2_storage_service import R2StorageService

@register_handler('asset.process')
async def process_asset_handler(payload: dict) -> dict:
    """Background worker to process asset variants."""
    asset_id = payload['asset_id']
    workspace_id = payload['workspace_id']
    
    # 1. Fetch original from R2
    original_data = await storage_service.download_encrypted_file(...)
    
    # 2. Decrypt
    decrypted_data = await encryption_service.decrypt_file(...)
    
    # 3. Generate variants
    thumbnail_data = image_processing_service.generate_thumbnail(...)
    preview_data = image_processing_service.generate_preview(...)
    
    # 4. Encrypt variants
    encrypted_thumbnail = await encryption_service.encrypt_file(...)
    encrypted_preview = await encryption_service.encrypt_file(...)
    
    # 5. Upload variants to R2
    await storage_service.upload_encrypted_file(..., encrypted_thumbnail)
    await storage_service.upload_encrypted_file(..., encrypted_preview)
    
    # 6. Update asset status
    await update_asset_status(asset_id, 'available')
    
    return {'asset_id': asset_id, 'status': 'completed'}
```

### 4. Worker Pool Scaling

**Current**: 5 concurrent workers (`main.py:start_worker(concurrency=5)`)

**For 20k-100k users, recommend**:
- **Dedicated worker instances** (separate from API servers)
- **Horizontal scaling**: 10-50 workers per instance
- **Auto-scaling**: Scale workers based on queue depth
- **Priority queues**: Separate queues for thumbnails vs. full processing

### 5. RAW Processing Optimization

**Current**: RAW-to-JPEG conversion happens synchronously in `stream_media()` endpoint.

**Problem**: Every RAW preview request blocks API worker for 5-15 seconds.

**Solution**: 
- Pre-generate JPEG previews during background processing
- Store as `preview` variant (JPEG instead of WebP for RAW)
- Stream pre-generated JPEG (fast, no processing)

## Scalability Metrics

### Current Architecture (Synchronous)

| Metric | Value | Impact |
|--------|-------|--------|
| API worker blocked per upload | 8-23 seconds | ❌ Low throughput |
| Max concurrent uploads | ~5-10 (before timeout) | ❌ Cannot scale |
| Request timeout risk | High (30s+) | ❌ Poor UX |
| Horizontal scaling | Limited (CPU-bound) | ❌ Expensive |

### Recommended Architecture (Asynchronous)

| Metric | Value | Impact |
|--------|-------|--------|
| API worker blocked per upload | <1 second | ✅ High throughput |
| Max concurrent uploads | 1000+ (limited by DB) | ✅ Scales horizontally |
| Request timeout risk | None | ✅ Fast response |
| Horizontal scaling | Excellent (stateless workers) | ✅ Cost-effective |

## Implementation Priority

### Phase 1: Critical (Immediate)
1. ✅ Refactor `commit_upload()` to be fast (<1s)
2. ✅ Create `asset.process` background job handler
3. ✅ Register handler with task queue
4. ✅ Test with small batch

### Phase 2: Optimization (Week 1)
1. ✅ Pre-generate RAW JPEG previews
2. ✅ Add worker pool monitoring
3. ✅ Implement retry logic for failed processing
4. ✅ Add processing status webhooks/notifications

### Phase 3: Scale (Week 2-4)
1. ✅ Separate worker instances from API
2. ✅ Implement auto-scaling based on queue depth
3. ✅ Add priority queues (thumbnails vs. full processing)
4. ✅ Implement rate limiting per workspace

## Cost Analysis

### Current (Synchronous)
- **API instances**: Need high CPU (expensive)
- **Scaling**: Vertical only (limited)
- **Cost**: ~$500-2000/month for 20k users

### Recommended (Asynchronous)
- **API instances**: Low CPU (cheap)
- **Worker instances**: High CPU (cheaper than API)
- **Scaling**: Horizontal (cost-effective)
- **Cost**: ~$200-800/month for 20k users

## Conclusion

**Current architecture will NOT scale to 20k-100k users.**

**Action Required**: Refactor to asynchronous processing using existing `TaskQueueService`.

**Timeline**: 1-2 weeks for Phase 1 (critical), 2-4 weeks for full optimization.

