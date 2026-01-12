# GEO (Generative Engine Optimization) Best Practices

A guide for optimizing RawDrive content for AI Discoverability and Internal Semantic Search.

---

## 1. What is GEO?

Generative Engine Optimization (GEO) focuses on making content discoverable by AI models (LLMs, RAG systems).
*   **External GEO:** Being cited by ChatGPT/Gemini (Public Profiles).
*   **Internal GEO:** Ensuring the specific photo a client wants is found by RawDrive's internal semantic search ("Show me photos of the bride crying").

---

## 2. Internal GEO (Semantic Search)

Optimizing assets for the `ai-service` vector search.

### Rich Metadata Injection
Raw vectors are not enough. We must enrich the "Context Context" before embedding.
*   **Captioning:** Use VLM (Vision Language Model) to generate dense descriptions.
    *   *Bad:* "Wedding photo"
    *   *Good:* "A candid medium shot of the bride wiping a tear during her father's speech at the sunset reception. Warm lighting, emotional atmosphere."
*   **OCR:** Extract text (menu cards, street signs) and append to the embedding text chunk.

### Hybrid Search Strategy
Vectors miss exact keyword matches (e.g., "IMG_1234.jpg" or specific names).
*   **Algorithm:** `RRF (Reciprocal Rank Fusion)` combines Vector Rank + Keyword Rank (BM25).
*   **Weights:** Give higher weight to Keywords for proper nouns, higher weight to Vectors for concepts.

### Taxonomy Alignment
Standardize tags to match user intent.
*   Map generic AI tags ("formal wear") to domain tags ("sherwani", "lehenga") for Indian wedding context.

---

## 3. External GEO (Public Profile Visibility)

Optimizing `/u/{slug}` for AI answer engines (ChatGPT, Perplexity).

### Structured Knowledge (JSON-LD)
LLMs are excellent at parsing JSON-LD.
*   Include `knowsAbout`, `alumniOf`, `award` in the `Person` schema.
*   Explicitly link social profiles (`sameAs`) to build the Knowledge Graph.

### Authority & Citations
AI models prioritize "high authority" sources.
*   **Backlinks:** Encourage photographers to link their RawDrive ID from their main website (`rel="me"`).
*   **Consistency:** Name, Address, Phone (NAP) must match exactly across Instagram, Website, and RawDrive.

### Q&A Format
AI engines look for direct answers.
*   Include an FAQ section on Public Profiles.
    *   "What is [Photographer Name]'s pricing?"
    *   "Do they travel for destination weddings?"

---

## 4. Testing GEO

### Internal Evaluation
*   **Golden Queries:** Maintain a dataset of hard queries ("Grandma dancing").
*   **Recall@K:** Measure if the target photo appears in the top 5 results.

### External Evaluation
*   **Prompt Testing:** Ask ChatGPT "Who are the best wedding photographers in [City]?" and check if RawDrive profiles are cited.
