# Face Detection Setup Guide

## Overview

The RawDrive face detection feature uses Google Cloud Vision API as the primary provider with fallback to Gemini and local MediaPipe-based detection. This guide will help you set up and troubleshoot the feature.

## Architecture

```
Frontend (React)
  ↓ Click "Find People"
  ↓ Opens PeoplePanel
  ↓ Click "Scan" button
  ↓ POST /api/v1/workspaces/{id}/galleries/{id}/scan-faces
  
Backend API
  ↓ Creates face_detection_jobs for all photos
  ↓ Jobs stored in PostgreSQL queue
  
Face Worker (Separate Container)
  ↓ Polls face_detection_jobs table every 5 seconds
  ↓ Downloads & decrypts photo from R2
  ↓ Calls AI Provider (Cloud Vision → Gemini → Local)
  ↓ Stores faces + embeddings in PostgreSQL (pgvector)
  ↓ Generates face thumbnails → uploads to R2
  ↓ Auto-clusters faces into face_groups
```

## Prerequisites

1. **PostgreSQL with pgvector extension** ✅ (Already enabled in your database)
2. **Face-worker container running** ✅ (Running as `rawdrive-face-worker`)
3. **Google Cloud Vision API credentials** ⚠️ (MISSING - needs setup)

## Current Status

### ✅ Working Components
- Database tables created (faces, face_groups, face_detection_jobs, ai_provider_settings)
- pgvector extension enabled
- Face-worker container running and healthy
- Backend API endpoints functional
- Frontend UI components complete

### ⚠️ Issues Found
1. **Google Cloud Vision credentials missing** - The credentials directory exists but is empty
2. **One failed job in queue** - Photo decryption error (unrelated to face detection)

## Setup Google Cloud Vision Credentials

### Option 1: Use Existing GCP Service Account (Recommended)

You already have a service account JSON file referenced in docker-compose:
```
docs/docparser-468004-9b82008238af.json
```

However, this directory is currently empty. To fix:

1. **If you have the credentials file elsewhere:**
   ```bash
   # Copy your GCP service account JSON to the expected location
   cp /path/to/your/gcp-credentials.json docs/docparser-468004-9b82008238af.json
   ```

2. **Restart the face-worker container:**
   ```bash
   docker restart rawdrive-face-worker
   ```

### Option 2: Create New Service Account

1. **Go to Google Cloud Console:**
   - Navigate to https://console.cloud.google.com/
   - Select your project (or create a new one)

2. **Enable Cloud Vision API:**
   - Go to "APIs & Services" → "Library"
   - Search for "Cloud Vision API"
   - Click "Enable"

3. **Create Service Account:**
   - Go to "IAM & Admin" → "Service Accounts"
   - Click "Create Service Account"
   - Name: `rawdrive-face-detection`
   - Role: `Cloud Vision AI Service Agent` or `Owner` (for testing)
   - Click "Done"

4. **Generate JSON Key:**
   - Click on the service account you just created
   - Go to "Keys" tab
   - Click "Add Key" → "Create new key"
   - Select "JSON" format
   - Download the JSON file

5. **Install the credentials:**
   ```bash
   # Save to the expected location
   cp ~/Downloads/your-project-xxxx.json docs/docparser-468004-9b82008238af.json
   
   # Restart face-worker
   docker restart rawdrive-face-worker
   ```

### Option 3: Use Environment Variable (Alternative)

If you prefer not to use the default path, you can set an environment variable:

1. **Edit your `.env` file:**
   ```bash
   # Add this line
   GOOGLE_APPLICATION_CREDENTIALS_FILE=path/to/your/credentials.json
   ```

2. **Restart containers:**
   ```bash
   docker-compose -f infrastructure/docker/docker-compose.yml restart face-worker
   ```

## Fallback Providers

If Google Cloud Vision is not available, the system automatically falls back to:

1. **Gemini API** (requires `GEMINI_API_KEY` in `.env`)
2. **Local Provider** (MediaPipe/OpenCV - no configuration needed, but less accurate)

### Setup Gemini Fallback (Optional)

1. **Get Gemini API key:**
   - Go to https://aistudio.google.com/app/apikey
   - Click "Create API Key"

2. **Add to `.env`:**
   ```bash
   GEMINI_API_KEY=your-gemini-api-key-here
   ```

3. **Restart face-worker:**
   ```bash
   docker restart rawdrive-face-worker
   ```

## Testing the Feature

### 1. Upload Photos with Faces

1. Open RawDrive in your browser
2. Navigate to a gallery
3. Upload photos containing people's faces

### 2. Trigger Face Detection

1. Click the **"Find People"** button (purple button with Users icon)
2. In the People Panel that opens, click **"Scan"** button
3. You should see a toast message: "Face detection started for X photos"

### 3. Monitor Progress

**Check worker logs:**
```bash
docker logs rawdrive-face-worker --tail 50 -f
```

You should see logs like:
```
INFO - Processing job: <job_id>
INFO - Detected 3 faces in photo <photo_id>
INFO - Generated thumbnails for face <face_id>
INFO - Face detection completed for photo <photo_id>
```

