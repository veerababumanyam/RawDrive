# Design Document: Face Detection and Identification Service

## Overview

This design document describes the architecture and implementation of a comprehensive Face Detection and Identification service for RawDrive. The service provides automatic face detection, embedding-based identification, and clustering capabilities to enable face-based photo organization across galleries.

The system uses a multi-provider architecture with Google Cloud Vision as the primary provider and Google Gemini as a fallback, with all configuration managed through an admin interface to avoid hardcoded values. Face embeddings are stored using PostgreSQL's pgvector extension for efficient similarity search at scale.

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  Gallery View   │  │  Face Groups    │  │  Admin Settings Panel       │ │
│  │  (Face Tags)    │  │  Management UI  │  │  (Provider Configuration)   │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘ │
└───────────┼────────────────────┼───────────────────────────┼────────────────┘
            │                    │                           │
            ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Gateway                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  /api/v1/faces/*  │  /api/v1/face-groups/*  │  /api/v1/admin/ai-*   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
            │                    │                           │
            ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Service Layer                                      │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │ FaceDetection     │  │ FaceCluster       │  │ AdminSettings         │   │
│  │ Service           │  │ Service           │  │ Service               │   │
│  └─────────┬─────────┘  └─────────┬─────────┘  └───────────┬───────────┘   │
│            │                      │                        │               │
│            ▼                      │                        │               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                        Provider Manager                                │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │ │
│  │  │ CloudVision     │  │ Gemini          │  │ Circuit Breaker     │   │ │
│  │  │ Provider        │  │ Provider        │  │ & Health Monitor    │   │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
            │                      │                        │
            ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Data Layer                                         │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐   │
│  │ PostgreSQL        │  │ Redis             │  │ Object Storage        │   │
│  │ (pgvector)        │  │ (Job Queue)       │  │ (Thumbnails)          │   │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Face Detection Service                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      FaceDetectionService                            │   │
│  │  - detectFaces(photoId): Promise<FaceDetectionResult[]>             │   │
│  │  - processPhoto(photo: Photo): Promise<void>                        │   │
│  │  - reprocessPhoto(photoId, priority): Promise<JobId>                │   │
│  │  - getDetectionStatus(photoId): Promise<DetectionStatus>            │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│         ┌───────────────────────┼───────────────────────┐                  │
│         ▼                       ▼                       ▼                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │ ProviderManager │  │ EmbeddingService│  │ ThumbnailService        │    │
│  │                 │  │                 │  │                         │    │
│  │ - selectProvider│  │ - generateEmbed │  │ - generateThumbnail     │    │
│  │ - executeWithFB │  │ - normalizeEmbed│  │ - cropFaceRegion        │    │
│  │ - healthCheck   │  │ - compareEmbed  │  │ - resizeThumbnail       │    │
│  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘    │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         AI Providers                                 │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐  │   │
│  │  │ CloudVisionProvider │  │ GeminiProvider                      │  │   │
│  │  │                     │  │                                     │  │   │
│  │  │ - detectFaces()     │  │ - detectFaces()                     │  │   │
│  │  │ - getCredentials()  │  │ - getApiKey()                       │  │   │
│  │  │ - validateResponse()│  │ - parseResponse()                   │  │   │
│  │  └─────────────────────┘  └─────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        Face Cluster Service                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      FaceClusterService                              │   │
│  │  - assignToCluster(face: Face): Promise<FaceGroup>                  │   │
│  │  - findSimilarFaces(embedding, threshold): Promise<Face[]>          │   │
│  │  - mergeGroups(sourceId, targetId): Promise<FaceGroup>              │   │
│  │  - splitGroup(groupId, faceIds): Promise<FaceGroup>                 │   │
│  │  - recalculateCentroid(groupId): Promise<void>                      │   │
│  └──────────────────────────────┬──────────────────────────────────────┘   │
│                                 │                                           │
│         ┌───────────────────────┴───────────────────────┐                  │
│         ▼                                               ▼                  │
│  ┌─────────────────────────┐              ┌─────────────────────────────┐  │
│  │ FaceEmbeddingRepository │              │ FaceGroupRepository         │  │
│  │                         │              │                             │  │
│  │ - findSimilar(vector)   │              │ - create/update/delete      │  │
│  │ - bulkInsert(embeddings)│              │ - findByWorkspace           │  │
│  │ - updateEmbedding       │              │ - updateCentroid            │  │
│  └─────────────────────────┘              └─────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Core Interfaces

```typescript
// Face Detection Result from AI Provider
interface FaceDetectionResult {
  boundingBox: BoundingBox;
  confidence: number;
  landmarks?: FaceLandmark[];
  attributes?: FaceAttributes;
  rawProviderResponse?: unknown;
}

interface BoundingBox {
  x: number;      // Top-left X (percentage 0-100)
  y: number;      // Top-left Y (percentage 0-100)
  width: number;  // Width (percentage 0-100)
  height: number; // Height (percentage 0-100)
}

interface FaceLandmark {
  type: 'LEFT_EYE' | 'RIGHT_EYE' | 'NOSE_TIP' | 'MOUTH_LEFT' | 'MOUTH_RIGHT';
  position: { x: number; y: number };
}

interface FaceAttributes {
  rollAngle?: number;
  panAngle?: number;
  tiltAngle?: number;
  joyLikelihood?: LikelihoodLevel;
  sorrowLikelihood?: LikelihoodLevel;
}

type LikelihoodLevel = 'UNKNOWN' | 'VERY_UNLIKELY' | 'UNLIKELY' | 'POSSIBLE' | 'LIKELY' | 'VERY_LIKELY';

// Stored Face Entity
interface Face {
  id: string;
  workspaceId: string;
  photoId: string;
  faceGroupId: string | null;
  boundingBox: BoundingBox;
  confidence: number;
  embedding: number[] | null;  // 512-dimensional vector
  provider: string;
  detectionMetadata: Record<string, unknown>;
  thumbnailUrls: ThumbnailUrls;
  createdAt: Date;
  updatedAt: Date;
}

interface ThumbnailUrls {
  small: string;   // 64px
  medium: string;  // 128px
  large: string;   // 256px
}

// Face Group (Cluster)
interface FaceGroup {
  id: string;
  workspaceId: string;
  name: string | null;
  representativeFaceId: string | null;
  centroid: number[] | null;  // 512-dimensional vector
  faceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Provider Configuration
interface AIProviderConfig {
  id: string;
  providerName: 'cloud_vision' | 'gemini';
  credentialsEncrypted: Buffer | null;
  config: ProviderSpecificConfig;
  isEnabled: boolean;
  priority: number;
  rateLimitPerMinute: number;
  timeoutMs: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date | null;
}

interface CloudVisionConfig {
  projectId: string;
  serviceAccountEmail: string;
  maxResults: number;
}

interface GeminiConfig {
  model: string;
  maxOutputTokens: number;
  temperature: number;
}

type ProviderSpecificConfig = CloudVisionConfig | GeminiConfig;

// Detection Job
interface FaceDetectionJob {
  id: string;
  workspaceId: string;
  photoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  providerUsed: string | null;
  facesDetected: number | null;
  errorMessage: string | null;
  retryCount: number;
  priority: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// Similarity Search Result
interface SimilarFaceResult {
  face: Face;
  similarity: number;  // 0-1, higher is more similar
}
```

### Service Interfaces

```typescript
// Face Detection Service
interface IFaceDetectionService {
  // Core detection
  detectFaces(photoId: string, workspaceId: string): Promise<FaceDetectionResult[]>;
  processPhoto(photo: Photo): Promise<Face[]>;
  reprocessPhoto(photoId: string, priority?: number): Promise<string>;
  
  // Status
  getDetectionStatus(photoId: string): Promise<FaceDetectionJob | null>;
  getDetectionStats(workspaceId: string): Promise<DetectionStats>;
}

interface DetectionStats {
  totalPhotos: number;
  processedPhotos: number;
  pendingPhotos: number;
  failedPhotos: number;
  totalFacesDetected: number;
}

// Face Cluster Service
interface IFaceClusterService {
  // Clustering
  assignToCluster(face: Face, workspaceId: string): Promise<FaceGroup | null>;
  findSimilarFaces(embedding: number[], workspaceId: string, threshold?: number, limit?: number): Promise<SimilarFaceResult[]>;
  
  // Group management
  createGroup(workspaceId: string, name?: string): Promise<FaceGroup>;
  updateGroup(groupId: string, updates: Partial<FaceGroup>): Promise<FaceGroup>;
  deleteGroup(groupId: string): Promise<void>;
  mergeGroups(sourceGroupId: string, targetGroupId: string): Promise<FaceGroup>;
  splitGroup(groupId: string, faceIds: string[]): Promise<FaceGroup>;
  
  // Centroid management
  recalculateCentroid(groupId: string): Promise<void>;
}

// Provider Manager
interface IProviderManager {
  // Provider selection
  selectProvider(): Promise<IAIProvider>;
  executeWithFailover<T>(operation: (provider: IAIProvider) => Promise<T>): Promise<T>;
  
  // Health management
  checkHealth(providerName: string): Promise<HealthCheckResult>;
  getProviderStatus(): Promise<ProviderStatus[]>;
  
  // Configuration
  getProviderConfig(providerName: string): Promise<AIProviderConfig | null>;
  updateProviderConfig(providerName: string, config: Partial<AIProviderConfig>): Promise<void>;
}

interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  message: string;
}

interface ProviderStatus {
  name: string;
  isEnabled: boolean;
  healthStatus: string;
  priority: number;
}

// AI Provider Interface
interface IAIProvider {
  name: string;
  detectFaces(imageBuffer: Buffer, options?: DetectionOptions): Promise<FaceDetectionResult[]>;
  generateEmbedding?(faceImage: Buffer): Promise<number[]>;
  isHealthy(): Promise<boolean>;
}

interface DetectionOptions {
  maxFaces?: number;
  minConfidence?: number;
}

// Admin Settings Service
interface IAdminSettingsService {
  // Provider settings
  getProviders(): Promise<AIProviderConfig[]>;
  updateProvider(providerId: string, updates: ProviderUpdateInput): Promise<AIProviderConfig>;
  testProvider(providerId: string): Promise<HealthCheckResult>;
  
  // Face detection settings
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  getSettings(prefix: string): Promise<Record<string, string>>;
}

interface ProviderUpdateInput {
  credentials?: Record<string, unknown>;
  config?: Record<string, unknown>;
  isEnabled?: boolean;
  priority?: number;
  rateLimitPerMinute?: number;
  timeoutMs?: number;
}
```

### Repository Interfaces

```typescript
// Face Repository
interface IFaceRepository {
  create(face: Omit<Face, 'id' | 'createdAt' | 'updatedAt'>): Promise<Face>;
  findById(id: string, workspaceId: string): Promise<Face | null>;
  findByPhotoId(photoId: string, workspaceId: string): Promise<Face[]>;
  findByGroupId(groupId: string, workspaceId: string): Promise<Face[]>;
  update(id: string, updates: Partial<Face>): Promise<Face>;
  delete(id: string): Promise<void>;
  deleteByPhotoId(photoId: string): Promise<void>;
}

// Face Embedding Repository (pgvector operations)
interface IFaceEmbeddingRepository {
  findSimilar(
    embedding: number[],
    workspaceId: string,
    threshold: number,
    limit: number
  ): Promise<SimilarFaceResult[]>;
  
  bulkInsertEmbeddings(faces: Array<{ id: string; embedding: number[] }>): Promise<void>;
  updateEmbedding(faceId: string, embedding: number[]): Promise<void>;
}

// Face Group Repository
interface IFaceGroupRepository {
  create(group: Omit<FaceGroup, 'id' | 'createdAt' | 'updatedAt'>): Promise<FaceGroup>;
  findById(id: string, workspaceId: string): Promise<FaceGroup | null>;
  findByWorkspaceId(workspaceId: string, options?: PaginationOptions): Promise<FaceGroup[]>;
  update(id: string, updates: Partial<FaceGroup>): Promise<FaceGroup>;
  delete(id: string): Promise<void>;
  updateCentroid(id: string, centroid: number[]): Promise<void>;
  incrementFaceCount(id: string, delta: number): Promise<void>;
}
```

## Data Models

### Database Schema

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Faces table
CREATE TABLE faces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    face_group_id UUID REFERENCES face_groups(id) ON DELETE SET NULL,
    bounding_box JSONB NOT NULL,
    confidence DECIMAL(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    embedding vector(512),
    provider VARCHAR(50) NOT NULL,
    detection_metadata JSONB DEFAULT '{}',
    thumbnail_urls JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_bounding_box CHECK (
        bounding_box ? 'x' AND bounding_box ? 'y' AND 
        bounding_box ? 'width' AND bounding_box ? 'height'
    )
);

-- Indexes for faces
CREATE INDEX idx_faces_workspace ON faces(workspace_id);
CREATE INDEX idx_faces_photo ON faces(photo_id);
CREATE INDEX idx_faces_group ON faces(face_group_id);
CREATE INDEX idx_faces_confidence ON faces(workspace_id, confidence DESC);

-- pgvector index for similarity search (IVFFlat for large datasets)
CREATE INDEX idx_faces_embedding ON faces 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Face groups table
CREATE TABLE face_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255),
    representative_face_id UUID REFERENCES faces(id) ON DELETE SET NULL,
    centroid vector(512),
    face_count INTEGER NOT NULL DEFAULT 0 CHECK (face_count >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for face_groups
CREATE INDEX idx_face_groups_workspace ON face_groups(workspace_id);
CREATE INDEX idx_face_groups_centroid ON face_groups 
    USING ivfflat (centroid vector_cosine_ops)
    WITH (lists = 100);

-- AI provider settings table
CREATE TABLE ai_provider_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_name VARCHAR(50) NOT NULL UNIQUE,
    credentials_encrypted BYTEA,
    config JSONB NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    priority INTEGER NOT NULL DEFAULT 0,
    rate_limit_per_minute INTEGER DEFAULT 1800,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    health_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
    last_health_check TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Face detection jobs table
CREATE TABLE face_detection_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    provider_used VARCHAR(50),
    faces_detected INTEGER,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_photo_job UNIQUE (photo_id)
);

-- Indexes for detection jobs
CREATE INDEX idx_detection_jobs_status ON face_detection_jobs(status, priority DESC, created_at);
CREATE INDEX idx_detection_jobs_workspace ON face_detection_jobs(workspace_id);

-- Application settings table (for face detection config)
CREATE TABLE IF NOT EXISTS application_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Face group history for undo support
CREATE TABLE face_group_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    face_id UUID,
    source_group_id UUID,
    target_group_id UUID,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX idx_face_group_history_workspace ON face_group_history(workspace_id, created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_faces_updated_at BEFORE UPDATE ON faces
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_face_groups_updated_at BEFORE UPDATE ON face_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_provider_settings_updated_at BEFORE UPDATE ON ai_provider_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Entity Relationships

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   workspaces    │       │     photos      │       │   galleries     │
│                 │       │                 │       │                 │
│ id (PK)         │◄──────│ workspace_id    │       │ id (PK)         │
│ name            │       │ gallery_id      │──────►│ workspace_id    │
│ ...             │       │ id (PK)         │       │ ...             │
└────────┬────────┘       └────────┬────────┘       └─────────────────┘
         │                         │
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│   face_groups   │       │     faces       │
│                 │       │                 │
│ id (PK)         │◄──────│ face_group_id   │
│ workspace_id    │       │ photo_id        │
│ name            │       │ workspace_id    │
│ centroid        │       │ id (PK)         │
│ face_count      │       │ bounding_box    │
│ representative_ │       │ confidence      │
│   face_id       │──────►│ embedding       │
└─────────────────┘       │ provider        │
                          │ thumbnail_urls  │
                          └─────────────────┘
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*



Based on the prework analysis, the following correctness properties have been identified:

### Property 1: Face Detection Job Creation
*For any* photo uploaded to a gallery, a face detection job SHALL be created in the queue with the correct photo_id and workspace_id.
**Validates: Requirements 1.1**

### Property 2: Face Embedding Generation
*For any* detected face, the generated embedding SHALL be a 512-dimensional vector with L2 norm equal to 1 (normalized).
**Validates: Requirements 1.3, 13.7**

### Property 3: Face Data Persistence
*For any* completed face detection, the stored face record SHALL contain valid bounding_box (with x, y, width, height), confidence score (0-1), and embedding vector.
**Validates: Requirements 1.4**

### Property 4: Provider Failover
*For any* detection request where the primary provider fails, the system SHALL successfully complete the request using the fallback provider.
**Validates: Requirements 1.5**

### Property 5: Multi-Face Independence
*For any* photo containing N detected faces, the system SHALL create exactly N independent face records, each with unique IDs and correct photo_id reference.
**Validates: Requirements 1.6**

### Property 6: Low Confidence Exclusion
*For any* detected face with confidence below the configured threshold, the face SHALL NOT be automatically assigned to any face group.
**Validates: Requirements 1.8**

### Property 7: Cluster Assignment
*For any* new face embedding, if similarity to an existing cluster centroid exceeds the threshold, the face SHALL be assigned to that cluster; otherwise, a new cluster SHALL be created.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 8: Centroid Maintenance
*For any* face group with at least one face, the centroid SHALL be the normalized mean of all member face embeddings, and SHALL be recalculated after any membership change.
**Validates: Requirements 2.5, 2.6**

### Property 9: Cluster Merge Correctness
*For any* merge operation of source cluster into target cluster, all faces from source SHALL be reassigned to target, source cluster SHALL be deleted, and target cluster's name and representative SHALL be preserved.
**Validates: Requirements 2.7, 16.5**

### Property 10: Cluster Split Correctness
*For any* split operation removing faces from a cluster, the specified faces SHALL be moved to a new cluster, and both clusters SHALL have valid centroids.
**Validates: Requirements 2.8**

### Property 11: Environment Variable Fallback
*For any* provider configuration request where admin settings are not configured, the system SHALL use values from environment variables.
**Validates: Requirements 3.6**

### Property 12: Credential Encryption
*For any* stored provider credential, the value in the database SHALL be encrypted (not plaintext) and decryptable only with the application's encryption key.
**Validates: Requirements 3.7**

### Property 13: Face Group Filtering
*For any* face group filter applied to a gallery, all returned photos SHALL contain at least one face belonging to that group.
**Validates: Requirements 4.2**

### Property 14: Multi-Face Photo Inclusion
*For any* photo containing faces from multiple groups, the photo SHALL appear in the filter results for ALL those groups.
**Validates: Requirements 4.5**

### Property 15: Workspace Data Isolation
*For any* face data query, results SHALL only contain faces where workspace_id matches the requesting workspace, and similarity searches SHALL never return faces from other workspaces.
**Validates: Requirements 6.1, 6.2, 14.7**

### Property 16: Workspace Cascade Delete
*For any* deleted workspace, all associated faces, face_groups, and face_detection_jobs SHALL be deleted.
**Validates: Requirements 6.3**

### Property 17: Similarity Search Ordering
*For any* similarity search result set, faces SHALL be ordered by descending similarity score.
**Validates: Requirements 8.4, 12.3**

### Property 18: Face Detection Result Round-Trip
*For any* valid FaceDetectionResult object, serializing to JSON and deserializing back SHALL produce an object equivalent to the original.
**Validates: Requirements 9.3**

### Property 19: Circuit Breaker Behavior
*For any* provider that has failed more than the configured threshold times within the window, the circuit breaker SHALL be open and the provider SHALL be excluded from selection until recovery.
**Validates: Requirements 10.3, 10.4**

### Property 20: Thumbnail Generation
*For any* detected face, the system SHALL generate thumbnails at all three sizes (64px, 128px, 256px) with valid URLs stored in thumbnail_urls.
**Validates: Requirements 11.1, 11.3**

### Property 21: Detection Disabled Behavior
*For any* workspace with face detection disabled, new photo uploads SHALL NOT create face detection jobs.
**Validates: Requirements 14.2**

### Property 22: Face Group Deletion Preservation
*For any* deleted face group, all member faces SHALL remain in the database with face_group_id set to NULL.
**Validates: Requirements 16.2**

### Property 23: Photo Move Face Preservation
*For any* photo moved between galleries, all associated face records SHALL remain intact with unchanged face_group_id assignments.
**Validates: Requirements 17.7**

## Error Handling

### Error Types and Codes

```typescript
enum FaceDetectionErrorCode {
  // Provider errors
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  PROVIDER_TIMEOUT = 'PROVIDER_TIMEOUT',
  PROVIDER_INVALID_RESPONSE = 'PROVIDER_INVALID_RESPONSE',
  ALL_PROVIDERS_FAILED = 'ALL_PROVIDERS_FAILED',
  
  // Detection errors
  INVALID_IMAGE_FORMAT = 'INVALID_IMAGE_FORMAT',
  IMAGE_TOO_SMALL = 'IMAGE_TOO_SMALL',
  IMAGE_CORRUPTED = 'IMAGE_CORRUPTED',
  DETECTION_FAILED = 'DETECTION_FAILED',
  
  // Cluster errors
  FACE_GROUP_NOT_FOUND = 'FACE_GROUP_NOT_FOUND',
  FACE_NOT_FOUND = 'FACE_NOT_FOUND',
  INVALID_MERGE_OPERATION = 'INVALID_MERGE_OPERATION',
  INVALID_SPLIT_OPERATION = 'INVALID_SPLIT_OPERATION',
  
  // Authorization errors
  WORKSPACE_ACCESS_DENIED = 'WORKSPACE_ACCESS_DENIED',
  CROSS_WORKSPACE_ACCESS = 'CROSS_WORKSPACE_ACCESS',
  
  // Configuration errors
  PROVIDER_NOT_CONFIGURED = 'PROVIDER_NOT_CONFIGURED',
  INVALID_CONFIGURATION = 'INVALID_CONFIGURATION',
}

class FaceDetectionError extends Error {
  constructor(
    public code: FaceDetectionErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FaceDetectionError';
  }
}
```

### Circuit Breaker Implementation

```typescript
// =============================================================================
// CIRCUIT BREAKER - PREVENTS CASCADING FAILURES
// =============================================================================

/**
 * Configuration for circuit breaker behavior.
 * Tune these values based on provider characteristics and SLAs.
 */
interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening the circuit */
  failureThreshold: number;
  
  /** Time in ms to wait before attempting recovery (half-open state) */
  recoveryTimeMs: number;
  
  /** Number of successful requests needed in half-open to close circuit */
  halfOpenRequests: number;
}

/**
 * Circuit breaker states:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Failures exceeded threshold, requests are rejected immediately
 * - HALF_OPEN: Testing recovery, limited requests allowed through
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Implements the Circuit Breaker pattern to prevent cascading failures.
 * 
 * When a provider fails repeatedly, the circuit "opens" and immediately
 * rejects requests without calling the provider. After a recovery period,
 * it enters "half-open" state to test if the provider has recovered.
 * 
 * @example
 * const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeMs: 60000, halfOpenRequests: 3 });
 * const result = await breaker.execute(() => provider.detectFaces(image));
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private halfOpenSuccesses = 0;
  private halfOpenFailures = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  /**
   * Executes an operation through the circuit breaker.
   * 
   * @param operation - The async operation to execute
   * @returns The result of the operation
   * @throws FaceDetectionError if circuit is open
   * @throws The original error if operation fails
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check if we should attempt recovery from open state
    if (this.state === 'open') {
      if (this.shouldAttemptRecovery()) {
        // Transition to half-open to test recovery
        this.transitionTo('half-open');
      } else {
        // Circuit is open - fail fast without calling provider
        throw new FaceDetectionError(
          FaceDetectionErrorCode.PROVIDER_UNAVAILABLE,
          'Circuit breaker is open - provider temporarily unavailable',
          {
            userMessage: 'This service is temporarily unavailable. Please try again in a moment.',
            details: {
              state: this.state,
              lastFailure: this.lastFailureTime?.toISOString(),
              recoveryIn: this.getRecoveryTimeRemaining(),
            },
          }
        );
      }
    }

    // Execute the operation and track success/failure
    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Checks if the circuit breaker is currently open.
   * Used by ProviderManager to skip unavailable providers.
   */
  isOpen(): boolean {
    // Check for recovery opportunity before reporting state
    if (this.state === 'open' && this.shouldAttemptRecovery()) {
      this.transitionTo('half-open');
    }
    return this.state === 'open';
  }

  /**
   * Returns the current state of the circuit breaker.
   * Useful for monitoring and debugging.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Determines if enough time has passed to attempt recovery.
   */
  private shouldAttemptRecovery(): boolean {
    if (!this.lastFailureTime) return false;
    
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return elapsed >= this.config.recoveryTimeMs;
  }

  /**
   * Calculates remaining time until recovery attempt (in ms).
   */
  private getRecoveryTimeRemaining(): number {
    if (!this.lastFailureTime) return 0;
    
    const elapsed = Date.now() - this.lastFailureTime.getTime();
    return Math.max(0, this.config.recoveryTimeMs - elapsed);
  }

  /**
   * Records a successful operation.
   * In half-open state, tracks progress toward closing the circuit.
   */
  private recordSuccess(): void {
    if (this.state === 'half-open') {
      this.halfOpenSuccesses++;
      
      // Check if we've had enough successes to close the circuit
      if (this.halfOpenSuccesses >= this.config.halfOpenRequests) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Records a failed operation.
   * Tracks failures and opens circuit when threshold is exceeded.
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.state === 'half-open') {
      // Any failure in half-open immediately reopens the circuit
      this.halfOpenFailures++;
      this.transitionTo('open');
    } else if (this.failureCount >= this.config.failureThreshold) {
      // Threshold exceeded - open the circuit
      this.transitionTo('open');
    }
  }

  /**
   * Transitions to a new state with appropriate logging and reset.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    // Reset counters based on new state
    if (newState === 'closed') {
      this.failureCount = 0;
      this.halfOpenSuccesses = 0;
      this.halfOpenFailures = 0;
    } else if (newState === 'half-open') {
      this.halfOpenSuccesses = 0;
      this.halfOpenFailures = 0;
    }

    logger.info('Circuit breaker state transition', {
      previousState,
      newState,
      failureCount: this.failureCount,
      lastFailure: this.lastFailureTime?.toISOString(),
    });
  }

  /**
   * Manually resets the circuit breaker to closed state.
   * Use with caution - typically for admin override scenarios.
   */
  reset(): void {
    this.transitionTo('closed');
    this.lastFailureTime = null;
  }
}
```

### Retry Strategy with Exponential Backoff

```typescript
// =============================================================================
// RETRY STRATEGY - HANDLES TRANSIENT FAILURES
// =============================================================================

