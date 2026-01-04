# Quickstart Guide: Enhanced Smart Curate

**Feature Branch**: `023-enhanced-smart-curate`
**Last Updated**: 2026-01-04

This guide helps developers get started with the Enhanced Smart Curate feature for local development and testing.

---

## Prerequisites

### Required Services

Ensure these services are running via Docker Compose:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Required containers:
# - rawdrive-postgres (PostgreSQL 16 + pgvector)
# - rawdrive-redis (Redis 7 for Celery broker)
# - rawdrive-backend (FastAPI app)
```

### Environment Variables

Add these to your `.env` file:

```bash
# Gemini API (for quality analysis)
# Note: Users provide their own keys via profile settings
# For testing, set a development key:
GEMINI_API_KEY_DEV=your-gemini-api-key

# CLIP Embeddings (for similarity grouping)
CLIP_MODEL=ViT-B-32
CLIP_DEVICE=cpu  # Use 'cuda' if GPU available
CLIP_BATCH_SIZE=64  # Increase to 256 for GPU

# Celery Workers
CELERY_BROKER_URL=redis://localhost:6379/3
CELERY_RESULT_BACKEND=redis://localhost:6379/4

# Analysis Worker Settings
ANALYSIS_WORKER_CONCURRENCY=4
ANALYSIS_WORKER_MEMORY_LIMIT=6GB
```

### Python Dependencies

```bash
cd backend
pip install sentence-transformers torch pgvector
```

---

## Database Setup

### Run Migrations

```bash
cd backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" \
  alembic upgrade head
```

### Verify pgvector Extension

```sql
-- Connect to database and verify
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Should see one row. If not:
CREATE EXTENSION IF NOT EXISTS vector;
```

### Seed Test Data (Optional)

```bash
# Create test gallery with 100 photos for curation testing
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" \
  python -m app.db.seeds.seed_curation_test_data
```

---

## Running Workers

### Start Celery Workers

Open separate terminal windows for each worker type:

```bash
# Terminal 1: Quality Analysis Worker
cd backend
celery -A app.workers.quality_analysis_worker worker \
  --loglevel=info \
  --concurrency=4 \
  --queues=quality_analysis

# Terminal 2: Similarity/Embedding Worker
cd backend
celery -A app.workers.similarity_worker worker \
  --loglevel=info \
  --concurrency=2 \
  --queues=similarity

# Terminal 3: Curation Selection Worker
cd backend
celery -A app.workers.curation_worker worker \
  --loglevel=info \
  --concurrency=4 \
  --queues=curation
```

### Monitor Celery

```bash
# View active tasks
celery -A app.workers inspect active

# View queue stats
celery -A app.workers inspect stats

# Flower web UI (optional)
pip install flower
celery -A app.workers flower --port=5555
```

---

## API Testing

### Configure Test User's Gemini Key

First, set up a test user with a Gemini API key:

```bash
# Get test user token (from docs/TEST_USERS.md)
TOKEN="eyJhbG..."

# Set Gemini API key for test user
curl -X PUT http://localhost:8000/api/v1/users/me/gemini-settings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "your-gemini-api-key",
    "model_id": "gemini-1.5-flash"
  }'
```

### Create Curation Session

```bash
WORKSPACE_ID="9af3bc61-d271-50bf-92ae-efd8ca90f9ab"
GALLERY_ID="your-gallery-id"

# Create session
curl -X POST "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/galleries/$GALLERY_ID/curation-sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_count": 50,
    "parameters": {
      "quality_threshold": 60,
      "similarity_threshold": 0.85,
      "diversity_weight": 0.3
    },
    "auto_start": true
  }'
```

### Monitor Progress

```bash
SESSION_ID="returned-session-id"

# Check progress
curl "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/galleries/$GALLERY_ID/curation-sessions/$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Results

```bash
# Get selections
curl "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/galleries/$GALLERY_ID/curation-sessions/$SESSION_ID/selections?include_reasons=true" \
  -H "Authorization: Bearer $TOKEN"

# Get similarity groups
curl "http://localhost:8000/api/v1/workspaces/$WORKSPACE_ID/galleries/$GALLERY_ID/similarity-groups" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Frontend Development

### Start Dev Server

```bash
cd frontend
npm run dev
```

### Access Curation UI

Navigate to a gallery detail page:
```
http://localhost:3000/workspace/galleries/{gallery_id}
```

The Smart Curation panel appears in the right sidebar.

### Mock API Responses (Without Gemini Key)

For frontend development without a real Gemini key, use MSW mocks:

```typescript
// frontend/src/mocks/handlers/curation.ts
import { http, HttpResponse } from 'msw'

