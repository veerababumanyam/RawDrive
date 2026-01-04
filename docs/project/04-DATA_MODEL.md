# Data Model

## Overview

The RawDrive data model defines the structure, relationships, and constraints for all data stored in the system. This document provides a comprehensive reference for the database schema, entity relationships, and data integrity rules.

## Purpose

The data model serves to:
- **Define Structure**: Entity definitions and attributes
- **Establish Relationships**: Entity relationships and constraints
- **Ensure Integrity**: Data validation and consistency rules
- **Enable Queries**: Efficient data retrieval patterns
- **Support Scalability**: Optimized schema for growth
- **Document Constraints**: Business rules and validations

---

## Core Entities

### User

Represents a photographer or admin account.

**User Model (Pydantic / Logical):**
```python
class User(BaseModel):
    id: UUID
    email: str
    
    # Profile
    first_name: str
    last_name: str
    display_name: str
    avatar: Optional[str] = None
    bio: Optional[str] = None
    
    # Auth
    password_hash: str
    
    # Subscriptions
    subscription_tier: SubscriptionTier = SubscriptionTier.FREE
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
```

### Gallery

Represents a photo gallery.

**Gallery Model:**
```python
class Gallery(BaseModel):
    id: UUID
    photographer_id: UUID
    
    name: str
    slug: str
    is_public: bool = False
    
    # Metadata
    # ...
```

### Photo

Represents a photo in a gallery.

**Photo Entity:**
```typescript
interface Photo {
  // Identifiers
  id: string, // UUID
  galleryId: string, // FK -> Gallery
  
  // File Info
  fileName: string,
  fileSize: number, // Bytes
  mimeType: string,
  
  // URLs
  originalUrl: string,
  thumbnailUrl: string,
  previewUrl: string,
  
  // Metadata
  title?: string,
  description?: string,
  tags: string[],
  
  // EXIF Data
  exifData?: {
    camera?: string,
    lens?: string,
    iso?: number,
    aperture?: string,
    shutterSpeed?: string,
    focalLength?: string,
    exposureTime?: string,
    dateTime?: Date,
  },
  
  // Dimensions
  width: number,
  height: number,
  orientation?: 'portrait' | 'landscape' | 'square',
  
  // AI Analysis
  aiAnalysis?: {
    tags: string[],
    confidence: number,
    description: string,
    faces: FaceDetection[],
  },
  
  // Status
  status: 'uploaded' | 'processing' | 'ready' | 'archived',
  
  // Timestamps
  uploadedAt: Date,
  createdAt: Date,
  updatedAt: Date,
}

interface FaceDetection {
  id: string,
  personId?: string, // FK -> Person
  boundingBox: {
    x: number,
    y: number,
    width: number,
    height: number,
  },
  confidence: number,
  name?: string,
}

// Indexes
CREATE INDEX idx_photo_gallery_id ON photos(galleryId);
CREATE INDEX idx_photo_status ON photos(status);
CREATE INDEX idx_photo_uploaded_at ON photos(uploadedAt);
CREATE INDEX idx_photo_tags ON photos USING GIN(tags);
```

### Client

Represents a client who can view galleries.

**Client Entity:**
```typescript
interface Client {
  // Identifiers
  id: string, // UUID
  photographerId: string, // FK -> User
  
  // Contact Info
  email: string,
  firstName: string,
  lastName: string,
  phone?: string,
  
  // Address
  address?: {
    street: string,
    city: string,
    state: string,
    postalCode: string,
    country: string,
  },
  
  // Social
  socialProfiles?: {
    instagram?: string,
    facebook?: string,
    website?: string,
  },
  
  // Project Info
  projectType?: string,
  eventDate?: Date,
  notes?: string,
  
  // Activity
  lastViewedAt?: Date,
  viewCount: number,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
CREATE INDEX idx_client_photographer_id ON clients(photographerId);
CREATE INDEX idx_client_email ON clients(email);
CREATE INDEX idx_client_created_at ON clients(createdAt);
```

### Album

Represents a print album design.

