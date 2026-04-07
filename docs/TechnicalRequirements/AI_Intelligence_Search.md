# Technical Requirements: AI & Intelligence

**Document Status:** Draft v1.1 (Market Aligned)  
**Ownership:** AI / Data Engineering  
**Technology:** Google Cloud Vision API (FaceID), Google Gemini 1.5 Pro (Aesthetic Scoring), PostgreSQL (pgvector), Golang (Inference/Orchestra)

---

## 1. Product Mission
Empower photographers to manage thousands of images by automating technical culling, facilitating ultra-fast natural language discovery, and providing a seamless "Find My Photos" (FaceID) experience for their clients. **RawDrive aims to be the first all-in-one platform with native, high-accuracy AI culling.**

## 2. FaceID & Recognition (The "Selfie Search")

### 2.1 The Client Access Workflow (Pic-Time Benchmark)
1.  **Entry Point:** In a shared event gallery, a "Find My Photos" icon is displayed prominently.
2.  **Privacy Opt-in [MANDATORY]:** 
    *   Explicit consent modal (per **Security_Compliance_Privacy.md**).
    *   Explanation that the selfie is **ephemeral** and discarded immediately after matching.
3.  **Capture:** System opens the device's front camera or allows a file upload.
4.  **Processing:** 
    *   Selfie is sent to **Google Cloud Vision API** (SafeSearch enabled) to generate a facial embedding.
    *   The embedding is queried against the event's local index in **pgvector**.
5.  **Result:** The UI filters the gallery to show matching photos (Confidence > 0.85).

### 2.2 Advanced People Clustering
- **Photographer View:** Group all "unrecognized" faces into clusters; photographer can name a person once, and they are tagged across all 5,000+ photos in the event.
- **Privacy Controls:** Ability for a subject to "Request Removal" of their FaceID data, triggering an automated purge of their specific embeddings.

---

## 3. Semantic & Creative Search

### 3.1 Object, Color & Narrative Search
RawDrive enables searching beyond simple keywords, inspired by **Pic-Time 2026** AI capabilities:
- **Object Search:** "Cake cutting," "Red shoes," "Champagne toast."
- **Narrative/Context:** "First dance," "Emotional groom," "Bride laughing with friends."
- **Color Extraction:** "Find photos with #e63946 dominant color" (useful for matching brand aesthetics or themes).

### 3.2 Natural Language Queries (Gemini Pro)
Photographers can perform complex compound searches:
- *"Closeups of the bride in a red lehenga during the golden hour sunset"*
- *"Groom's family group shots where everyone is smiling"*

---

## 4. Smart Curate (In-Platform AI Culling)

### 4.1 Automated Selection (Aftershoot Benchmark)
RawDrive implements native, cloud-based culling to eliminate the need for external tools:
- **Focus/Sharpness Audit:** AI-detected focal point; photos with "missed focus" on faces are auto-rejected.
- **Eye & Expression Detection:**
    *   **Blink Detection:** Automatic rejection of photos where the subject's eyes are closed (except for intentional shots).
    *   **Expression Scoring:** Detects "Mouth Open (Awkward)" vs. "Genuine Smile."
- **Composition Analysis:** Rule-of-thirds compliance, head-room checks, and distracting background element detection.

### 4.2 Grouping & Key-Frame Selection
- **Burst Grouping:** AI identifies bursts (e.g., 10 shots of a kiss) and selects the single best "Key Frame" based on focus and expression.
- **Culling Workflow:**
    *   **AI Pass:** Hides rejects; photographer reviews "Keepers" first.
    *   **Manual Review:** One-click toggle between "AI Suggestion" and "Full Group."

---

## 5. Performance & Privacy
- **Processing Speed:** Target < 100ms for pgvector search results on a 10,000-image dataset.
- **Local Opt-Out:** In the Indian market, photographers can toggle "FaceID for Guests" ON/OFF per gallery to comply with local privacy expectations.
- **Metadata Sovereignty:** All EXIF/IPTC data is preserved; AI tags are stored as secondary sidecar metadata.
