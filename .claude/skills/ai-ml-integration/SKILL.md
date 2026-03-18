---
name: ai-ml-integration
description: "AI and ML integration patterns for RawDrive including Gemini, CLIP, face recognition, vector search, and MCP tooling. Use this skill when implementing AI features (smart tagging, duplicate detection, AI highlights, face grouping, semantic search), working with embeddings, vector databases (pgvector/Milvus), prompt engineering, or AI provider configuration. Also use when working in ai-service, ai-processing-service, or any AI-related backend code. Triggers on: AI, ML, Gemini, CLIP, face recognition, embedding, vector search, pgvector, Milvus, smart tagging, AI highlights, duplicate detection, semantic search, prompt, LLM."
---

# AI & ML Integration

RawDrive uses AI as a copilot — enhancing without taking control. AI operations are resource-intensive and MUST NOT block the main API.

## Architecture: Async Job Queue

```
User Upload → Event Emission → AI Service Consumes → Worker Processes → Store Results
                                                                         ↓
                                                                    pgvector / Milvus
```

Never run AI inference inline in an API request handler. Always use background workers.

## Models & Dimensions

| Provider | Use Case | Dimensions | Notes |
|----------|----------|-----------|-------|
| Google Gemini | Captioning, tagging, rating, OCR | 768 | Handle 429s with backoff; use JSON mode |
| CLIP | Semantic image search | 512 or 768 | Text-to-image similarity |
| Face Recognition | FaceID, grouping | 128 | deepface or face_recognition lib |

**CRITICAL:** Dimension mismatch = silent failures. Always verify model output dims match column definition.

## Provider Abstraction

Never hardcode provider names or model identifiers:

```python
# CORRECT - use config
from app.config import settings

model = settings.AI_MODEL  # From environment
api_key = settings.AI_API_KEY

# WRONG - hardcoded
model = "gemini-2.0-flash"  # NEVER
```

## Prompt Engineering

Store prompts in code/config (version controlled), not database:

```python
PHOTO_ANALYSIS_PROMPT = """
You are a professional photography editor.
Analyze this image for:
- Focus quality (sharp/soft)
- Composition (rule of thirds, leading lines)
- Exposure (over/under/correct)
- Color grading quality

Return valid JSON:
{"score": 8.5, "tags": ["portrait", "outdoor"], "flags": ["slight_overexposure"]}
"""
```

## Vector Search with Workspace Isolation

```python
from pgvector.sqlalchemy import Vector

# ALWAYS filter by workspace_id in vector queries
async def semantic_search(
    query_embedding: list[float],
    workspace_id: UUID,
    limit: int = 20
) -> list[Asset]:
    result = await db.execute(
        select(Asset)
        .where(Asset.workspace_id == workspace_id)  # MANDATORY
        .order_by(Asset.embedding.cosine_distance(query_embedding))
        .limit(limit)
    )
    return list(result.scalars().all())
```

## Performance & Cost

- **Cache embeddings** by image SHA256 hash — skip if unchanged
- **Batch API calls** where provider supports it
- **Resize first:** Run AI on 1024px thumbnails, not 50MB RAW files
- **Deduplication:** Check if asset already processed before queuing

## Face Recognition Privacy

- Face recognition is **opt-in** for clients
- Delete embeddings when client requests to be "forgotten" (GDPR)
- Allow manual face group corrections (AI isn't perfect)
- Store consent status per workspace

## Testing AI Features

```python
# NEVER call real AI providers in CI/CD
# Mock the provider, test with golden images

@pytest.fixture
def mock_gemini(monkeypatch):
    async def fake_analyze(image_path):
        return {"score": 7.5, "tags": ["portrait"], "flags": []}
    monkeypatch.setattr(ai_service, "analyze_image", fake_analyze)

def test_face_detection():
    # Use golden test images with known face counts
    result = detect_faces("tests/fixtures/test_face.jpg")
    assert len(result.faces) == 1
```

## Service Architecture

- **ai-service** (8011): Orchestration, routing, lightweight inference
- **ai-processing-service** (8012): Heavy workloads (embeddings, CLIP, batch processing)
- **llm-service** (8014): LLM chat integration

**Deep dive:** Read `.claude/reference/ai-ml-best-practices.md` and `.claude/reference/milvus-best-practices.md`
