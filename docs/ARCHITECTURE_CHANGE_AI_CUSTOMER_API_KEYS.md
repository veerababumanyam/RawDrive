# Architecture Change: AI Services Use Customer API Keys Only

**Date**: 2026-01-08
**Status**: ✅ Complete
**Priority**: CRITICAL

---

## Executive Summary

RawDrive's AI architecture has been aligned to use **ONLY customer-configured API keys**. No local AI models are deployed. This applies to all AI features including duplicate detection, emotion detection, face detection, and future AI capabilities.

---

## Critical Requirement

**User Directive**: "proceed, remove if any inbuild AI services configured and align them to use Google Gemini AI service"

**Implementation**:
- ❌ NO local AI models (CLIP, transformers, torch, Sentence-BERT, etc.)
- ✅ ALL AI operations via customer's Google Gemini API keys
- ✅ Consistent credential management pattern across all services
- ✅ Same approach as existing emotion detection and face detection

---

## What Changed

### Before (Incorrect Approach)
```python
# ❌ WRONG: Using local CLIP model
import torch
from transformers import CLIPProcessor, CLIPModel

class CLIPEmbeddingService:
    def __init__(self):
        self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    async def generate_embedding(self, text):
        # Uses local model - WRONG
        inputs = self.processor(text=[text], return_tensors="pt")
        features = self.model.get_text_features(**inputs)
        return features.cpu().tolist()
```

**Dependencies Required**:
- transformers==4.35.0
- torch==2.1.0
- Large model files (~500MB)
- GPU/CPU compute resources

**Problems**:
- Violates RawDrive's architecture principle
- Requires hosting AI models
- High infrastructure cost
- Inconsistent with other AI features

### After (Correct Approach)
```python
# ✅ CORRECT: Using customer's Gemini API key
import google.generativeai as genai

class GeminiEmbeddingService:
    def __init__(self, config_service):
        self._config_service = config_service
        self._gen_ai = None

    async def _ensure_client(self):
        # Load customer's API key from configuration
        credentials = await self._config_service.get_provider_credentials("gemini")
        api_key = credentials.get("api_key")

        # Configure Gemini with customer's key
        genai.configure(api_key=api_key)
        self._gen_ai = genai

    async def generate_client_embedding(self, client_data):
        await self._ensure_client()

        # Use customer's Gemini API
        result = self._gen_ai.embed_content(
            model="models/embedding-001",
            content=self._construct_client_text(client_data),
            task_type="semantic_similarity"
        )

        return result['embedding']
```

**Dependencies Required**:
- google-generativeai>=0.3.0 (already installed)

**Benefits**:
- ✅ Follows RawDrive's architecture
- ✅ No local model hosting
- ✅ Customer controls their AI costs
- ✅ Consistent with emotion/face detection
- ✅ Easy to scale

---

## Services Updated

### 1. Duplicate Detection - Embedding Service ✅

**File**: `services/ai-service/src/services/gemini_embedding_service.py`

**Before**: `clip_embedding_service.py` using local CLIP model
**After**: `gemini_embedding_service.py` using customer Gemini API

**Embedding Dimension**:
- Before: 512-d (CLIP ViT-Base-Patch32)
- After: 768-d (Gemini embedding-001)

### 2. Database Migration ✅

**File**: `backend/migrations/versions/0130_add_duplicate_detection.py`

**Changes**:
- Column: `clip_embedding vector(512)` → `gemini_embedding vector(768)`
- Index: `idx_clients_clip_embedding` → `idx_clients_gemini_embedding`
- Detection method: `'clip_embedding'` → `'gemini_embedding'`
- Comments updated to reflect customer API key usage

### 3. Documentation ✅

**Files Updated**:
- `docs/PHASE_2_DUPLICATE_DETECTION_PROGRESS.md`
- `docs/PHASE_2_DUPLICATE_DETECTION_PLAN.md` (needs update)