**Check job status in database:**
```sql
SELECT status, COUNT(*) 
FROM face_detection_jobs 
GROUP BY status;
```

Expected results:
- `pending` - Jobs waiting to be processed
- `processing` - Jobs currently being processed
- `completed` - Successfully processed
- `failed` - Failed (check error_message column)

### 4. View Results

1. In the People Panel, click the **Refresh** button (circular arrow icon)
2. You should see face groups (clusters) appear with thumbnail images
3. Click on a person to see all their photos
4. You can name people, merge duplicates, etc.

## Troubleshooting

### No faces detected after scanning

**Check 1: Worker is processing jobs**
```bash
docker logs rawdrive-face-worker | grep -i "processing\|detected\|completed"
```

**Check 2: Credentials are loaded**
```bash
docker logs rawdrive-face-worker | grep -i "cloud vision\|credentials\|provider"
```

**Check 3: Jobs are being created**
```sql
SELECT * FROM face_detection_jobs ORDER BY created_at DESC LIMIT 5;
```

### Worker shows credential errors

```
ERROR - GOOGLE_CLOUD_VISION_CREDENTIALS environment variable not set
```

**Solution:** Follow "Setup Google Cloud Vision Credentials" section above.

### Jobs stuck in "pending" status

**Check if worker is running:**
```bash
docker ps | grep face-worker
```

**Check worker health:**
```bash
curl http://localhost:8001/health
```

**Restart worker:**
```bash
docker restart rawdrive-face-worker
```

### Jobs failing with decryption errors

```
Failed to download/decrypt photo: Decryption failed for original
```

This indicates an issue with R2 storage or encryption keys, not face detection. Check:
- R2 credentials in `.env`
- `ENCRYPTION_MASTER_KEY` in `.env`
- Photo upload succeeded properly

### Circuit breaker activated

```
WARN - Circuit breaker open for cloud_vision
```

This means Google Cloud Vision failed 5+ times in a row. The system will automatically use fallback providers (Gemini or Local).

**Solution:**
1. Check Google Cloud Vision API quota/billing
2. Verify credentials are valid
3. Wait 60 seconds for circuit breaker to reset
4. Or restart worker to reset immediately

## Configuration

### Worker Settings

Environment variables for the face-worker container:

```bash
# Google Cloud Vision
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/gcp-credentials.json

# Gemini (fallback)
GEMINI_API_KEY=your-key-here

# Worker tuning
FACE_WORKER_BATCH_SIZE=10          # Jobs per batch
FACE_WORKER_POLLING_INTERVAL=5     # Seconds between polls
FACE_WORKER_CONCURRENT_JOBS=5      # Parallel processing
```

### Detection Settings

Adjust in database `ai_provider_settings` table or via Admin API:

- `min_confidence` - Minimum confidence to store faces (default: 0.75)
- `auto_cluster_enabled` - Enable automatic face grouping (default: true)
- `cluster_threshold` - Similarity threshold for clustering (default: 0.80)

## Performance

### Expected Throughput

- Google Cloud Vision: ~2-3 photos/second
- Gemini: ~1-2 photos/second
- Local Provider: ~0.5-1 photo/second

For a gallery with 100 photos:
- With Cloud Vision: ~30-50 seconds
- With Gemini: ~50-100 seconds
- With Local: ~100-200 seconds

### Optimizations

1. **Increase concurrent jobs:** (in `.env`)
   ```bash
   FACE_WORKER_CONCURRENT_JOBS=10
   ```

2. **Reduce polling interval:** (faster response but more DB queries)
   ```bash
   FACE_WORKER_POLLING_INTERVAL=2
   ```

3. **Scale horizontally:** Run multiple face-worker containers

## Summary of Changes Made

### Backend Changes

1. **New endpoint added:** `POST /api/v1/workspaces/{id}/galleries/{id}/scan-faces`
   - Queues face detection jobs for all photos in a gallery
   - Returns job count and status message
   - Location: `backend/src/app/api/v1/galleries.py`

### Frontend Changes

1. **New method in faceApiService:** `scanGalleryFaces()`
   - Calls the gallery scan endpoint
   - Location: `frontend/src/services/faceApiService.ts`

2. **PeoplePanel enhancements:**
   - Added "Scan" button in panel header
   - Shows "Scanning..." state during processing
   - Auto-refreshes face groups after scan
   - Location: `frontend/src/components/features/gallery/PeoplePanel.tsx`

## Next Steps

1. **Setup credentials** following Option 1 or 2 above
2. **Test the feature** by uploading photos and clicking "Find People" → "Scan"
3. **Monitor logs** to ensure processing is working
4. **(Optional) Setup Gemini** as backup provider for better reliability

## Support

If you encounter issues:

1. Check worker logs: `docker logs rawdrive-face-worker --tail 100`
2. Check database jobs: `SELECT * FROM face_detection_jobs WHERE status = 'failed'`
3. Verify credentials are mounted: `docker exec rawdrive-face-worker ls -la /run/secrets/`
4. Review this guide's troubleshooting section

The face detection feature is now fully implemented and ready to use once credentials are configured!
