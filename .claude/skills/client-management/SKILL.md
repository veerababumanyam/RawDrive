---
name: client-management
description: "Client CRM and contact management for RawDrive: client CRUD, favorites, reviews, avatars, activity tracking, smart lists, duplicate detection, engagement metrics, and the client-service microservice. Use this skill when building client management features, working with client profiles, implementing favorites/selections, managing client-gallery relationships, or working with the client-service (PORT_CLIENT, default 8011). Also use for client communication tracking, referral analytics, or contact management. Triggers on: client, contact, CRM, client management, favorites, client review, client avatar, engagement, client activity, smart list, duplicate detection, client-service, referral."
---

# Client Management

RawDrive's client CRM lets photographers manage contacts, track engagement, and link clients to galleries.

## Client Service Architecture

```
services/client-service/src/
├── api/              # REST endpoints
├── cache/            # Redis caching layer
├── config.py
├── constants/        # Service constants
├── middleware/       # Auth, correlation, rate limiting
├── observability/    # Health checks, metrics
├── repositories/     # Data access with workspace isolation
├── schemas/          # 80+ Pydantic schemas
├── services/         # Business logic
└── workers/          # Background jobs
```

## Core Features

### Client CRUD
```python
# Backend endpoints: backend/src/app/api/v1/clients.py
POST   /api/v1/clients                    # Create client
GET    /api/v1/clients                    # List (paginated, filterable)
GET    /api/v1/clients/{id}              # Get details
PATCH  /api/v1/clients/{id}              # Update
DELETE /api/v1/clients/{id}              # Soft delete
```

### Contact & Address Management
```python
POST   /api/v1/clients/{id}/contacts     # Add phone/email
POST   /api/v1/clients/{id}/addresses    # Add address
```

### Client-Gallery Linking
```python
# Link clients to galleries with roles
POST   /api/v1/clients/{id}/galleries
# Roles: VIEWER, COLLABORATOR, SUBJECT

# Client can have multiple gallery associations
# Gallery can have multiple client associations
```

### Favorites & Selections
```python
# Clients mark favorite photos in shared galleries
POST   /api/v1/clients/{id}/favorites/{asset_id}
GET    /api/v1/clients/{id}/favorites
DELETE /api/v1/clients/{id}/favorites/{asset_id}

# Selection sync between photographer and client
# Real-time updates via collaboration context
```

### Activity & Analytics
```python
# Automatic activity logging
GET    /api/v1/clients/{id}/activity          # Activity timeline
GET    /api/v1/clients/{id}/engagement        # Engagement metrics
GET    /api/v1/clients/{id}/referrals         # Referral analytics
GET    /api/v1/clients/{id}/communications    # Communication history
```

## Smart Features

### Smart Lists
Dynamic client lists based on rules:
```python
# Examples:
# - "Clients who haven't viewed galleries in 30 days"
# - "Clients with upcoming events"
# - "High-engagement clients (>50 favorites)"
```

### Duplicate Detection
```python
POST   /api/v1/clients/detect-duplicates
# Fuzzy matching on name, email, phone
# Suggests merge candidates

POST   /api/v1/clients/merge
# MergeClientsRequest: source_id, target_id
# Transfers all associations, activity, favorites
```

### Avatars
```python
POST   /api/v1/clients/{id}/avatar          # Upload avatar
DELETE /api/v1/clients/{id}/avatar          # Remove avatar
# Stored in R2: {workspace_id}/clients/{client_id}/avatar.*
```

## Key Schemas

```python
# 80+ Pydantic schemas including:
CreateClientRequest      # Name, email, phone, tags, notes
UpdateClientRequest      # Partial update
ClientDetailResponse     # Full client profile with stats
ClientActivityListResponse
ClientCommunicationListResponse
EngagementMetricsResponse
ReferralAnalyticsResponse
MergeClientsRequest
DetectDuplicatesRequest
```

## Workspace Isolation

Every client query filters by workspace_id — photographers only see their own clients. A client entity belongs to exactly one workspace.

## Reviews
```python
# Clients can leave reviews on completed galleries
POST   /api/v1/clients/{id}/reviews
GET    /api/v1/clients/{id}/reviews
# Reviews include: rating (1-5), text, gallery_id
# Photographers can feature reviews on their public profile
```