/**
 * Configuration for retry behavior.
 */
interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  
  /** Initial delay before first retry (ms) */
  initialDelayMs: number;
  
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  
  /** Optional jitter factor (0-1) to prevent thundering herd */
  jitterFactor?: number;
}

/**
 * Default retry configuration for face detection operations.
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Executes an operation with automatic retry on transient failures.
 * Uses exponential backoff with optional jitter to prevent thundering herd.
 * 
 * @param operation - The async operation to execute
 * @param config - Retry configuration
 * @param isRetryable - Function to determine if an error is retryable
 * @returns The result of the successful operation
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * const result = await withRetry(
 *   () => provider.detectFaces(image),
 *   { maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2 },
 *   (error) => error.code === 'RATE_LIMITED' || error.code === 'TIMEOUT'
 * );
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  isRetryable: (error: Error) => boolean = isTransientError
): Promise<T> {
  let lastError: Error;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Log retry attempts (skip first attempt)
      if (attempt > 0) {
        logger.debug('Retrying operation', {
          attempt,
          maxRetries: config.maxRetries,
          delayMs: delay,
        });
      }

      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Check if we should retry
      const shouldRetry = isRetryable(lastError) && attempt < config.maxRetries;
      
      if (!shouldRetry) {
        // Either not retryable or out of retries
        if (attempt > 0) {
          logger.warn('Retry exhausted or error not retryable', {
            attempt,
            maxRetries: config.maxRetries,
            error: lastError.message,
            retryable: isRetryable(lastError),
          });
        }
        throw lastError;
      }

      // Calculate delay with jitter
      const jitter = config.jitterFactor 
        ? delay * config.jitterFactor * Math.random()
        : 0;
      const actualDelay = Math.min(delay + jitter, config.maxDelayMs);

      logger.debug('Operation failed, will retry', {
        attempt,
        error: lastError.message,
        nextRetryIn: actualDelay,
      });

      // Wait before next retry
      await sleep(actualDelay);
      
      // Increase delay for next iteration (exponential backoff)
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

/**
 * Determines if an error is transient and worth retrying.
 * 
 * Retryable errors:
 * - Rate limiting (429)
 * - Timeouts
 * - Temporary network issues
 * - Provider temporary unavailability
 * 
 * Non-retryable errors:
 * - Invalid input (400)
 * - Authentication failures (401, 403)
 * - Not found (404)
 * - Permanent provider errors
 */
function isTransientError(error: Error): boolean {
  // Check for FaceDetectionError with specific codes
  if (error instanceof FaceDetectionError) {
    const retryableCodes = [
      FaceDetectionErrorCode.PROVIDER_RATE_LIMITED,
      FaceDetectionErrorCode.PROVIDER_TIMEOUT,
      FaceDetectionErrorCode.PROVIDER_UNAVAILABLE,
    ];
    return retryableCodes.includes(error.code);
  }

  // Check for HTTP status codes in generic errors
  const httpStatus = (error as any).status || (error as any).statusCode;
  if (httpStatus) {
    // 429 (rate limited), 502-504 (gateway errors) are retryable
    return httpStatus === 429 || (httpStatus >= 502 && httpStatus <= 504);
  }

  // Check for network errors
  const networkErrorCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE'];
  if ((error as any).code && networkErrorCodes.includes((error as any).code)) {
    return true;
  }

  // Default to not retrying unknown errors
  return false;
}