**Album Entity:**
```typescript
interface Album {
  // Identifiers
  id: string, // UUID
  photographerId: string, // FK -> User
  
  // Basic Info
  name: string,
  description?: string,
  
  // Design
  design: {
    template: string,
    coverPhoto?: string,
    spreads: AlbumSpread[],
    layout: 'standard' | 'premium' | 'luxury',
  },
  
  // Print Specs
  printSpecs?: {
    size: string, // e.g., "8x10", "11x14"
    pages: number,
    paperType: string,
    binding: string,
    hardcover: boolean,
  },
  
  // Status
  status: 'draft' | 'proofing' | 'approved' | 'printing' | 'shipped' | 'archived',
  
  // Proofing
  proofingStatus?: 'pending' | 'approved' | 'rejected',
  proofingNotes?: string,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  approvedAt?: Date,
}

interface AlbumSpread {
  id: string,
  pageNumber: number,
  layout: string,
  photos: {
    photoId: string,
    position: number,
    crop?: {
      x: number,
      y: number,
      width: number,
      height: number,
    },
  }[],
  text?: {
    content: string,
    position: string,
    fontSize: number,
    fontFamily: string,
  },
}

// Indexes
CREATE INDEX idx_album_photographer_id ON albums(photographerId);
CREATE INDEX idx_album_status ON albums(status);
CREATE INDEX idx_album_created_at ON albums(createdAt);
```

### Booking

Represents a booking request.

**Booking Entity:**
```typescript
interface Booking {
  // Identifiers
  id: string, // UUID
  photographerId: string, // FK -> User
  clientId?: string, // FK -> Client
  
  // Client Info
  clientName: string,
  clientEmail: string,
  clientPhone?: string,
  
  // Service
  serviceType: string, // e.g., "wedding", "portrait", "event"
  eventDate: Date,
  eventTime?: string,
  eventLocation?: string,
  
  // Details
  description?: string,
  budget?: number,
  duration?: number, // Hours
  
  // Status
  status: 'inquiry' | 'quoted' | 'confirmed' | 'completed' | 'cancelled',
  
  // Payment
  quote?: number,
  deposit?: number,
  depositPaid: boolean,
  totalPrice?: number,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  confirmedAt?: Date,
  completedAt?: Date,
}

// Indexes
CREATE INDEX idx_booking_photographer_id ON bookings(photographerId);
CREATE INDEX idx_booking_client_id ON bookings(clientId);
CREATE INDEX idx_booking_status ON bookings(status);
CREATE INDEX idx_booking_event_date ON bookings(eventDate);
```

### Person

Represents a person for face tagging.

**Person Entity:**
```typescript
interface Person {
  // Identifiers
  id: string, // UUID
  photographerId: string, // FK -> User
  
  // Info
  name: string,
  description?: string,
  
  // Photo
  profilePhoto?: string, // URL
  
  // Metadata
  photoCount: number,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
CREATE INDEX idx_person_photographer_id ON persons(photographerId);
CREATE INDEX idx_person_name ON persons(name);
```

### Subscription

Represents subscription information.

**Subscription Entity:**
```typescript
interface Subscription {
  // Identifiers
  id: string, // UUID
  userId: string, // FK -> User
  
  // Tier
  tier: 'free' | 'starter' | 'professional' | 'business' | 'enterprise',
  
  // Billing
  billingCycle: 'monthly' | 'annual',
  price: number,
  currency: string,
  
  // Dates
  startDate: Date,
  endDate: Date,
  renewalDate: Date,
  
  // Status
  status: 'active' | 'trial' | 'expired' | 'cancelled',
  
  // Payment
  paymentMethod?: string,
  stripeSubscriptionId?: string,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
  cancelledAt?: Date,
}

// Indexes
CREATE INDEX idx_subscription_user_id ON subscriptions(userId);
CREATE INDEX idx_subscription_status ON subscriptions(status);
CREATE INDEX idx_subscription_renewal_date ON subscriptions(renewalDate);
```

### Invitation

Represents a client invitation to a gallery.

