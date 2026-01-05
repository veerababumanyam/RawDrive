# Face Detection & People Management

> **Reference Documentation**:
> - `docs/Features/FaceDetectionIdentification.md` - Core face detection specs
> - `docs/Features/FaceRecognizationRequiremtns.md` - Recognition requirements
> - `.kiro/specs/face-detection-service/` - Service implementation specs
> - `specs/008-face-group-merge/` - Face group merge functionality
> - `docs/TechnicalSpecs/face_detection_service.json` - Technical specifications

## Business Value Proposition

Face Detection & People Management enables photographers to automatically organize photos by people, create face-based galleries, and provide intelligent photo organization without manual tagging. This feature dramatically reduces the time spent organizing event photos and enables powerful "Find My Photos" functionality for clients.

### Key Business Benefits
- **Time Savings**: Automatic face detection eliminates manual tagging (hours → minutes)
- **Client Experience**: "Find My Photos" feature lets guests discover their photos instantly
- **Organization**: Group photos by person across entire workspace
- **Event Delivery**: Quickly create personalized galleries for specific guests
- **Privacy Control**: Workspace-isolated face data with opt-out options
- **Scalability**: Process thousands of photos in background without blocking uploads

---

## User Personas

### Primary Users
1. **Photographer/Studio Owner**
   - Organizes event photos by detected faces
   - Creates face-based galleries for clients
   - Names and manages face groups
   - Reviews and corrects AI groupings

2. **Studio Editor/Assistant**
   - Reviews face detection results
   - Merges duplicate face groups
   - Splits incorrectly grouped faces
   - Tags VIP guests (bride, groom, parents)

3. **Client/Guest**
   - Uses "Find My Photos" to discover their photos
   - Browses photos filtered by person
   - Downloads photos of themselves

---

## Key Capabilities

### 1. Automatic Face Detection

**Background Processing**
- Photos queued for detection on upload
- Batch processing with BullMQ workers
- Non-blocking: uploads complete immediately
- Progress tracking in gallery view

**Detection Features**
- Detect all visible faces in photos
- Extract bounding box coordinates
- Generate 512-dimensional face embeddings
- Confidence scoring for each detection
- Support for various angles (frontal, profile, three-quarter)

**Supported Formats**
- JPEG, PNG, WebP, HEIC
- RAW files (via embedded preview)
- Minimum dimensions configurable

**Quality Handling**
- Varying lighting conditions
- Partially occluded faces (reduced confidence)
- Group photos (up to 50 faces per image)
- Low-confidence faces excluded from auto-grouping

### 2. Multi-Provider AI Support

**Primary Provider: Google Cloud Vision**
- High accuracy face detection
- Bounding box extraction
- Landmark detection

**Fallback Provider: Google Gemini**
- Automatic failover on primary failure
- Consistent embedding format
- Seamless provider switching

**Provider Management**
- Admin-configurable credentials
- Rate limit configuration per provider
- Timeout settings
- Health monitoring
- Circuit breaker pattern for resilience

### 3. Face Identification & Clustering

**Automatic Clustering**
- Compare new embeddings against existing clusters
- Configurable similarity threshold (default: 0.6)
- Create new cluster if no match found
- Maintain cluster centroids for efficiency

**Cluster Management**
- **Merge**: Combine two face groups identified as same person
- **Split**: Separate incorrectly grouped faces
- **Manual Assignment**: Override AI decisions
- **Centroid Recalculation**: Update on membership changes

**VIP Tagging**
- Tag important people (bride, groom, parents)
- Prioritize VIP coverage in curation
- Per-person photo count tracking

### 4. Face-Based Photo Organization

**Face Groups View**
- Grid of detected people with representative thumbnails
- Photo count per person
- First/last seen dates
- Naming capability

**Filtering & Search**
- Filter gallery by face group
- Multi-person filtering (AND/OR logic)
- Search by person name
- Combine with other filters (date, quality, tags)

**Face Thumbnails**
- Cropped face region from source photo
- Multiple sizes: 64px, 128px, 256px
- Consistent aspect ratio and padding
- Cascade delete with source photo

### 5. "Find My Photos" (Client-Side Face Discovery)

**Privacy-First Design**
- All face processing happens on client device
- Raw face images never leave user's device
- Only 512-dimensional embedding sent to server
- Explicit consent dialog before camera access

**User Flow**
1. Guest clicks "Find My Photos" icon in gallery
2. Consent dialog explains privacy approach
3. Device camera captures face (with permission)
4. Client-side TensorFlow.js generates embedding
5. Embedding sent to server for similarity search
6. Matching photos returned, filtered by confidence

**Rate Limiting**
- 100 searches/hour per gallery per IP
- Prevents abuse while allowing legitimate use