/**
 * Utility function for async sleep.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Testing Strategy

### Testing Framework

- **Unit Tests**: Vitest for TypeScript unit tests
- **Property-Based Tests**: fast-check for property-based testing
- **Integration Tests**: Supertest for API testing
- **Database Tests**: Test containers for PostgreSQL with pgvector

### Unit Tests

Unit tests focus on specific examples and edge cases:

1. **Provider Tests**
   - Cloud Vision response parsing
   - Gemini response parsing
   - Error handling for malformed responses
   - Credential loading from config vs environment

2. **Clustering Tests**
   - Centroid calculation with known embeddings
   - Similarity threshold boundary cases
   - Merge operation with empty groups
   - Split operation validation

3. **Serialization Tests**
   - JSON serialization of all data types
   - Schema validation on deserialization
   - Handling of optional fields

### Property-Based Tests

Property tests verify universal properties across many generated inputs:

1. **Embedding Properties**
   - All embeddings are normalized (L2 norm = 1)
   - Embedding dimension is always 512

2. **Clustering Properties**
   - Centroid is always the mean of member embeddings
   - Similarity search results are always ordered
   - Workspace isolation is never violated

3. **Round-Trip Properties**
   - FaceDetectionResult serialization round-trip
   - BoundingBox serialization round-trip
   - Face entity serialization round-trip

4. **Invariant Properties**
   - Face count in group matches actual count
   - All faces have valid workspace_id
   - All faces reference existing photos

### Test Configuration

```typescript
// Property test configuration
const propertyTestConfig = {
  numRuns: 100,           // Minimum iterations per property
  seed: undefined,        // Random seed for reproducibility
  verbose: true,          // Log failing examples
};

// Test tagging format
// **Feature: face-detection-service, Property N: [property_text]**
```

### Integration Tests

1. **API Endpoint Tests**
   - All CRUD operations for faces and face groups
   - Authentication and authorization
   - Pagination and filtering

2. **Background Job Tests**
   - Job creation on photo upload
   - Job processing and completion
   - Retry behavior on failure

3. **Provider Integration Tests**
   - Real provider calls (with test images)
   - Failover behavior
   - Rate limiting handling

## Implementation Notes

### Code Quality Standards

All implementations MUST follow these standards:
- **Modularity**: Single responsibility principle, dependency injection
- **Error Handling**: Typed errors, error boundaries, graceful degradation
- **User-Friendly Messages**: Clear, actionable error messages for end users
- **Inline Comments**: Document complex logic, business rules, and edge cases
- **Best Practices**: TypeScript strict mode, immutability, async/await patterns

### Error Handling Architecture

```typescript
// =============================================================================
// ERROR TYPES AND USER-FRIENDLY MESSAGES
// =============================================================================

/**
 * Base error class for all face detection errors.
 * Provides structured error information with user-friendly messages.
 */
export class FaceDetectionError extends Error {
  /** Unique error code for programmatic handling */
  public readonly code: FaceDetectionErrorCode;
  
  /** HTTP status code for API responses */
  public readonly httpStatus: number;
  
  /** User-friendly message safe to display in UI */
  public readonly userMessage: string;
  
  /** Technical details for logging (not shown to users) */
  public readonly details?: Record<string, unknown>;
  
  /** Correlation ID for tracing across services */
  public readonly correlationId?: string;

  constructor(
    code: FaceDetectionErrorCode,
    technicalMessage: string,
    options?: {
      userMessage?: string;
      httpStatus?: number;
      details?: Record<string, unknown>;
      correlationId?: string;
      cause?: Error;
    }
  ) {
    super(technicalMessage);
    this.name = 'FaceDetectionError';
    this.code = code;
    this.httpStatus = options?.httpStatus ?? getDefaultHttpStatus(code);
    this.userMessage = options?.userMessage ?? getDefaultUserMessage(code);
    this.details = options?.details;
    this.correlationId = options?.correlationId;
    
    // Preserve original error stack for debugging
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /**
   * Creates a safe response object for API endpoints.
   * Excludes sensitive technical details from user-facing responses.
   */
  toApiResponse(): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        correlationId: this.correlationId,
      },
    };
  }
}

/**
 * Maps error codes to user-friendly messages.
 * These messages are safe to display in the UI and help users understand
 * what went wrong and what they can do about it.
 */
function getDefaultUserMessage(code: FaceDetectionErrorCode): string {
  const messages: Record<FaceDetectionErrorCode, string> = {
    // Provider errors - explain the issue and suggest retry
    [FaceDetectionErrorCode.PROVIDER_UNAVAILABLE]: 
      'Face detection service is temporarily unavailable. Please try again in a few minutes.',
    [FaceDetectionErrorCode.PROVIDER_RATE_LIMITED]: 
      'Too many requests. Please wait a moment before trying again.',
    [FaceDetectionErrorCode.PROVIDER_TIMEOUT]: 
      'Face detection is taking longer than expected. Please try again.',
    [FaceDetectionErrorCode.PROVIDER_INVALID_RESPONSE]: 
      'Unable to process the image. Please try with a different photo.',
    [FaceDetectionErrorCode.ALL_PROVIDERS_FAILED]: 
      'Face detection is currently unavailable. Our team has been notified.',

    // Detection errors - help user understand image requirements
    [FaceDetectionErrorCode.INVALID_IMAGE_FORMAT]: 
      'This image format is not supported. Please use JPEG, PNG, WebP, or HEIC.',
    [FaceDetectionErrorCode.IMAGE_TOO_SMALL]: 
      'This image is too small for face detection. Please use a larger image (minimum 100x100 pixels).',
    [FaceDetectionErrorCode.IMAGE_CORRUPTED]: 
      'This image appears to be corrupted. Please try uploading it again or use a different image.',
    [FaceDetectionErrorCode.DETECTION_FAILED]: 
      'Unable to detect faces in this image. Please try with a clearer photo.',

    // Cluster errors - guide user on face group operations
    [FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND]: 
      'This face group no longer exists. It may have been deleted.',
    [FaceDetectionErrorCode.FACE_NOT_FOUND]: 
      'This face could not be found. It may have been removed.',
    [FaceDetectionErrorCode.INVALID_MERGE_OPERATION]: 
      'Cannot merge these face groups. Please select two different groups.',
    [FaceDetectionErrorCode.INVALID_SPLIT_OPERATION]: 
      'Cannot split these faces. Please select faces that belong to the same group.',

    // Authorization errors - clear access denial messages
    [FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED]: 
      'You do not have permission to access face data in this workspace.',
    [FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS]: 
      'You cannot access face data from another workspace.',

    // Configuration errors - admin-focused messages
    [FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED]: 
      'Face detection has not been configured. Please contact your administrator.',
    [FaceDetectionErrorCode.INVALID_CONFIGURATION]: 
      'Face detection configuration is invalid. Please contact your administrator.',
  };

  return messages[code] ?? 'An unexpected error occurred. Please try again.';
}

/**
 * Maps error codes to appropriate HTTP status codes.
 */
function getDefaultHttpStatus(code: FaceDetectionErrorCode): number {
  const statusMap: Partial<Record<FaceDetectionErrorCode, number>> = {
    [FaceDetectionErrorCode.PROVIDER_RATE_LIMITED]: 429,
    [FaceDetectionErrorCode.PROVIDER_UNAVAILABLE]: 503,
    [FaceDetectionErrorCode.PROVIDER_TIMEOUT]: 504,
    [FaceDetectionErrorCode.ALL_PROVIDERS_FAILED]: 503,
    [FaceDetectionErrorCode.INVALID_IMAGE_FORMAT]: 400,
    [FaceDetectionErrorCode.IMAGE_TOO_SMALL]: 400,
    [FaceDetectionErrorCode.IMAGE_CORRUPTED]: 400,
    [FaceDetectionErrorCode.FACE_GROUP_NOT_FOUND]: 404,
    [FaceDetectionErrorCode.FACE_NOT_FOUND]: 404,
    [FaceDetectionErrorCode.INVALID_MERGE_OPERATION]: 400,
    [FaceDetectionErrorCode.INVALID_SPLIT_OPERATION]: 400,
    [FaceDetectionErrorCode.WORKSPACE_ACCESS_DENIED]: 403,
    [FaceDetectionErrorCode.CROSS_WORKSPACE_ACCESS]: 403,
    [FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED]: 503,
    [FaceDetectionErrorCode.INVALID_CONFIGURATION]: 500,
  };

  return statusMap[code] ?? 500;
}
```

### Error Boundary Middleware

```typescript
// =============================================================================
// ERROR BOUNDARY FOR API ROUTES
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { generateCorrelationId } from '../utils/correlation';

/**
 * Express error boundary middleware for face detection routes.
 * Catches all errors, logs them appropriately, and returns user-friendly responses.
 * 
 * Usage: app.use('/api/v1/faces', faceRoutes, faceDetectionErrorBoundary);
 */
export function faceDetectionErrorBoundary(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Generate correlation ID for tracing if not already present
  const correlationId = req.headers['x-correlation-id'] as string 
    ?? generateCorrelationId();

  // Handle known FaceDetectionError types
  if (error instanceof FaceDetectionError) {
    // Log with appropriate level based on error type
    const logLevel = error.httpStatus >= 500 ? 'error' : 'warn';
    logger[logLevel]('Face detection error', {
      code: error.code,
      message: error.message,
      correlationId,
      workspaceId: req.user?.workspaceId,
      userId: req.user?.id,
      path: req.path,
      details: error.details,
      stack: error.httpStatus >= 500 ? error.stack : undefined,
    });

    res.status(error.httpStatus).json({
      success: false,
      error: {
        code: error.code,
        message: error.userMessage,
        correlationId,
      },
    });
    return;
  }

  // Handle unexpected errors - log full details but return generic message
  logger.error('Unexpected error in face detection', {
    message: error.message,
    correlationId,
    workspaceId: req.user?.workspaceId,
    userId: req.user?.id,
    path: req.path,
    stack: error.stack,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again or contact support.',
      correlationId,
    },
  });
}

/**
 * Async route handler wrapper that catches errors and forwards to error boundary.
 * Eliminates need for try-catch in every route handler.
 * 
 * Usage: router.get('/faces', asyncHandler(faceController.list));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### Provider Manager Implementation

```typescript
// =============================================================================
// PROVIDER MANAGER - HANDLES PROVIDER SELECTION AND FAILOVER
// =============================================================================

import { injectable, inject } from 'tsyringe';
import { logger } from '../utils/logger';

/**
 * Manages AI provider selection, failover, and health monitoring.
 * 
 * Key responsibilities:
 * - Select the best available provider based on priority and health
 * - Execute operations with automatic failover on failure
 * - Monitor provider health and manage circuit breakers
 * - Load configuration from admin settings with env var fallback
 */
@injectable()
export class ProviderManager implements IProviderManager {
  // Provider instances keyed by provider name
  private readonly providers: Map<string, IAIProvider> = new Map();
  
  // Circuit breakers for each provider to prevent cascading failures
  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();

