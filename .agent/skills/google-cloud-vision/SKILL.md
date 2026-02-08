---
name: google-cloud-vision
description: Google Cloud Vision API integration for image analysis, face detection, OCR, and content labeling.
skills:
  - api-patterns
  - python-patterns
---

# Google Cloud Vision Skill

Integrates Google Vision features into applications, including image labeling, face detection, logo/landmark detection, OCR, and explicit content detection.

## 🚀 Quick Reference

- **Service**: `vision.googleapis.com`
- **Discovery Document**: [Vision v1 Discovery](https://vision.googleapis.com/$discovery/rest?version=v1)
- **Service Endpoint**: `https://vision.googleapis.com`

## 🏗️ Backend Architecture

In this project, Google Cloud Vision is integrated via a multi-provider AI architecture.

### Key Components

- **`CloudVisionProvider`**: [backend/src/app/services/ai/providers/cloud_vision_provider.py](file:///c:/Users/admin/Desktop/RawDrive2/backend/src/app/services/ai/providers/cloud_vision_provider.py)
  - Primary provider for face detection and label detection.
  - Handles client initialization with service account credentials.
  - Implements `detect_faces` and `detect_labels`.
- **`VisionService`**: [backend/src/app/services/vision_service.py](file:///c:/Users/admin/Desktop/RawDrive2/backend/src/app/services/vision_service.py)
  - Unified service for AI-powered vision tasks.
  - Coordinates analysis across different providers (including Gemini).

## 🛠️ REST Resources & Methods

### v1.images
- **`annotate`**: `POST /v1/images:annotate` - Batch image detection and annotation.
- **`asyncBatchAnnotate`**: `POST /v1/images:asyncBatchAnnotate` - Asynchronous batch annotation.

### v1.files
- **`annotate`**: `POST /v1/files:annotate` - Batch file detection (e.g., PDFs).
- **`asyncBatchAnnotate`**: `POST /v1/files:asyncBatchAnnotate` - Asynchronous generic file annotation.

### v1.projects.locations.productSets
- **`import`**: `POST /v1/{parent=projects/*/locations/*}/productSets:import` - Import reference images for Product Search.
- **`list`/`get`/`create`/`patch`/`delete`**: Standard CRUD for ProductSets.

### v1.operations
- **`get`**: `GET /v1/{name=operations/*}` - Monitor long-running operations.

## 💡 Best Practices

1. **Lazy Initialization**: Use lazy client creation (as seen in `CloudVisionProvider`) to allow the app to start even if credentials aren't configured yet.
2. **Rate Limiting**: Handle `RESOURCE_EXHAUSTED` (429) errors with exponential backoff.
3. **Coordinate Normalization**: Vision API returns coordinates in pixels or normalized (0-1). Ensure your implementation consistently handles coordinate mapping to your UI/Storage format.
4. **Image Pre-processing**: Resize large images (e.g., to 1024px) before sending to the API to reduce latency and cost.
5. **Deduplication**: Use request key generation and caching to prevent duplicate concurrent AI requests for the same image.

## 🔒 Security

- **Service Accounts**: Store credentials in `GOOGLE_APPLICATION_CREDENTIALS` or as a JSON secret managed by `AIProviderSettingsService`.
- **Multi-Tenant Isolation**: Always filter results by `workspace_id` when retrieving stored embeddings or analysis results.