### 6. Face Search & Discovery

**Similar Face Search**
- Select any face → "Find Similar"
- Search across all galleries in workspace
- Results ordered by similarity score
- Bulk assignment to face group

**Reference Photo Upload**
- Upload photo to find matching faces
- Useful for finding specific person
- Cross-gallery search capability

### 7. Privacy & Consent Management

**Workspace-Level Controls**
- Enable/disable face detection globally
- Opt-out at gallery level
- Delete all face data option

**Data Isolation**
- Strict workspace_id scoping
- No cross-workspace face matching
- Cascade delete on workspace deletion

**Compliance**
- Face data deletion on request
- Audit logging for all face operations
- No face sharing across workspaces

---

## Integration Points

### With Other Features

| Feature | Integration |
|---------|-------------|
| **Gallery Management** | Face-based filtering in galleries; face groups in lightbox |
| **Client CRM** | Identify clients in photos; link faces to client records |
| **AI & Search** | Face embeddings in semantic search; quality scoring |
| **Invitations** | Identify guests in event photos |
| **Smart Curation** | Per-person coverage balancing; VIP prioritization |
| **Analytics** | Face detection metrics; processing statistics |
| **Billing** | Processing quota per subscription tier |

---

## Technical Architecture

### Backend Services

```
face_detection_service.py       - Core detection orchestration
face_cluster_service.py         - Clustering and grouping
face_embedding_service.py       - Embedding generation and storage
face_search_service.py          - Similarity search
face_thumbnail_service.py       - Thumbnail generation
face_admin_settings_service.py  - Admin configuration
face_configuration_service.py   - Provider configuration
people_service.py               - Face group management
```

### AI Provider Architecture

```
providers/
├── base_provider.py            - Abstract provider interface
├── gemini_provider.py          - Google Gemini implementation
├── cloud_vision_provider.py    - Google Cloud Vision implementation
├── provider_manager.py         - Provider selection and failover
├── types.py                    - Shared type definitions
├── retry_strategy.py           - Retry logic with backoff
└── circuit_breaker.py          - Circuit breaker pattern
```

### API Endpoints

**Face Detection**
```
POST   /api/v1/photos/{id}/detect-faces     - Trigger manual detection
GET    /api/v1/galleries/{id}/faces         - List detected faces
GET    /api/v1/faces/{id}                   - Get face details
```

**Face Groups**
```
GET    /api/v1/workspaces/{id}/face-groups  - List all face groups
POST   /api/v1/face-groups                  - Create face group
PUT    /api/v1/face-groups/{id}             - Update group (name, representative)
DELETE /api/v1/face-groups/{id}             - Delete group
POST   /api/v1/face-groups/merge            - Merge two groups
POST   /api/v1/face-groups/{id}/split       - Split faces from group
```

**Face Assignment**
```
POST   /api/v1/faces/{id}/identify          - Assign face to group
POST   /api/v1/faces/bulk-assign            - Bulk assignment
```

**Face Search**
```
POST   /api/v1/workspaces/{id}/face-search  - Search by embedding
POST   /api/v1/faces/{id}/find-similar      - Find similar faces
```

**Public (Client-Side Discovery)**
```
POST   /g/{token}/face-search               - Find photos by face (Magic Link)
```

**Admin Settings**
```
GET    /api/v1/admin/face-detection/settings    - Get settings
PUT    /api/v1/admin/face-detection/settings    - Update settings
POST   /api/v1/admin/face-detection/test        - Test provider connectivity
```

### Database Schema