  constructor(
    @inject('IAdminSettingsService') 
    private readonly adminSettingsService: IAdminSettingsService,
    @inject('IConfigurationService')
    private readonly configService: IConfigurationService
  ) {
    // Initialize providers on construction
    this.initializeProviders();
  }

  /**
   * Initializes all configured providers with their circuit breakers.
   * Called once during service startup.
   */
  private async initializeProviders(): Promise<void> {
    // Initialize Cloud Vision provider
    const cloudVisionProvider = new CloudVisionProvider(this.configService);
    this.providers.set('cloud_vision', cloudVisionProvider);
    this.circuitBreakers.set('cloud_vision', new CircuitBreaker({
      failureThreshold: 5,      // Open after 5 consecutive failures
      recoveryTimeMs: 60000,    // Try recovery after 1 minute
      halfOpenRequests: 3,      // Allow 3 test requests in half-open state
    }));

    // Initialize Gemini provider
    const geminiProvider = new GeminiProvider(this.configService);
    this.providers.set('gemini', geminiProvider);
    this.circuitBreakers.set('gemini', new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeMs: 60000,
      halfOpenRequests: 3,
    }));

    logger.info('AI providers initialized', {
      providers: Array.from(this.providers.keys()),
    });
  }

  /**
   * Selects the best available provider based on priority and health status.
   * 
   * Selection criteria (in order):
   * 1. Provider must be enabled in configuration
   * 2. Provider's circuit breaker must not be open
   * 3. Lower priority number = higher preference
   * 
   * @throws FaceDetectionError if no healthy providers are available
   */
  async selectProvider(): Promise<IAIProvider> {
    const configs = await this.getEnabledProviders();
    
    // Sort by priority (lower number = higher priority)
    configs.sort((a, b) => a.priority - b.priority);

    for (const config of configs) {
      const breaker = this.circuitBreakers.get(config.providerName);
      
      // Skip providers with open circuit breakers
      if (breaker?.isOpen()) {
        logger.debug('Skipping provider due to open circuit breaker', {
          provider: config.providerName,
        });
        continue;
      }
      
      const provider = this.providers.get(config.providerName);
      if (provider) {
        logger.debug('Selected provider', { provider: config.providerName });
        return provider;
      }
    }

    // No healthy providers available - this is a critical error
    throw new FaceDetectionError(
      FaceDetectionErrorCode.ALL_PROVIDERS_FAILED,
      'No healthy providers available for face detection',
      {
        userMessage: 'Face detection is currently unavailable. Our team has been notified.',
        details: {
          enabledProviders: configs.map(c => c.providerName),
          circuitBreakerStates: Object.fromEntries(
            Array.from(this.circuitBreakers.entries()).map(
              ([name, breaker]) => [name, breaker.getState()]
            )
          ),
        },
      }
    );
  }

  /**
   * Executes an operation with automatic failover to backup providers.
   * 
   * Failover behavior:
   * 1. Try primary provider (lowest priority number)
   * 2. On failure, record in circuit breaker and try next provider
   * 3. Continue until success or all providers exhausted
   * 4. Throw aggregated error if all providers fail
   * 
   * @param operation - The operation to execute with a provider
   * @returns The result of the successful operation
   * @throws FaceDetectionError if all providers fail
   */
  async executeWithFailover<T>(
    operation: (provider: IAIProvider) => Promise<T>
  ): Promise<T> {
    const configs = await this.getEnabledProviders();
    configs.sort((a, b) => a.priority - b.priority);

    // Track errors from each provider for debugging
    const errors: Array<{ provider: string; error: Error }> = [];

    for (const config of configs) {
      const provider = this.providers.get(config.providerName);
      const breaker = this.circuitBreakers.get(config.providerName);

      // Skip if provider or breaker not initialized
      if (!provider || !breaker) {
        logger.warn('Provider not properly initialized', {
          provider: config.providerName,
        });
        continue;
      }

      try {
        // Execute through circuit breaker for failure tracking
        const result = await breaker.execute(() => operation(provider));
        
        // Log successful failover if this wasn't the first provider
        if (errors.length > 0) {
          logger.info('Operation succeeded after failover', {
            successfulProvider: config.providerName,
            failedProviders: errors.map(e => e.provider),
          });
        }
        
        return result;
      } catch (error) {
        // Record error and continue to next provider
        errors.push({ provider: config.providerName, error: error as Error });
        
        logger.warn('Provider failed, attempting failover', {
          failedProvider: config.providerName,
          error: (error as Error).message,
          remainingProviders: configs
            .slice(configs.indexOf(config) + 1)
            .map(c => c.providerName),
        });
      }
    }

    // All providers failed - throw comprehensive error
    throw new FaceDetectionError(
      FaceDetectionErrorCode.ALL_PROVIDERS_FAILED,
      `All ${errors.length} providers failed for face detection`,
      {
        userMessage: 'Face detection is temporarily unavailable. Please try again later.',
        details: {
          providerErrors: errors.map(e => ({
            provider: e.provider,
            error: e.error.message,
          })),
        },
      }
    );
  }

  /**
   * Retrieves enabled provider configurations from admin settings.
   * Falls back to environment variables if admin settings not configured.
   */
  private async getEnabledProviders(): Promise<AIProviderConfig[]> {
    try {
      const providers = await this.adminSettingsService.getProviders();
      const enabled = providers.filter(p => p.isEnabled);
      
      if (enabled.length > 0) {
        return enabled;
      }
      
      // No providers configured in admin - use defaults from env
      logger.debug('No providers in admin settings, using environment defaults');
      return this.getDefaultProviderConfigs();
    } catch (error) {
      // Admin settings unavailable - fall back to env vars
      logger.warn('Failed to load provider settings, using defaults', {
        error: (error as Error).message,
      });
      return this.getDefaultProviderConfigs();
    }
  }

  /**
   * Creates default provider configurations from environment variables.
   * Used as fallback when admin settings are not configured.
   */
  private getDefaultProviderConfigs(): AIProviderConfig[] {
    const configs: AIProviderConfig[] = [];

    // Check for Cloud Vision credentials
    if (process.env.GOOGLE_CLOUD_VISION_CREDENTIALS) {
      configs.push({
        id: 'default-cloud-vision',
        providerName: 'cloud_vision',
        credentialsEncrypted: null, // Loaded from file path in env
        config: {},
        isEnabled: true,
        priority: 0, // Primary provider
        rateLimitPerMinute: 1800,
        timeoutMs: 30000,
        healthStatus: 'unknown',
        lastHealthCheck: null,
      });
    }

    // Check for Gemini API key
    if (process.env.GEMINI_API_KEY) {
      configs.push({
        id: 'default-gemini',
        providerName: 'gemini',
        credentialsEncrypted: null, // Loaded from env
        config: {
          model: process.env.GEMINI_MODEL_FAST || 'gemini-2.5-flash',
        },
        isEnabled: true,
        priority: 1, // Fallback provider
        rateLimitPerMinute: 60,
        timeoutMs: 60000,
        healthStatus: 'unknown',
        lastHealthCheck: null,
      });
    }

    return configs;
  }

  /**
   * Performs health check on a specific provider.
   * Updates circuit breaker state based on result.
   */
  async checkHealth(providerName: string): Promise<HealthCheckResult> {
    const provider = this.providers.get(providerName);
    
    if (!provider) {
      return {
        healthy: false,
        latencyMs: 0,
        message: `Provider '${providerName}' not found`,
      };
    }

    const startTime = Date.now();
    
    try {
      const isHealthy = await provider.isHealthy();
      const latencyMs = Date.now() - startTime;

      // Update provider health status in database
      await this.adminSettingsService.updateProviderHealth(
        providerName,
        isHealthy ? 'healthy' : 'unhealthy'
      );

      return {
        healthy: isHealthy,
        latencyMs,
        message: isHealthy ? 'Provider is healthy' : 'Provider health check failed',
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      await this.adminSettingsService.updateProviderHealth(providerName, 'unhealthy');

      return {
        healthy: false,
        latencyMs,
        message: `Health check error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Returns current status of all providers.
   * Useful for admin dashboard and monitoring.
   */
  async getProviderStatus(): Promise<ProviderStatus[]> {
    const configs = await this.adminSettingsService.getProviders();
    
    return configs.map(config => ({
      name: config.providerName,
      isEnabled: config.isEnabled,
      healthStatus: config.healthStatus,
      priority: config.priority,
      circuitBreakerState: this.circuitBreakers.get(config.providerName)?.getState() ?? 'unknown',
    }));
  }
}
```

### Embedding Similarity Search

```typescript
// =============================================================================
// FACE EMBEDDING REPOSITORY - PGVECTOR OPERATIONS
// =============================================================================

import { injectable, inject } from 'tsyringe';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * Repository for face embedding storage and similarity search using pgvector.
 * 
 * Uses cosine similarity for face matching, which is effective for normalized
 * embeddings and invariant to embedding magnitude.
 * 
 * Performance considerations:
 * - IVFFlat index for approximate nearest neighbor search
 * - Workspace-scoped queries for multi-tenant isolation
 * - Bulk operations for batch processing efficiency
 */
@injectable()
export class FaceEmbeddingRepository implements IFaceEmbeddingRepository {
  constructor(
    @inject('DatabasePool') private readonly db: Pool
  ) {}

  /**
   * Finds faces similar to the given embedding within a workspace.
   * 
   * Uses pgvector's cosine distance operator (<=>) for similarity calculation.
   * Cosine distance = 1 - cosine similarity, so we filter where distance < (1 - threshold).
   * 
   * @param embedding - The 512-dimensional face embedding to search for
   * @param workspaceId - Workspace ID for multi-tenant isolation
   * @param threshold - Minimum similarity score (0-1, default 0.85)
   * @param limit - Maximum number of results to return
   * @returns Array of similar faces with similarity scores, ordered by similarity
   * 
   * @example
   * const similar = await repo.findSimilar(embedding, workspaceId, 0.85, 10);
   * // Returns faces with >= 85% similarity, up to 10 results
   */
  async findSimilar(
    embedding: number[],
    workspaceId: string,
    threshold: number = 0.85,
    limit: number = 50
  ): Promise<SimilarFaceResult[]> {
    // Validate embedding dimension
    if (embedding.length !== 512) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.DETECTION_FAILED,
        `Invalid embedding dimension: expected 512, got ${embedding.length}`,
        { userMessage: 'Unable to search for similar faces. Please try again.' }
      );
    }

    // Convert similarity threshold to distance threshold
    // Cosine distance = 1 - cosine similarity
    const maxDistance = 1 - threshold;

    try {
      const result = await this.db.query<FaceRow & { similarity: string }>(`
        -- Find similar faces using pgvector cosine distance
        -- Results are ordered by similarity (highest first)
        SELECT 
          f.id,
          f.workspace_id,
          f.photo_id,
          f.face_group_id,
          f.bounding_box,
          f.confidence,
          f.provider,
          f.detection_metadata,
          f.thumbnail_urls,
          f.created_at,
          f.updated_at,
          -- Calculate similarity from distance (similarity = 1 - distance)
          1 - (f.embedding <=> $1::vector) as similarity
        FROM faces f
        WHERE f.workspace_id = $2
          AND f.embedding IS NOT NULL
          -- Filter by distance threshold
          AND (f.embedding <=> $1::vector) < $3
        -- Order by distance (ascending = most similar first)
        ORDER BY f.embedding <=> $1::vector
        LIMIT $4
      `, [
        this.formatEmbeddingForPgvector(embedding),
        workspaceId,
        maxDistance,
        limit
      ]);

      logger.debug('Similarity search completed', {
        workspaceId,
        threshold,
        resultsFound: result.rows.length,
      });

      return result.rows.map(row => ({
        face: this.mapRowToFace(row),
        similarity: parseFloat(row.similarity),
      }));
    } catch (error) {
      logger.error('Similarity search failed', {
        workspaceId,
        error: (error as Error).message,
      });
      
      throw new FaceDetectionError(
        FaceDetectionErrorCode.DETECTION_FAILED,
        `Similarity search failed: ${(error as Error).message}`,
        { 
          userMessage: 'Unable to search for similar faces. Please try again.',
          cause: error as Error,
        }
      );
    }
  }

  /**
   * Bulk inserts face embeddings for batch processing efficiency.
   * Uses a single transaction for atomicity.
   * 
   * @param faces - Array of face IDs with their embeddings
   */
  async bulkInsertEmbeddings(
    faces: Array<{ id: string; embedding: number[] }>
  ): Promise<void> {
    if (faces.length === 0) return;

    // Validate all embeddings have correct dimension
    for (const face of faces) {
      if (face.embedding.length !== 512) {
        throw new FaceDetectionError(
          FaceDetectionErrorCode.DETECTION_FAILED,
          `Invalid embedding dimension for face ${face.id}: expected 512, got ${face.embedding.length}`
        );
      }
    }

    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');

      // Use parameterized batch update for efficiency
      for (const face of faces) {
        await client.query(`
          UPDATE faces 
          SET embedding = $1::vector, updated_at = NOW()
          WHERE id = $2
        `, [
          this.formatEmbeddingForPgvector(face.embedding),
          face.id
        ]);
      }

      await client.query('COMMIT');

      logger.debug('Bulk embedding insert completed', {
        count: faces.length,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      
      logger.error('Bulk embedding insert failed', {
        count: faces.length,
        error: (error as Error).message,
      });
      
      throw new FaceDetectionError(
        FaceDetectionErrorCode.DETECTION_FAILED,
        `Bulk embedding insert failed: ${(error as Error).message}`,
        { cause: error as Error }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Updates a single face embedding.
   * 
   * @param faceId - The face ID to update
   * @param embedding - The new 512-dimensional embedding
   */
  async updateEmbedding(faceId: string, embedding: number[]): Promise<void> {
    if (embedding.length !== 512) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.DETECTION_FAILED,
        `Invalid embedding dimension: expected 512, got ${embedding.length}`
      );
    }

    await this.db.query(`
      UPDATE faces 
      SET embedding = $1::vector, updated_at = NOW()
      WHERE id = $2
    `, [
      this.formatEmbeddingForPgvector(embedding),
      faceId
    ]);
  }

  /**
   * Formats a number array as a pgvector-compatible string.
   * pgvector expects format: '[0.1,0.2,0.3,...]'
   */
  private formatEmbeddingForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  /**
   * Maps a database row to a Face entity.
   */
  private mapRowToFace(row: FaceRow): Face {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      photoId: row.photo_id,
      faceGroupId: row.face_group_id,
      boundingBox: row.bounding_box as BoundingBox,
      confidence: parseFloat(row.confidence as unknown as string),
      embedding: null, // Don't return embedding in search results
      provider: row.provider,
      detectionMetadata: row.detection_metadata || {},
      thumbnailUrls: row.thumbnail_urls as ThumbnailUrls,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

/**
 * Database row type for faces table.
 */
interface FaceRow {
  id: string;
  workspace_id: string;
  photo_id: string;
  face_group_id: string | null;
  bounding_box: unknown;
  confidence: number;
  provider: string;
  detection_metadata: unknown;
  thumbnail_urls: unknown;
  created_at: string;
  updated_at: string;
}
```

### Configuration Loading with Fallback

```typescript
// =============================================================================
// CONFIGURATION SERVICE - ADMIN SETTINGS WITH ENV FALLBACK
// =============================================================================

import { injectable, inject } from 'tsyringe';
import * as fs from 'fs';
import { logger } from '../utils/logger';
import { decrypt } from '../utils/encryption';

/**
 * Service for loading configuration with admin settings priority and env fallback.
 * 
 * Configuration precedence:
 * 1. Admin settings (database) - highest priority
 * 2. Environment variables - fallback
 * 3. Default values - last resort
 * 
 * This allows runtime configuration changes without code deployment while
 * maintaining backward compatibility with environment-based configuration.
 */
@injectable()
export class ConfigurationService {
  constructor(
    @inject('IAdminSettingsService')
    private readonly adminSettingsService: IAdminSettingsService
  ) {}

  /**
   * Retrieves provider credentials with admin settings priority.
   * 
   * For Cloud Vision: Returns service account JSON
   * For Gemini: Returns API key
   * 
   * @param providerName - The provider to get credentials for
   * @returns Decrypted credentials object
   * @throws FaceDetectionError if credentials not configured
   */
  async getProviderCredentials(
    providerName: string
  ): Promise<Record<string, unknown>> {
    // First, try to get credentials from admin settings
    try {
      const config = await this.adminSettingsService.getProviderConfig(providerName);
      
      if (config?.credentialsEncrypted) {
        logger.debug('Loading credentials from admin settings', { providerName });
        return this.decryptCredentials(config.credentialsEncrypted);
      }
    } catch (error) {
      // Admin settings unavailable - fall through to env vars
      logger.debug('Admin settings unavailable, falling back to env', {
        providerName,
        error: (error as Error).message,
      });
    }

    // Fallback to environment variables
    logger.debug('Loading credentials from environment', { providerName });
    return this.getCredentialsFromEnv(providerName);
  }

  /**
   * Loads credentials from environment variables.
   * 
   * @param providerName - The provider to get credentials for
   * @returns Credentials object from environment
   * @throws FaceDetectionError if required env vars not set
   */
  private getCredentialsFromEnv(
    providerName: string
  ): Record<string, unknown> {
    switch (providerName) {
      case 'cloud_vision':
        return this.loadCloudVisionCredentials();
      case 'gemini':
        return this.loadGeminiCredentials();
      default:
        throw new FaceDetectionError(
          FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
          `Unknown provider: ${providerName}`,
          { userMessage: 'Face detection provider is not configured.' }
        );
    }
  }

  /**
   * Loads Google Cloud Vision credentials from file path in env.
   */
  private loadCloudVisionCredentials(): Record<string, unknown> {
    const credPath = process.env.GOOGLE_CLOUD_VISION_CREDENTIALS;
    
    if (!credPath) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
        'GOOGLE_CLOUD_VISION_CREDENTIALS environment variable not set',
        { 
          userMessage: 'Face detection has not been configured. Please contact your administrator.',
        }
      );
    }

    try {
      // Read and parse service account JSON file
      const credentialsJson = fs.readFileSync(credPath, 'utf-8');
      const credentials = JSON.parse(credentialsJson);
      
      // Validate required fields
      if (!credentials.client_email || !credentials.private_key) {
        throw new Error('Invalid service account JSON: missing required fields');
      }

      return credentials;
    } catch (error) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.INVALID_CONFIGURATION,
        `Failed to load Cloud Vision credentials: ${(error as Error).message}`,
        {
          userMessage: 'Face detection configuration is invalid. Please contact your administrator.',
          cause: error as Error,
        }
      );
    }
  }

  /**
   * Loads Google Gemini credentials from environment.
   */
  private loadGeminiCredentials(): Record<string, unknown> {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
        'GEMINI_API_KEY environment variable not set',
        {
          userMessage: 'Face detection has not been configured. Please contact your administrator.',
        }
      );
    }

    return {
      apiKey,
      model: process.env.GEMINI_MODEL_FAST || 'gemini-2.5-flash',
    };
  }

  /**
   * Decrypts credentials stored in the database.
   * Uses AES-256-GCM encryption.
   */
  private decryptCredentials(encrypted: Buffer): Record<string, unknown> {
    try {
      const decrypted = decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch (error) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.INVALID_CONFIGURATION,
        `Failed to decrypt credentials: ${(error as Error).message}`,
        {
          userMessage: 'Face detection configuration is invalid. Please contact your administrator.',
          cause: error as Error,
        }
      );
    }
  }

  /**
   * Gets a face detection setting with admin priority and env fallback.
   * 
   * @param key - Setting key (without 'face.' prefix)
   * @param defaultValue - Default value if not configured anywhere
   * @returns The setting value
   * 
   * @example
   * const threshold = await config.getFaceDetectionSetting('similarity_threshold', '0.85');
   */
  async getFaceDetectionSetting(
    key: string,
    defaultValue: string
  ): Promise<string> {
    // Try admin settings first
    try {
      const value = await this.adminSettingsService.getSetting(`face.${key}`);
      if (value !== null) {
        return value;
      }
    } catch (error) {
      // Admin settings unavailable - continue to env
      logger.debug('Admin settings unavailable for key', { key });
    }

    // Try environment variable
    const envKey = `FACE_${key.toUpperCase()}`;
    const envValue = process.env[envKey];
    
    if (envValue !== undefined) {
      return envValue;
    }

    // Return default
    return defaultValue;
  }

  /**
   * Gets the similarity threshold for face matching.
   * Default: 0.85 (85% similarity required)
   */
  async getSimilarityThreshold(): Promise<number> {
    const value = await this.getFaceDetectionSetting('similarity_threshold', '0.85');
    return parseFloat(value);
  }

  /**
   * Gets the minimum confidence threshold for face detection.
   * Faces below this confidence are marked as low-confidence.
   * Default: 0.7 (70% confidence required)
   */
  async getMinConfidenceThreshold(): Promise<number> {
    const value = await this.getFaceDetectionSetting('min_confidence', '0.7');
    return parseFloat(value);
  }

  /**
   * Checks if face detection is enabled for a workspace.
   */
  async isFaceDetectionEnabled(workspaceId: string): Promise<boolean> {
    try {
      const setting = await this.adminSettingsService.getSetting(
        `workspace.${workspaceId}.face_detection_enabled`
      );
      return setting !== 'false';
    } catch {
      // Default to enabled if setting unavailable
      return true;
    }
  }
}
```

## File Structure

```
backend/src/
├── services/
│   ├── faceDetectionService.ts      # Core face detection orchestration
│   ├── faceClusterService.ts        # Clustering and similarity matching
│   ├── faceThumbnailService.ts      # Thumbnail generation
│   ├── adminSettingsService.ts      # Admin configuration management
│   └── ai/
│       ├── providerManager.ts       # Provider selection and failover
│       ├── circuitBreaker.ts        # Circuit breaker implementation
│       ├── retryStrategy.ts         # Retry with exponential backoff
│       └── providers/
│           ├── types.ts             # Provider interfaces
│           ├── baseProvider.ts      # Abstract base provider
│           ├── cloudVisionProvider.ts
│           └── geminiProvider.ts
├── db/
│   ├── repositories/
│   │   ├── faceRepository.ts
│   │   ├── faceEmbeddingRepository.ts
│   │   ├── faceGroupRepository.ts
│   │   └── aiProviderSettingsRepository.ts
│   └── migrations/
│       ├── 050_enable_pgvector.sql
│       ├── 051_create_faces_table.sql
│       ├── 052_create_face_groups_table.sql
│       ├── 053_create_ai_provider_settings.sql
│       ├── 054_create_face_detection_jobs.sql
│       └── 055_create_face_group_history.sql
├── workers/
│   └── faceDetectionWorker.ts       # Background job processor
├── routes/v1/
│   ├── faces.ts                     # Face API endpoints
│   ├── faceGroups.ts                # Face group API endpoints
│   └── admin/
│       └── aiProviders.ts           # Admin provider configuration
├── controllers/
│   ├── faceController.ts
│   ├── faceGroupController.ts
│   └── admin/
│       └── aiProviderController.ts
├── middleware/
│   └── faceDetectionErrorBoundary.ts # Error handling middleware
├── errors/
│   └── faceDetectionError.ts        # Custom error classes
└── types/
    └── face.ts                      # Face-related type definitions

backend/tests/
├── unit/
│   ├── services/
│   │   ├── faceDetectionService.test.ts
│   │   ├── faceClusterService.test.ts
│   │   └── providerManager.test.ts
│   └── providers/
│       ├── cloudVisionProvider.test.ts
│       └── geminiProvider.test.ts
├── property/
│   ├── embedding.property.test.ts
│   ├── clustering.property.test.ts
│   ├── serialization.property.test.ts
│   └── isolation.property.test.ts
└── integration/
    ├── faces.api.test.ts
    ├── faceGroups.api.test.ts
    └── faceDetection.e2e.test.ts
```

## AI Provider Implementations

### Base Provider Abstract Class

```typescript
// =============================================================================
// BASE PROVIDER - SHARED FUNCTIONALITY FOR ALL AI PROVIDERS
// =============================================================================

import { logger } from '../../utils/logger';

/**
 * Abstract base class for AI providers.
 * Provides common functionality like request validation, logging, and error handling.
 * 
 * All concrete providers must implement:
 * - detectFaces(): Core face detection logic
 * - isHealthy(): Health check implementation
 */
export abstract class BaseProvider implements IAIProvider {
  /** Provider name for logging and identification */
  abstract readonly name: string;
  
  /** Supported image formats */
  protected readonly supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  
  /** Maximum image size in bytes (10MB) */
  protected readonly maxImageSize = 10 * 1024 * 1024;
  
  /** Minimum image dimensions for reliable detection */
  protected readonly minImageDimension = 100;

  constructor(
    protected readonly configService: IConfigurationService
  ) {}

  /**
   * Validates image before sending to provider.
   * Checks format, size, and dimensions.
   * 
   * @param imageBuffer - The image data to validate
   * @param mimeType - The MIME type of the image
   * @throws FaceDetectionError if validation fails
   */
  protected validateImage(imageBuffer: Buffer, mimeType?: string): void {
    // Check image size
    if (imageBuffer.length > this.maxImageSize) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.IMAGE_TOO_SMALL,
        `Image size ${imageBuffer.length} exceeds maximum ${this.maxImageSize}`,
        { userMessage: 'This image is too large. Please use an image under 10MB.' }
      );
    }

    // Check MIME type if provided
    if (mimeType && !this.supportedFormats.includes(mimeType)) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.INVALID_IMAGE_FORMAT,
        `Unsupported image format: ${mimeType}`,
        { userMessage: 'This image format is not supported. Please use JPEG, PNG, WebP, or HEIC.' }
      );
    }

    // Basic corruption check - ensure buffer has content
    if (imageBuffer.length < 100) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.IMAGE_CORRUPTED,
        'Image buffer too small, likely corrupted',
        { userMessage: 'This image appears to be corrupted. Please try a different image.' }
      );
    }
  }

  /**
   * Normalizes bounding box coordinates to percentages (0-100).
   * Different providers return coordinates in different formats.
   * 
   * @param box - Raw bounding box from provider
   * @param imageWidth - Image width in pixels
   * @param imageHeight - Image height in pixels
   * @returns Normalized bounding box with percentage coordinates
   */
  protected normalizeBoundingBox(
    box: { x: number; y: number; width: number; height: number },
    imageWidth: number,
    imageHeight: number
  ): BoundingBox {
    return {
      x: (box.x / imageWidth) * 100,
      y: (box.y / imageHeight) * 100,
      width: (box.width / imageWidth) * 100,
      height: (box.height / imageHeight) * 100,
    };
  }

  /**
   * Logs provider request for debugging and monitoring.
   */
  protected logRequest(operation: string, details?: Record<string, unknown>): void {
    logger.debug(`${this.name} request`, {
      provider: this.name,
      operation,
      ...details,
    });
  }

  /**
   * Logs provider response for debugging and monitoring.
   */
  protected logResponse(
    operation: string,
    success: boolean,
    details?: Record<string, unknown>
  ): void {
    const level = success ? 'debug' : 'warn';
    logger[level](`${this.name} response`, {
      provider: this.name,
      operation,
      success,
      ...details,
    });
  }

  /**
   * Wraps provider errors in FaceDetectionError with appropriate codes.
   */
  protected wrapProviderError(error: Error, operation: string): FaceDetectionError {
    // Check for rate limiting
    if (this.isRateLimitError(error)) {
      return new FaceDetectionError(
        FaceDetectionErrorCode.PROVIDER_RATE_LIMITED,
        `${this.name} rate limit exceeded during ${operation}`,
        {
          userMessage: 'Too many requests. Please wait a moment before trying again.',
          cause: error,
        }
      );
    }

    // Check for timeout
    if (this.isTimeoutError(error)) {
      return new FaceDetectionError(
        FaceDetectionErrorCode.PROVIDER_TIMEOUT,
        `${this.name} timeout during ${operation}`,
        {
          userMessage: 'Face detection is taking longer than expected. Please try again.',
          cause: error,
        }
      );
    }

    // Generic provider error
    return new FaceDetectionError(
      FaceDetectionErrorCode.PROVIDER_INVALID_RESPONSE,
      `${this.name} error during ${operation}: ${error.message}`,
      {
        userMessage: 'Unable to process the image. Please try with a different photo.',
        cause: error,
      }
    );
  }

  /**
   * Checks if error is a rate limit error.
   * Override in subclasses for provider-specific detection.
   */
  protected isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('rate limit') || 
           message.includes('quota exceeded') ||
           (error as any).status === 429;
  }

  /**
   * Checks if error is a timeout error.
   * Override in subclasses for provider-specific detection.
   */
  protected isTimeoutError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('timeout') || 
           message.includes('timed out') ||
           (error as any).code === 'ETIMEDOUT';
  }

  // Abstract methods to be implemented by concrete providers
  abstract detectFaces(
    imageBuffer: Buffer,
    options?: DetectionOptions
  ): Promise<FaceDetectionResult[]>;
  
  abstract isHealthy(): Promise<boolean>;
}
```

### Google Cloud Vision Provider

```typescript
// =============================================================================
// GOOGLE CLOUD VISION PROVIDER
// =============================================================================

import { ImageAnnotatorClient } from '@google-cloud/vision';
import { injectable, inject } from 'tsyringe';

/**
 * Google Cloud Vision API provider for face detection.
 * 
 * Features:
 * - High accuracy face detection with landmarks
 * - Emotion detection (joy, sorrow, anger, surprise)
 * - Face angle detection (roll, pan, tilt)
 * - Bounding polygon with precise coordinates
 * 
 * Configuration:
 * - Requires service account JSON credentials
 * - Loaded from admin settings or GOOGLE_CLOUD_VISION_CREDENTIALS env var
 */
@injectable()
export class CloudVisionProvider extends BaseProvider {
  readonly name = 'cloud_vision';
  
  private client: ImageAnnotatorClient | null = null;
  private clientInitPromise: Promise<void> | null = null;

  constructor(
    @inject('IConfigurationService') configService: IConfigurationService
  ) {
    super(configService);
  }

  /**
   * Lazily initializes the Vision API client.
   * Credentials are loaded from admin settings or environment.
   */
  private async ensureClient(): Promise<ImageAnnotatorClient> {
    if (this.client) {
      return this.client;
    }

    // Prevent multiple simultaneous initializations
    if (!this.clientInitPromise) {
      this.clientInitPromise = this.initializeClient();
    }

    await this.clientInitPromise;
    return this.client!;
  }

  /**
   * Initializes the Vision API client with credentials.
   */
  private async initializeClient(): Promise<void> {
    try {
      const credentials = await this.configService.getProviderCredentials('cloud_vision');
      
      this.client = new ImageAnnotatorClient({
        credentials: credentials as any,
      });

      logger.info('Cloud Vision client initialized');
    } catch (error) {
      logger.error('Failed to initialize Cloud Vision client', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Detects faces in an image using Google Cloud Vision API.
   * 
   * @param imageBuffer - The image data as a Buffer
   * @param options - Detection options (maxFaces, minConfidence)
   * @returns Array of detected faces with bounding boxes and confidence
   */
  async detectFaces(
    imageBuffer: Buffer,
    options?: DetectionOptions
  ): Promise<FaceDetectionResult[]> {
    // Validate image before sending to API
    this.validateImage(imageBuffer);
    
    this.logRequest('detectFaces', {
      imageSize: imageBuffer.length,
      maxFaces: options?.maxFaces,
    });

    try {
      const client = await this.ensureClient();
      
      // Call Vision API with face detection feature
      const [result] = await client.faceDetection({
        image: { content: imageBuffer.toString('base64') },
        features: [{
          type: 'FACE_DETECTION',
          maxResults: options?.maxFaces ?? 50,
        }],
      });

      const faces = result.faceAnnotations || [];
      
      this.logResponse('detectFaces', true, {
        facesDetected: faces.length,
      });

      // Transform Vision API response to our format
      return faces
        .filter(face => {
          // Filter by confidence if threshold specified
          const confidence = face.detectionConfidence ?? 0;
          return confidence >= (options?.minConfidence ?? 0);
        })
        .map(face => this.transformVisionFace(face));
    } catch (error) {
      this.logResponse('detectFaces', false, {
        error: (error as Error).message,
      });
      
      throw this.wrapProviderError(error as Error, 'detectFaces');
    }
  }

  /**
   * Transforms Cloud Vision face annotation to our standard format.
   */
  private transformVisionFace(face: any): FaceDetectionResult {
    // Extract bounding box from fdBoundingPoly (face detection bounding poly)
    const vertices = face.fdBoundingPoly?.vertices || face.boundingPoly?.vertices || [];
    const boundingBox = this.extractBoundingBox(vertices);

    // Extract landmarks
    const landmarks = (face.landmarks || []).map((landmark: any) => ({
      type: landmark.type,
      position: {
        x: landmark.position?.x ?? 0,
        y: landmark.position?.y ?? 0,
      },
    }));

    // Extract attributes
    const attributes: FaceAttributes = {
      rollAngle: face.rollAngle,
      panAngle: face.panAngle,
      tiltAngle: face.tiltAngle,
      joyLikelihood: face.joyLikelihood,
      sorrowLikelihood: face.sorrowLikelihood,
    };

    return {
      boundingBox,
      confidence: face.detectionConfidence ?? 0,
      landmarks,
      attributes,
      rawProviderResponse: face,
    };
  }

  /**
   * Extracts bounding box from Vision API vertices.
   * Vertices are in pixel coordinates, we convert to percentages later.
   */
  private extractBoundingBox(vertices: Array<{ x?: number; y?: number }>): BoundingBox {
    if (vertices.length < 4) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const xs = vertices.map(v => v.x ?? 0);
    const ys = vertices.map(v => v.y ?? 0);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Return in pixel coordinates - will be normalized later
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  /**
   * Checks if the Cloud Vision API is healthy and accessible.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      
      // Simple health check - try to get project info
      // This validates credentials without consuming quota
      await client.getProjectId();
      
      return true;
    } catch (error) {
      logger.warn('Cloud Vision health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
```

### Google Gemini Provider

```typescript
// =============================================================================
// GOOGLE GEMINI PROVIDER (FALLBACK)
// =============================================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { injectable, inject } from 'tsyringe';

/**
 * Google Gemini API provider for face detection (fallback).
 * 
 * Uses Gemini's vision capabilities to detect faces when Cloud Vision
 * is unavailable. Less accurate than Cloud Vision but provides redundancy.
 * 
 * Features:
 * - Multi-modal vision analysis
 * - Configurable model selection
 * - Structured JSON output for face data
 * 
 * Configuration:
 * - Requires GEMINI_API_KEY
 * - Model configurable via admin settings or GEMINI_MODEL_FAST env var
 */
@injectable()
export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini';
  
  private genAI: GoogleGenerativeAI | null = null;

  constructor(
    @inject('IConfigurationService') configService: IConfigurationService
  ) {
    super(configService);
  }

  /**
   * Lazily initializes the Gemini client.
   */
  private async ensureClient(): Promise<GoogleGenerativeAI> {
    if (this.genAI) {
      return this.genAI;
    }

    const credentials = await this.configService.getProviderCredentials('gemini');
    const apiKey = credentials.apiKey as string;

    if (!apiKey) {
      throw new FaceDetectionError(
        FaceDetectionErrorCode.PROVIDER_NOT_CONFIGURED,
        'Gemini API key not configured'
      );
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    logger.info('Gemini client initialized');
    
    return this.genAI;
  }

  /**
   * Gets the configured Gemini model name.
   */
  private async getModelName(): Promise<string> {
    try {
      const config = await this.configService.getProviderCredentials('gemini');
      return (config.model as string) || process.env.GEMINI_MODEL_FAST || 'gemini-2.5-flash';
    } catch {
      return process.env.GEMINI_MODEL_FAST || 'gemini-2.5-flash';
    }
  }

  /**
   * Detects faces in an image using Google Gemini API.
   * 
   * Uses a structured prompt to extract face information in JSON format.
   * Less accurate than Cloud Vision but provides fallback capability.
   * 
   * @param imageBuffer - The image data as a Buffer
   * @param options - Detection options (maxFaces, minConfidence)
   * @returns Array of detected faces with bounding boxes and confidence
   */
  async detectFaces(
    imageBuffer: Buffer,
    options?: DetectionOptions
  ): Promise<FaceDetectionResult[]> {
    // Validate image before sending to API
    this.validateImage(imageBuffer);
    
    this.logRequest('detectFaces', {
      imageSize: imageBuffer.length,
      maxFaces: options?.maxFaces,
    });

    try {
      const genAI = await this.ensureClient();
      const modelName = await this.getModelName();
      const model = genAI.getGenerativeModel({ model: modelName });

      // Construct the prompt for face detection
      const prompt = this.buildFaceDetectionPrompt(options?.maxFaces ?? 50);

      // Send image to Gemini for analysis
      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBuffer.toString('base64'),
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse the JSON response
      const faces = this.parseGeminiResponse(text);
      
      this.logResponse('detectFaces', true, {
        facesDetected: faces.length,
        model: modelName,
      });

      // Filter by confidence threshold
      return faces.filter(face => 
        face.confidence >= (options?.minConfidence ?? 0)
      );
    } catch (error) {
      this.logResponse('detectFaces', false, {
        error: (error as Error).message,
      });
      
      throw this.wrapProviderError(error as Error, 'detectFaces');
    }
  }

  /**
   * Builds the prompt for face detection.
   * Instructs Gemini to return structured JSON with face data.
   */
  private buildFaceDetectionPrompt(maxFaces: number): string {
    return `Analyze this image and detect all human faces (up to ${maxFaces}).

For each face detected, provide the following information in JSON format:
- boundingBox: Object with x, y, width, height as percentages (0-100) of image dimensions
- confidence: Detection confidence score from 0 to 1
- attributes: Optional object with estimated age range and any notable features

Return ONLY a valid JSON array. If no faces are detected, return an empty array [].

Example response format:
[
  {
    "boundingBox": { "x": 25.5, "y": 10.2, "width": 15.3, "height": 20.1 },
    "confidence": 0.95,
    "attributes": { "estimatedAge": "25-35" }
  }
]

Important:
- Coordinates should be percentages of image dimensions (0-100)
- Only include faces you are confident about (confidence > 0.5)
- Return valid JSON only, no additional text`;
  }

  /**
   * Parses Gemini's text response into FaceDetectionResult array.
   * Handles various response formats and extracts JSON.
   */
  private parseGeminiResponse(text: string): FaceDetectionResult[] {
    try {
      // Try to extract JSON from the response
      // Gemini sometimes wraps JSON in markdown code blocks
      let jsonText = text.trim();
      
      // Remove markdown code block if present
      const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonText = jsonMatch[1].trim();
      }

      // Parse the JSON
      const parsed = JSON.parse(jsonText);
      
      // Validate and transform the response
      if (!Array.isArray(parsed)) {
        logger.warn('Gemini response is not an array', { response: text });
        return [];
      }

      return parsed
        .filter(this.isValidFaceObject)
        .map(face => ({
          boundingBox: {
            x: face.boundingBox.x,
            y: face.boundingBox.y,
            width: face.boundingBox.width,
            height: face.boundingBox.height,
          },
          confidence: face.confidence,
          attributes: face.attributes,
          rawProviderResponse: face,
        }));
    } catch (error) {
      logger.warn('Failed to parse Gemini response', {
        error: (error as Error).message,
        response: text.substring(0, 500),
      });
      
      // Return empty array on parse failure rather than throwing
      // This allows the system to continue with other providers
      return [];
    }
  }

  /**
   * Validates that an object has the required face detection fields.
   */
  private isValidFaceObject(obj: unknown): obj is {
    boundingBox: { x: number; y: number; width: number; height: number };
    confidence: number;
    attributes?: Record<string, unknown>;
  } {
    if (typeof obj !== 'object' || obj === null) return false;
    
    const face = obj as any;
    
    return (
      typeof face.boundingBox === 'object' &&
      typeof face.boundingBox.x === 'number' &&
      typeof face.boundingBox.y === 'number' &&
      typeof face.boundingBox.width === 'number' &&
      typeof face.boundingBox.height === 'number' &&
      typeof face.confidence === 'number'
    );
  }

  /**
   * Checks if the Gemini API is healthy and accessible.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const genAI = await this.ensureClient();
      const modelName = await this.getModelName();
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Simple health check - generate a short response
      const result = await model.generateContent('Reply with OK');
      const response = await result.response;
      
      return response.text().length > 0;
    } catch (error) {
      logger.warn('Gemini health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Override rate limit detection for Gemini-specific errors.
   */
  protected isRateLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return super.isRateLimitError(error) ||
           message.includes('resource exhausted') ||
           message.includes('quota');
  }
}
```