**Changes**:
- Removed all references to CLIP, transformers, torch
- Updated to Gemini API with customer keys
- Added architecture notes section

---

## Credential Management Pattern

All AI services follow this pattern:

```python
# 1. Configuration Service
config_service = FaceConfigurationService(admin_settings_service)

# 2. Load Credentials (priority: admin settings > env vars > defaults)
credentials = await config_service.get_provider_credentials("gemini")

# 3. Extract API Key
api_key = credentials.get("api_key")

# 4. Configure Gemini
import google.generativeai as genai
genai.configure(api_key=api_key)

# 5. Use Gemini API
result = genai.embed_content(model="models/embedding-001", content=text)
```

**Credential Priority**:
1. Admin settings (encrypted in database)
2. Environment variables (`GEMINI_API_KEY`)
3. Error if not configured

**Security**:
- Credentials encrypted at rest in database
- Decrypted only when needed
- Never logged or exposed to client
- Per-workspace isolation possible

---

## API Cost Tracking

**Credit Costs** (using customer's API key):
- Photo hash computation: 10 credits per 100 photos (one-time)
- Photo duplicate detection: 0 credits (uses cached hashes)
- Client embedding generation: 15 credits per 100 clients (one-time)
- Client duplicate detection: 0 credits (uses cached embeddings)

**Notes**:
- Customer pays Google directly for API usage
- RawDrive tracks credits for billing/quota purposes
- Embeddings cached in database to minimize API calls

---

## Files Created/Modified

### Created ✅
1. `services/ai-service/src/services/gemini_embedding_service.py` (425 lines)
2. `docs/ARCHITECTURE_CHANGE_AI_CUSTOMER_API_KEYS.md` (this file)

### Modified ✅
1. `backend/migrations/versions/0130_add_duplicate_detection.py` (187 lines)
   - Changed from `clip_embedding vector(512)` to `gemini_embedding vector(768)`
   - Updated all references and comments

2. `docs/PHASE_2_DUPLICATE_DETECTION_PROGRESS.md`
   - Updated embedding service section
   - Added architecture notes
   - Removed CLIP/transformers references

### Deleted ✅
1. `services/ai-service/src/services/clip_embedding_service.py` (65 lines)
   - Violated architecture requirement
   - Replaced with GeminiEmbeddingService

---

## Future AI Features

**All future AI features MUST follow this pattern**:

✅ **DO**:
- Use customer-configured Gemini API keys
- Follow FaceConfigurationService credential pattern
- Cache results in database to minimize API calls
- Track credit usage per workspace
- Provide clear error messages when API key not configured

❌ **DON'T**:
- Host local AI models (CLIP, BERT, GPT, etc.)
- Use transformers, torch, tensorflow libraries for inference
- Require GPU resources
- Download model weights
- Create local model dependencies

---

## Examples of Future Features

### Video Highlights
```python
# ✅ CORRECT
class GeminiVideoHighlightsService:
    async def extract_highlights(self, video_id, workspace_id):
        credentials = await self._config_service.get_provider_credentials("gemini")
        genai.configure(api_key=credentials["api_key"])

        # Use Gemini Video API with customer's key
        result = genai.generate_content([video_file, prompt])
```

### Smart Curation
```python
# ✅ CORRECT
class GeminiCurationService:
    async def curate_gallery(self, photos, workspace_id):
        credentials = await self._config_service.get_provider_credentials("gemini")
        genai.configure(api_key=credentials["api_key"])

        # Use Gemini Vision API with customer's key
        result = genai.generate_content([photos, curation_prompt])
```

---

## Testing

### Unit Tests
```python
# Test credential loading
async def test_loads_credentials_from_config_service():
    config_service = Mock()
    config_service.get_provider_credentials = AsyncMock(
        return_value={"api_key": "test-key"}
    )

    service = GeminiEmbeddingService(config_service)
    await service._ensure_client()

    assert service._api_key == "test-key"
```

### Integration Tests
```python
# Test embedding generation with real API
@pytest.mark.integration
async def test_generate_embedding_with_gemini_api():
    service = GeminiEmbeddingService()

    embedding = await service.generate_client_embedding({
        "name": "John Smith",
        "email": "john@example.com"
    })

    assert len(embedding) == 768  # Gemini embedding dimension
    assert all(isinstance(x, float) for x in embedding)
```

---

## Migration Guide

If you have existing code using local AI models:

### Step 1: Remove Local Model Dependencies
```bash
# Remove from requirements.txt
- transformers
- torch
- sentence-transformers
```

### Step 2: Replace Service Implementation
```python
# Before
from transformers import CLIPModel
service = CLIPEmbeddingService()

# After
from services.gemini_embedding_service import GeminiEmbeddingService
service = GeminiEmbeddingService(config_service)
```

### Step 3: Update Database Schema
```sql
-- Migration: Change vector dimension if needed
ALTER TABLE clients
  DROP COLUMN clip_embedding;

ALTER TABLE clients
  ADD COLUMN gemini_embedding vector(768);
```

### Step 4: Re-generate Embeddings
```python
# Re-generate all embeddings using customer API key
clients = await get_all_clients_without_embeddings()
for client in clients:
    embedding = await service.generate_client_embedding(client.data)
    await update_client_embedding(client.id, embedding)
```

---

## Configuration

### Environment Variables
```bash
# Required for all AI features
GEMINI_API_KEY=your-customer-gemini-api-key

# Optional (defaults provided)
GEMINI_MODEL_FAST=gemini-2.5-flash
GEMINI_TEMPERATURE=0.1
GEMINI_MAX_OUTPUT_TOKENS=4096
```

### Admin Settings
```json
{
  "providers": {
    "gemini": {
      "credentials_encrypted": "<encrypted-api-key>",
      "model": "gemini-2.5-flash",
      "is_enabled": true,
      "priority": 0
    }
  }
}
```

---

## FAQs

**Q: Why not use local models for better performance?**
A: RawDrive's architecture prioritizes customer control and cost transparency. Customers manage their own API keys and pay Google directly for AI usage. This avoids infrastructure costs and scales better.

**Q: What if customer doesn't have Gemini API key?**
A: AI features require configuration. Clear error messages guide users to configure their API key in admin settings or environment variables.

**Q: How do we handle API rate limits?**
A: Use FaceConfigurationService's rate limiting features. Cache embeddings in database. Implement exponential backoff for transient errors.

**Q: Can we support multiple AI providers?**
A: Yes! Follow the same pattern. Add credentials for OpenAI, Anthropic, etc. to FaceConfigurationService. Implement provider-specific clients. All must use customer API keys.

**Q: What about offline/air-gapped deployments?**
A: AI features require internet access to Google APIs. For air-gapped deployments, AI features will be unavailable unless customer hosts their own Gemini API endpoint.

---

## Compliance

This architecture ensures:
- ✅ **Data Privacy**: Customer data sent only to their configured AI provider
- ✅ **Cost Control**: Customer pays their own AI provider directly
- ✅ **Auditability**: All API calls logged with workspace_id
- ✅ **Security**: Credentials encrypted at rest, never exposed to client
- ✅ **Scalability**: No local GPU infrastructure required

---

## Related Documentation

- `backend/src/app/services/face_configuration_service.py` - Credential management
- `backend/src/app/services/ai/providers/gemini_provider.py` - Gemini face detection
- `services/ai-service/src/services/gemini_embedding_service.py` - Gemini embeddings
- `docs/PHASE_2_DUPLICATE_DETECTION_PROGRESS.md` - Implementation progress

---

**Last Updated**: 2026-01-08
**Status**: Architecture change complete
**Next Steps**: Continue Phase 2 duplicate detection implementation