**Core Tables**
```sql
faces                        - Detected faces with bounding boxes
├── face_id (UUID)
├── asset_id (UUID)          - Source photo
├── workspace_id (UUID)      - Tenant isolation
├── bounding_box (JSONB)     - x, y, width, height
├── confidence (FLOAT)       - Detection confidence
├── face_group_id (UUID)     - Cluster assignment
├── thumbnail_url (VARCHAR)  - Cropped face image
└── created_at (TIMESTAMP)

face_groups                  - Clustered people
├── group_id (UUID)
├── workspace_id (UUID)
├── name (VARCHAR)           - User-assigned name
├── representative_face_id   - Display thumbnail
├── centroid (VECTOR(512))   - Cluster centroid
├── photo_count (INTEGER)
├── is_vip (BOOLEAN)         - VIP flag
└── created_at (TIMESTAMP)

face_embeddings              - Vector embeddings (pgvector)
├── embedding_id (UUID)
├── face_id (UUID)
├── embedding (VECTOR(512))  - 512-dimensional vector
└── provider (VARCHAR)       - Which AI generated it

face_group_history           - Merge/split audit trail
├── history_id (UUID)
├── action (VARCHAR)         - merge, split, assign
├── source_group_id (UUID)
├── target_group_id (UUID)
├── face_ids (UUID[])
├── performed_by (UUID)
└── created_at (TIMESTAMP)

face_detection_jobs          - Background job tracking
├── job_id (UUID)
├── asset_id (UUID)
├── status (VARCHAR)         - pending, processing, completed, failed
├── provider (VARCHAR)
├── error_message (TEXT)
├── processing_time_ms (INT)
└── created_at (TIMESTAMP)

ai_provider_settings         - Provider configuration
├── setting_id (UUID)
├── provider (VARCHAR)
├── credentials (JSONB)      - Encrypted
├── rate_limit (INTEGER)
├── timeout_ms (INTEGER)
├── is_primary (BOOLEAN)
└── updated_at (TIMESTAMP)

face_search_logs             - Search audit (privacy-conscious)
├── log_id (UUID)
├── gallery_id (UUID)
├── visitor_id (UUID)
├── embedding_hash (VARCHAR) - Hash for dedup, not actual embedding
├── matches_count (INTEGER)
├── searched_at (TIMESTAMP)
└── ip_address (INET)
```

### Frontend Components

**Pages**
```
PeoplePage                  - Face groups overview
FaceGroupDetailPage         - Single group with photos
```

**Feature Components**
```
PeopleGrid                  - Grid of face groups
FaceGroupCard               - Individual group display
FaceGroupBrowser            - Browse and filter groups
FaceDetectionStatus         - Processing progress
FaceThumbnail               - Cropped face display
FaceAssignmentModal         - Assign face to group
FaceMergeDialog             - Merge two groups
FaceSplitDialog             - Split faces from group
FindMyPhotosButton          - Client-side discovery trigger
FaceSearchModal             - Camera capture and search
SimilarFacesPanel           - Search results display
```

---

## Scalability Considerations

### Handling Large Galleries

**Batch Processing**
- Photos processed in batches (configurable size)
- BullMQ for job orchestration
- Parallel processing with concurrency limits
- Priority queuing for user-initiated requests

**Database Optimization**
- pgvector for efficient similarity search
- HNSW indexes for fast nearest-neighbor queries
- Workspace-scoped indexes
- Connection pooling for high throughput

**Caching**
- Face group metadata cached in Redis
- Frequently accessed embeddings cached
- Cache invalidation on group changes

### Performance Targets
- Detection: < 2 seconds per photo
- Similarity search: < 100ms for 100,000+ faces
- Face group load: < 500ms
- Batch processing: 1,000 photos in < 5 minutes

### Circuit Breaker Pattern
- Monitor provider health
- Open circuit after 5 consecutive failures
- Auto-recover after 60 seconds
- Fallback to secondary provider

---

## Security & Compliance

### Data Protection
- **Encryption**: Face embeddings encrypted at rest
- **Isolation**: Strict workspace_id scoping on all queries
- **No Cross-Workspace**: Face matching only within workspace
- **Cascade Delete**: All face data deleted with workspace

### Privacy
- **Client-Side Processing**: Raw faces never leave device
- **Embedding Only**: Only mathematical vectors transmitted
- **Consent Required**: Explicit permission for camera access
- **Opt-Out**: Workspace and gallery-level disable options

### Audit & Compliance
- **Audit Logging**: All face operations logged
- **Access Tracking**: Who accessed face data and when
- **Deletion Support**: Complete face data removal on request
- **GDPR Compliant**: Data export and deletion rights

---

## Business Metrics

### Key Performance Indicators
- **Detection Accuracy**: % of faces correctly detected
- **Clustering Accuracy**: % of faces correctly grouped
- **Processing Time**: Average time per photo
- **User Corrections**: % of AI decisions overridden
- **Find My Photos Usage**: % of gallery visitors using feature

### Success Criteria
- Quality scoring correlates with photographer rankings at 85%+
- Blur detection achieves 95%+ accuracy with <5% false positives
- Similarity grouping correctly clusters 90%+ of burst shots
- Best-shot selection matches photographer choice 80%+ of time
- System handles 100,000+ faces per workspace efficiently

---

## Future Enhancements

### Planned Features
- **Expression Analysis**: Detect smiles, eyes open/closed
- **Age/Gender Estimation**: Demographic grouping
- **Pose Detection**: Full body pose analysis
- **Video Face Tracking**: Face detection in video content
- **Cross-Event Matching**: Find same person across events
- **Smart Albums**: Auto-generate albums by person

### Roadmap
- Q1 2026: Expression analysis
- Q2 2026: Video face tracking
- Q3 2026: Cross-event matching
- Q4 2026: Smart album generation