export const curationHandlers = [
  http.post('*/curation-sessions', () => {
    return HttpResponse.json({
      session_id: 'mock-session-id',
      status: 'analyzing',
      progress: { photos_total: 100, photos_processed: 0 }
    })
  }),

  http.get('*/quality-analysis', () => {
    return HttpResponse.json({
      data: mockQualityResults,
      summary: { analyzed_count: 100, average_score: 72 }
    })
  })
]
```

Enable mocks in development:

```typescript
// frontend/src/main.tsx
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API) {
  const { worker } = await import('./mocks/browser')
  await worker.start()
}
```

---

## Testing

### Run Backend Tests

```bash
cd backend

# Unit tests
pytest tests/unit/services/test_curation_*.py -v

# Integration tests (requires running services)
pytest tests/integration/api/test_curation_endpoints.py -v

# With coverage
pytest tests/ --cov=src/app/services --cov-report=html
```

### Run Frontend Tests

```bash
cd frontend

# Component tests
npm test -- --filter="SmartCuration"

# E2E with Playwright (requires backend running)
npx playwright test tests/e2e/curation.spec.ts
```

### Test Data Scenarios

| Scenario | Gallery Size | Expected Behavior |
|----------|--------------|-------------------|
| Small gallery | 50 photos | Fast analysis, few groups |
| Medium gallery | 500 photos | ~2min analysis, multiple groups |
| Large gallery | 3,000 photos | ~8min analysis, many groups |
| Burst shots | 20 identical | All grouped together |
| Mixed quality | Varied | Clear quality ranking |

---

## Debugging

### Common Issues

**1. "No Gemini API key configured"**
```bash
# Check user's Gemini settings
curl http://localhost:8000/api/v1/users/me/gemini-settings \
  -H "Authorization: Bearer $TOKEN"
```

**2. Embeddings not computing**
```bash
# Check if CLIP model is loaded
docker logs rawdrive-backend | grep -i clip

# Check Celery worker logs
celery -A app.workers inspect active --json
```

**3. Similarity groups not forming**
```bash
# Check embedding count in database
psql -U rawdrive -d rawdrive -c \
  "SELECT COUNT(*) FROM image_embeddings WHERE gallery_id = 'xxx'"
```

### Useful SQL Queries

```sql
-- Check curation session status
SELECT session_id, status, photos_analyzed, target_count
FROM curation_sessions
WHERE gallery_id = 'your-gallery-id'
ORDER BY created_at DESC;

-- View quality distribution
SELECT
  CASE
    WHEN overall_score >= 80 THEN 'excellent'
    WHEN overall_score >= 60 THEN 'good'
    WHEN overall_score >= 40 THEN 'fair'
    ELSE 'poor'
  END as tier,
  COUNT(*)
FROM photo_quality_analysis
WHERE session_id = 'your-session-id'
GROUP BY tier;

-- List similarity groups
SELECT group_id, member_count, best_asset_id
FROM similarity_groups
WHERE session_id = 'your-session-id'
ORDER BY member_count DESC;
```

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   FastAPI       │────▶│   PostgreSQL    │
│   (React)       │     │   Backend       │     │   + pgvector    │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │   Redis         │
                        │   (Celery)      │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
     │ Quality Worker  │ │ Similarity      │ │ Curation        │
     │ (Gemini API)    │ │ Worker (CLIP)   │ │ Worker          │
     └─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Key Services

| Service | Purpose | Location |
|---------|---------|----------|
| PhotoQualityService | Quality scoring via Gemini | `services/photo_quality_service.py` |
| SimilarityGroupingService | CLIP embeddings & clustering | `services/similarity_grouping_service.py` |
| CurationSelectionService | Target-count culling algorithm | `services/curation_selection_service.py` |
| CurationSessionService | Session lifecycle management | `services/curation_session_service.py` |

---

## Next Steps

1. **Explore the spec**: Read `spec.md` for full feature requirements
2. **Review data model**: See `data-model.md` for schema details
3. **Check API contracts**: OpenAPI specs in `contracts/` directory
4. **Run the implementation**: Start with P1 tasks in `tasks.md`

---

## Resources

- [Spec Document](./spec.md) - Feature specification
- [Architecture](./architecture.md) - Production architecture
- [Data Model](./data-model.md) - Database schema
- [Research Findings](./research.md) - Technical decisions
- [API Contracts](./contracts/) - OpenAPI specifications
