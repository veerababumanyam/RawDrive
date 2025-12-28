# Quickstart: AI-Powered Photo Features

**Date**: 2025-12-28
**Feature**: 010-ai-powered-features
**Setup Time**: 15 minutes

## Prerequisites

- RawDrive backend running (PostgreSQL + Redis)
- Google Gemini API key (get from [Google AI Studio](https://makersuite.google.com/app/apikey))
- Node.js 18+ and Python 3.11+ development environment

## Environment Setup

### 1. Configure Environment Variables

Add to your `.env` file:

```bash
# AI Providers (Required)
GEMINI_API_KEY=your_actual_gemini_api_key_here

# Optional: Additional providers
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

### 2. Install Dependencies

**Backend:**
```bash
cd backend
pip install google-generativeai httpx
```

**Frontend:**
```bash
cd frontend
npm install @types/uuid uuid
```

### 3. Run Database Migrations

```bash
cd backend
python -m alembic upgrade head
```

Or apply the schema changes manually:

```sql
-- Run the migration from data-model.md
\i specs/010-ai-powered-features/data-model.sql
```

## Development Setup

### 1. Start Services

**Terminal 1: Backend**
```bash
cd backend
python start_backend.py
```

**Terminal 2: Frontend**
```bash
cd frontend
npm run dev
```

**Terminal 3: Database**
```bash
# Ensure PostgreSQL is running
psql -d rawdrive
```

### 2. Configure User Settings

1. Log into RawDrive as a user
2. Go to Settings → AI & Gemini
3. Enter your Gemini API key
4. Select preferred model (Gemini 2.0 Flash recommended)

## Testing the Features

### 1. Photo Analysis

```bash
# Upload a photo to a gallery
curl -X POST "http://localhost:8000/api/v1/workspaces/{workspace_id}/smart-tagging/assets/{asset_id}/analyze" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"photo_url": "https://example.com/photo.jpg"}'
```

**Expected Response:**
```json
{
  "description": "A beautiful portrait of a person in natural lighting",
  "quality_score": 85,
  "tags": ["portrait", "natural-light", "professional"],
  "hashtags": ["#portrait", "#photography", "#natural"],
  "improvements": ["Slight exposure adjustment recommended"]
}
```

### 2. Caption Generation

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/{workspace_id}/smart-tagging/assets/{asset_id}/captions" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"photo_url": "https://example.com/photo.jpg", "style": "professional", "count": 2}'
```

### 3. Hashtag Generation

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/{workspace_id}/smart-tagging/assets/{asset_id}/hashtags" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"photo_url": "https://example.com/photo.jpg", "count": 10}'
```

## Troubleshooting

### Common Issues

**"AI not configured" error:**
- Check that GEMINI_API_KEY is set in .env
- Verify user has configured API key in settings
- Ensure API key has proper permissions

**"Asset not found" error:**
- Verify asset_id exists in database
- Check workspace permissions
- Ensure asset belongs to the workspace

**Timeout errors:**
- Check internet connection
- Verify Gemini API is accessible
- Consider using a different model

### Debug Commands

**Check API key configuration:**
```bash
# Backend logs
tail -f backend_logs.txt | grep gemini

# Check user settings
psql -d rawdrive -c "SELECT * FROM user_gemini_settings WHERE user_id = '{user_id}';"
```

**Test Gemini API directly:**
```python
import google.generativeai as genai
genai.configure(api_key="your_key")
model = genai.GenerativeModel('gemini-2.0-flash-exp')
response = model.generate_content("Hello")
print(response.text)
```

## Development Workflow

### 1. Code Changes

- Backend services: `backend/src/app/services/`
- API endpoints: `backend/src/app/api/v1/smart_tagging.py`
- Frontend components: `frontend/src/components/ai/`
- Types: `frontend/src/types/aiFeatures.ts`

### 2. Testing

```bash
# Backend tests
cd backend
python -m pytest tests/ -k "ai" -v

# Frontend tests
cd frontend
npm test -- --testPathPattern=ai
```

### 3. Linting

```bash
# Backend
cd backend
black . && isort . && flake8 .

# Frontend
cd frontend
npm run lint
```

## Performance Monitoring

### Key Metrics

- **Response Time**: <30s for analysis, <10s for captions
- **Success Rate**: >95% for configured users
- **Error Rate**: <5% overall
- **Credit Usage**: Monitor per user/workspace

### Monitoring Commands

```bash
# Check AI usage logs
psql -d rawdrive -c "SELECT * FROM ai_usage_logs ORDER BY created_at DESC LIMIT 10;"

# Monitor job queue
psql -d rawdrive -c "SELECT status, count(*) FROM ai_job_results GROUP BY status;"
```

## Next Steps

1. **Test all features** with real photos
2. **Configure production API keys** securely
3. **Set up monitoring** and alerting
4. **Document user-facing features** in help system
5. **Plan A/B testing** for feature adoption

## Support

- **Issues**: Check backend logs and browser console
- **API Docs**: Available at `/docs` when backend is running
- **Database**: Use pgAdmin or psql for inspection
- **Gemini API**: Check [Google AI documentation](https://ai.google.dev/docs)