**Invitation Entity:**
```typescript
interface Invitation {
  // Identifiers
  id: string, // UUID
  galleryId: string, // FK -> Gallery
  clientId?: string, // FK -> Client
  
  // Invitation Details
  email: string,
  accessLevel: 'view' | 'select' | 'download',
  
  // Access Control
  passwordProtected: boolean,
  password?: string, // Hashed
  accessCode?: string,
  
  // Expiration
  expiresAt?: Date,
  
  // Status
  status: 'pending' | 'accepted' | 'rejected' | 'expired',
  
  // Tracking
  viewedAt?: Date,
  acceptedAt?: Date,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
}

// Indexes
CREATE INDEX idx_invitation_gallery_id ON invitations(galleryId);
CREATE INDEX idx_invitation_client_id ON invitations(clientId);
CREATE INDEX idx_invitation_email ON invitations(email);
CREATE INDEX idx_invitation_status ON invitations(status);
```

---

## Relationships

### Entity Relationship Diagram

```
User (1) ──────────────── (N) Gallery
  │                          │
  │                          └─── (N) Photo
  │                          └─── (N) Invitation
  │
  ├─ (1) Subscription
  │
  ├─ (N) Client
  │  │
  │  └─ (N) Invitation
  │
  ├─ (N) Album
  │
  ├─ (N) Booking
  │
  └─ (N) Person
     │
     └─ (N) FaceDetection (in Photo)
```

### Relationship Rules

**User → Gallery (1:N)**
- One user can have many galleries
- Gallery must belong to exactly one user
- Deleting user cascades to galleries

**Gallery → Photo (1:N)**
- One gallery can have many photos
- Photo must belong to exactly one gallery
- Deleting gallery cascades to photos

**User → Client (1:N)**
- One user can have many clients
- Client belongs to exactly one user
- Deleting user cascades to clients

**Gallery → Invitation (1:N)**
- One gallery can have many invitations
- Invitation belongs to exactly one gallery
- Deleting gallery cascades to invitations

**Client → Invitation (1:N)**
- One client can have many invitations
- Invitation can belong to one client (optional)
- Deleting client cascades to invitations

**User → Album (1:N)**
- One user can have many albums
- Album belongs to exactly one user
- Deleting user cascades to albums

**User → Booking (1:N)**
- One user can have many bookings
- Booking belongs to exactly one user
- Deleting user cascades to bookings

**User → Person (1:N)**
- One user can have many persons
- Person belongs to exactly one user
- Deleting user cascades to persons

**Person → Photo (N:N)**
- One person can appear in many photos
- One photo can have many persons
- Relationship tracked via FaceDetection

---

## Data Constraints

### Field Constraints

**User:**
- email: Required, unique, valid email format
- firstName: Required, 1-100 characters
- lastName: Required, 1-100 characters
- passwordHash: Required, minimum 60 characters (Argon2id)

**Gallery:**
- name: Required, 1-255 characters
- photographerId: Required, must exist in users table
- slug: Required, unique, lowercase, alphanumeric + hyphens

**Photo:**
- galleryId: Required, must exist in galleries table
- fileName: Required, 1-255 characters
- fileSize: Required, > 0, ≤ 50MB
- mimeType: Required, must be in allowed types

**Client:**
- email: Required, valid email format
- firstName: Required, 1-100 characters
- lastName: Required, 1-100 characters
- photographerId: Required, must exist in users table

**Booking:**
- photographerId: Required, must exist in users table
- clientName: Required, 1-255 characters
- clientEmail: Required, valid email format
- eventDate: Required, must be in future

---

## Indexes

### Performance Indexes

**User Indexes:**
```sql
CREATE UNIQUE INDEX idx_user_email ON users(email);
CREATE INDEX idx_user_status ON users(status);
CREATE INDEX idx_user_subscription_tier ON users(subscriptionTier);
CREATE INDEX idx_user_created_at ON users(createdAt);
```

**Gallery Indexes:**
```sql
CREATE INDEX idx_gallery_photographer_id ON galleries(photographerId);
CREATE INDEX idx_gallery_is_public ON galleries(isPublic);
CREATE INDEX idx_gallery_created_at ON galleries(createdAt);
CREATE UNIQUE INDEX idx_gallery_slug ON galleries(slug);
```

**Photo Indexes:**
```sql
CREATE INDEX idx_photo_gallery_id ON photos(galleryId);
CREATE INDEX idx_photo_status ON photos(status);
CREATE INDEX idx_photo_uploaded_at ON photos(uploadedAt);
CREATE INDEX idx_photo_tags ON photos USING GIN(tags);
```

