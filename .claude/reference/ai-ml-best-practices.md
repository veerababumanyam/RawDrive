# AI & ML Best Practices Reference

A guide for integrating AI features (FaceID, Semantic Search, Smart Curate) in RawDrive.

---

## 1. Architecture Overview

AI operations are resource-intensive and must NOT block the main API.

*   **Pattern:** Async Job Queue (Redis/BullMQ).
*   **Flow:**
    1.  User uploads photo → `upload-service` emits `PROCESSED` event.
    2.  `ai-service` consumes event.
    3.  Worker generates embeddings/metadata.
    4.  Result stored in Postgres (`pgvector`).

---

## 2. Models & Providers

### Google Gemini (Multimodal)
Used for:
*   **Captioning/Tagging:** "Describe this image for search indexing."
*   **Smart Curate:** "Rate this photo's composition 1-10."
*   **Extraction:** Reading text/numbers from images (OCR).

**Best Practice:**
*   **Rate Limits:** Handle 429s with exponential backoff.
*   **Tokens:** Minimize prompt length. Use JSON mode for structured output.

### Face Recognition
*   **Library:** `face_recognition` (dlib) or deepface.
*   **Storage:** Store 128-d or 512-d embeddings in `pgvector`.
*   **Privacy:**
    *   **Isolation:** Never mix embeddings across Workspaces.
    *   **Indexing:** In `pgvector`, ensure queries always filter by `workspace_id`.

```sql
SELECT * FROM face_encodings
ORDER BY embedding <-> query_vector
WHERE workspace_id = '...'
LIMIT 5;
```

---

## 3. Vector Database (pgvector)

### Dimension Matching
Ensure the column dimension matches the model output exactly.
*   Gemini Embeddings: 768 dimensions.
*   CLIP (OpenAI): 512 or 768 dimensions.
*   Face ResNet: 128 dimensions.

### Indexing (HNSW)
HNSW (Hierarchical Navigable Small World) is critical for performance > 10k vectors.

*   **Build Time:** Indexing is slow. Consider building indexes in background or maintenance windows for massive imports.
*   **Parameters:** `m=16`, `ef_construction=64` are good defaults.

---

## 4. Prompt Engineering (System Prompts)

Store prompts in code or config, not DB, for version control.

**Example System Prompt for Culling:**
```text
You are a professional photography editor. 
Analyze the image for: focus (sharp/soft), composition (rule of thirds), and exposure. 
Return valid JSON: {"score": 8.5, "tags": ["portrait", "outdoor"], "flags": []}
```

---

## 5. Privacy & Ethics

*   **Opt-In:** Face recognition should arguably be an opt-in feature for clients.
*   **Retention:** If a client asks to be "forgotten", you must delete their face embedding vectors.
*   **Bias:** Be aware that some models perform differently on different demographics. Allow manual correction of Face Groups.

---

## 6. Testing AI Features

*   **Unit Tests:** Mock the AI provider. Do NOT call Google Gemini in CI tests.
*   **Integration:** Use a small set of "golden images" with known vectors/tags to verify the pipeline.
*   **Golden Set:**
    *   `test_face.jpg` -> Should detect 1 face.
    *   `test_blur.jpg` -> Smart Curate score < 5.0.

---

## 7. Performance & Cost

*   **Caching:** Cache embeddings for the same image hash (`sha256`). If the image hasn't changed, don't re-run Gemini.
*   **Batching:** Send images in batches if the API supports it (Gemini usually one-by-one, but local models support batching).
*   **Thumbnailing:** Run AI on smaller 1024px resized versions, not 50MB RAW files.