**Booking Indexes:**
```sql
CREATE INDEX idx_booking_photographer_id ON bookings(photographerId);
CREATE INDEX idx_booking_status ON bookings(status);
CREATE INDEX idx_booking_event_date ON bookings(eventDate);
```

---

## Data Integrity

### Referential Integrity

All foreign keys enforce referential integrity:

```sql
ALTER TABLE galleries
ADD CONSTRAINT fk_gallery_photographer
FOREIGN KEY (photographerId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE photos
ADD CONSTRAINT fk_photo_gallery
FOREIGN KEY (galleryId) REFERENCES galleries(id) ON DELETE CASCADE;

ALTER TABLE invitations
ADD CONSTRAINT fk_invitation_gallery
FOREIGN KEY (galleryId) REFERENCES galleries(id) ON DELETE CASCADE;
```

### Unique Constraints

Enforce uniqueness where required:

```sql
ALTER TABLE users
ADD CONSTRAINT uk_user_email UNIQUE (email);

ALTER TABLE galleries
ADD CONSTRAINT uk_gallery_slug UNIQUE (slug);
```

### Check Constraints

Enforce business rules:

```sql
ALTER TABLE photos
ADD CONSTRAINT ck_photo_file_size CHECK (fileSize > 0 AND fileSize <= 52428800);

ALTER TABLE bookings
ADD CONSTRAINT ck_booking_event_date CHECK (eventDate > NOW());
```

---

## Data Types

### Standard Data Types

**Identifiers:**
- UUID (36 characters)
- Format: `550e8400-e29b-41d4-a716-446655440000`

**Strings:**
- VARCHAR(n) for fixed-length strings
- TEXT for variable-length content

**Numbers:**
- INTEGER for counts
- BIGINT for large numbers
- DECIMAL(10,2) for currency

**Dates:**
- TIMESTAMP for precise timestamps
- DATE for date-only values

**Booleans:**
- BOOLEAN for true/false values

**JSON:**
- JSONB for structured data (PostgreSQL)

---

## Scalability Considerations

### Partitioning Strategy

Partition large tables by date:

```sql
-- Partition photos by upload date
CREATE TABLE photos_2025_01 PARTITION OF photos
FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE photos_2025_02 PARTITION OF photos
FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

### Archival Strategy

Archive old data:

```sql
-- Archive photos older than 2 years
INSERT INTO photos_archive
SELECT * FROM photos
WHERE uploadedAt < NOW() - INTERVAL '2 years';

DELETE FROM photos
WHERE uploadedAt < NOW() - INTERVAL '2 years';
```

---

## Multi-Tenancy Implementation

### Workspace Isolation

**Workspace Entity:**
```typescript
interface Workspace {
  id: string, // UUID
  name: string,
  slug: string, // Unique
  ownerId: string, // FK -> User
  
  // Settings
  settings: {
    timezone: string,
    language: string,
    currency: string,
    dateFormat: string,
  },
  
  // Subscription
  subscriptionTier: string,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date,
}
```

### Row-Level Security (RLS)

**PostgreSQL RLS Policy:**
```sql
-- Enable RLS on all customer tables
ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own workspace data
CREATE POLICY workspace_isolation ON galleries
  USING (workspace_id = current_setting('app.workspace_id')::uuid);

CREATE POLICY workspace_isolation ON photos
  USING (workspace_id = current_setting('app.workspace_id')::uuid);
```

### Workspace ID Filtering

**Backend Implementation:**
```typescript
// Every query must include workspace_id filter
const galleries = await db.query(
  'SELECT * FROM galleries WHERE workspace_id = $1',
  [req.user.workspaceId]
);

// Never trust client-provided workspace_id
// Always use authenticated user's workspace_id
```

---

## Vector Storage for AI

### pgvector Extension

**Embeddings Storage:**
```typescript
interface PhotoEmbedding {
  id: string,
  photoId: string, // FK -> Photo
  embeddingModel: string, // e.g., "text-embedding-3-small"
  embedding: number[], // 1536-dimensional vector
  metadata: {
    tags: string[],
    description: string,
    confidence: number,
  },
  createdAt: Date,
}

// Create index for similarity search
CREATE INDEX ON photo_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Semantic Search

**Vector Similarity Query:**
```sql
-- Find similar photos using cosine similarity
SELECT photo_id, 1 - (embedding <=> $1) as similarity
FROM photo_embeddings
WHERE workspace_id = $2
ORDER BY embedding <=> $1
LIMIT 10;
```

---

## Caching Strategy

### Redis Cache Layers

**Cache Keys:**
```
gallery:{galleryId} - Gallery metadata
gallery:{galleryId}:photos - Photo list
photo:{photoId} - Photo metadata
user:{userId}:settings - User settings
session:{sessionId} - Session data
```

**Cache TTL:**
```
Gallery metadata: 1 hour
Photo list: 30 minutes
Photo metadata: 1 hour
User settings: 24 hours
Session data: 1 hour (sliding)
```

### Cache Invalidation

**Invalidation Triggers:**
```typescript
// When gallery is updated
await redis.del(`gallery:${galleryId}`);
await redis.del(`gallery:${galleryId}:photos`);

// When photo is added/removed
await redis.del(`gallery:${galleryId}:photos`);

// When user settings change
await redis.del(`user:${userId}:settings`);
```

---

## Audit Logging

### Audit Log Entity

```typescript
interface AuditLog {
  id: string,
  workspaceId: string,
  userId: string,
  action: string, // e.g., "gallery.created", "photo.deleted"
  resourceType: string, // e.g., "gallery", "photo"
  resourceId: string,
  changes: {
    before: Record<string, any>,
    after: Record<string, any>,
  },
  ipAddress: string,
  userAgent: string,
  timestamp: Date,
}

// Index for efficient queries
CREATE INDEX idx_audit_log_workspace_id ON audit_logs(workspaceId);
CREATE INDEX idx_audit_log_resource_id ON audit_logs(resourceId);
CREATE INDEX idx_audit_log_timestamp ON audit_logs(timestamp);
```

### Audit Events

**Tracked Events:**
- User login/logout
- Gallery created/updated/deleted
- Photo uploaded/deleted
- Client invited/removed
- Booking created/updated
- Payment processed
- Settings changed
- User permissions changed

---

## Performance Optimization

### Query Optimization

**Common Query Patterns:**
```sql
-- Get user's galleries with photo count
SELECT g.*, COUNT(p.id) as photo_count
FROM galleries g
LEFT JOIN photos p ON g.id = p.gallery_id
WHERE g.photographer_id = $1
GROUP BY g.id
ORDER BY g.created_at DESC;

-- Get photos with EXIF data
SELECT p.*, e.camera, e.lens, e.iso
FROM photos p
LEFT JOIN exif_data e ON p.id = e.photo_id
WHERE p.gallery_id = $1
ORDER BY p.uploaded_at DESC;
```

### Index Strategy

**Composite Indexes:**
```sql
-- Frequently filtered combinations
CREATE INDEX idx_gallery_photographer_created 
ON galleries(photographer_id, created_at DESC);

CREATE INDEX idx_photo_gallery_status 
ON photos(gallery_id, status);

CREATE INDEX idx_booking_photographer_event_date 
ON bookings(photographer_id, event_date DESC);
```

---

## Data Retention

### Retention Policies

**Default Retention:**
- Active data: Indefinite
- Deleted data: 30 days (soft delete)
- Audit logs: 3 years
- Backups: 30 days

**Soft Delete Implementation:**
```typescript
interface SoftDeleteEntity {
  // ... other fields
  deletedAt?: Date, // NULL = active, timestamp = deleted
}

// Query only active records
SELECT * FROM galleries WHERE deleted_at IS NULL;

// Restore deleted record
UPDATE galleries SET deleted_at = NULL WHERE id = $1;
```

---

## Related Files

- `backend/src/db/migrations/` - Database migrations
- `backend/src/db/schema.sql` - Schema definition
- `backend/src/models/` - Model definitions
- `frontend/src/types/types.ts` - TypeScript type definitions
- `docs/project/01-TECH_STACK.md` - Technology stack and architecture
- `docs/TechnicalSpecs/storage_ingestion_byos.json` - Storage specifications
- `docs/TechnicalSpecs/geo_search.json` - Semantic search specifications

## Last Updated

2025-12-17
