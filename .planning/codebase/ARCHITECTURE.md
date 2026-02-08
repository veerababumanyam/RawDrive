# RawDrive Architecture

## System Overview

RawDrive is an enterprise SaaS professional photography platform built with a microservices architecture designed for scalability, reliability, and performance.

## Core Architectural Patterns

### 1. Microservices Architecture (13 Services)

RawDrive implements a microservices architecture with 13 dedicated services, each with specific responsibilities:

| Service | Port | Purpose | Key Features |
|---------|------|---------|-------------|
| **Backend** | 8000 | Main API, core features | User management, authentication, asset management |
| **Gallery Service** | 8004 | High-performance gallery viewing | Proofing, public galleries, magic links |
| **Billing Service** | 8005 | Payment processing | Subscriptions, invoices, webhooks |
| **Upload Service** | 8008 | TUS resumable uploads | Chunked uploads, progress tracking |
| **Webhooks Service** | 8003 | Event-driven webhook delivery | HMAC signatures, retry logic |
| **Notifications Service** | 8010 | Multi-channel notifications | Email, SMS, in-app |
| **Onboarding Service** | 8006 | User registration & setup | Workspace creation, billing setup |
| **Invitations Service** | 8007 | Digital wedding invitations | RSVP, guest management |
| **Client Service** | 8009 | Client/contact management | CRM, activity tracking |
| **AI Service** | 8011 | AI orchestration | Workspace tools, RAG integration |
| **AI Processing Service** | 8012 | Heavy AI workloads | Embeddings, CLIP, face detection |
| **LiveSync Service** | 8013 | Real-time file sync | Event-driven file synchronization |
| **LLM Service** | 8014 | LLM integration | Chat completions, tool use |

### 2. Shared Database Pattern

All services connect to the same PostgreSQL database instance with proper isolation:

```yaml
# Database Architecture
PostgreSQL 16 (TimescaleDB)
├── pgvector for embeddings
├── pgvectorscale for StreamingDiskANN
└── TimescaleDB for time-series data
```

**Connection Pooling:**
- **PgBouncer**: Transaction pooling for 5000+ concurrent users
- **Connection Limits**: Configurable per service (10-100 connections)
- **Read Replicas**: Optional read scaling for gallery service

### 3. 3-Layer Architecture Pattern

Every service follows a consistent 3-layer architecture:

```python
# Backend Example: Face Detection
# 1. Repository Layer (Data Access)
class FaceRepository:
    async def create(self, workspace_id, ...):
        # Database queries with workspace isolation
        # SQLAlchemy with asyncpg

# 2. Service Layer (Business Logic)
class FaceDetectionService:
    def __init__(self, repo, cluster_service, ...):
        # Orchestration and business rules
        # Workspace-level configuration
        # AI provider failover

# 3. API Layer (HTTP Handling)
@router.get("/galleries/{gallery_id}/faces")
async def list_gallery_faces(
    gallery_id: UUID,
    workspace_access: WorkspaceAccessDep,
    current_user: CurrentUserDep,
    face_repo: FaceRepoDep,
    ...
):
    # FastAPI route handling
    # Authentication & authorization
    # Request/response validation
```

### 4. Multi-Tenant Isolation

**Workspace ID Pattern:**
- EVERY query includes `workspace_id` for tenant isolation
- JWT tokens contain workspace information
- Database schema enforces workspace separation
- Cache keys prefixed with workspace_id

```python
# Example: Multi-tenant Query
async def get_gallery(gallery_id: UUID, workspace_id: UUID) -> Gallery:
    result = await db.execute(
        select(Gallery)
        .where(Gallery.id == gallery_id)
        .where(Gallery.workspace_id == workspace_id)  # Mandatory filter
    )
    return result.scalar_one_or_none()
```

### 5. API Gateway (Traefik v3)

**Gateway Configuration:**
- **Reverse Proxy**: Routes all external traffic
- **SSL Termination**: HTTPS handling with Let's Encrypt
- **Load Balancing**: Distributes requests to services
- **Middleware**: Authentication, rate limiting, CORS
- **Dynamic Configuration**: File-based routing rules

**Routing Pattern:**
```yaml
# Example routing configuration
http:
  routers:
    gallery:
      rule: "Host(`gallery.rawdrive.in`) && PathPrefix(`/`)"
      service: gallery-service
      middlewares: auth-cors

    billing:
      rule: "Host(`billing.rawdrive.in`) && PathPrefix(`/`)"
      service: billing-service
      middlewares: auth-cors-rate
```

### 6. Async Patterns

**Backend Technologies:**
- **FastAPI**: Async-first web framework
- **SQLAlchemy 2.0**: Async ORM with asyncpg driver
- **Celery**: Background task processing
- **Redis**: Message broker and caching
- **Pydantic**: Data validation and serialization

**Async Patterns:**
```python
# Example: Async Service Method
async def process_photo_upload(photo_id: UUID, workspace_id: UUID):
    # Non-blocking database operations
    async with db.transaction():
        asset = await asset_repo.create(photo_data)

    # Fire-and-forget background task
    background_task_queue.enqueue(process_photo_assets, asset.id)

    # Return immediate response
    return {"upload_id": photo_id, "status": "processing"}
```

### 7. MCP (Model Context Protocol) Integration

**AI Service Architecture:**
- **MCP Server**: Built-in MCP server for workspace tools
- **RAG Integration**: Vector search for workspace context
- **Tool Registry**: Dynamic tool registration and discovery
- **Streaming Responses**: Real-time AI interactions

**MCP Pattern:**
```python
# Example: MCP Tool Registration
class WorkspaceToolsMCP:
    def __init__(self):
        self.tools = {
            "search_gallery": SearchGalleryTool(),
            "analyze_photo": AnalyzePhotoTool(),
            "create_album": CreateAlbumTool()
        }

    async def handle_request(self, request: MCPRequest) -> MCPResponse:
        tool = self.tools.get(request.method)
        if tool:
            return await tool.execute(request.params)
        return MCPResponse.error("Tool not found")
```

## Data Flow Architecture

### 1. Request Flow

```
Client Request → API Gateway (Traefik) → Authentication Service → Target Service
                                                    ↓
                                                Database
                                                    ↓
                                                Redis Cache
                                                    ↓
                                                Message Queue (Celery)
```

### 2. Processing Flow

```
Upload Service → Background Processing → AI Service → Vector DB (Milvus)
                                                    ↓
                                              Gallery Service → CDN (R2)
```

### 3. Event-Driven Architecture

**Message Queue Pattern:**
- **Celery**: Background task processing
- **Redis**: Broker and result backend
- **Topics**: Asset processing, notifications, webhooks

**Example Event Flow:**
```python
# Asset Upload Event Chain
1. Upload Service receives file
2. Creates asset record in database
3. Enqueues "process_asset" task
4. AI Service processes for faces/embeddings
5. Updates asset with AI metadata
6. Triggers gallery cache warming
7. Sends notification to user
```

## Caching Strategy

### Multi-Tier Caching

```yaml
# Redis Configuration
Redis 7
├── L1 Cache: 5min TTL (Session data)
├── L2 Cache: 2min TTL (Gallery metadata)
├── L3 Cache: 30sec TTL (Activity timeline)
└── Message Queue: Celery tasks
```

**Cache Invalidation Patterns:**
- **Write-Through**: Update cache on database write
- **Time-Based Expiration**: Different TTLs per data type
- **Event-Invalidation**: Invalidate on data changes

## Security Architecture

### Authentication & Authorization

**JWT Pattern:**
- **Algorithm**: EdDSA (Ed25519) for secure signatures
- **Claims**: workspace_id, user_id, permissions
- **Validation**: Public key verification in all services
- **Refresh Tokens**: Long-lived session management

**RBAC Pattern:**
- **Workspace RBAC**: Per-workspace permissions
- **Platform RBAC**: System-level permissions
- **Service Boundaries**: Enforced at service level

### Data Protection

```python
# Encryption Pattern
ENCRYPTION_MASTER_KEY  # AES-256 for sensitive data
JWT_SECRET            # Shared JWT signing
API_KEYS              # Service-to-service auth
```

## Observability

### Monitoring Stack

| Component | Purpose | Port |
|-----------|---------|------|
| **Prometheus** | Metrics collection | 9090 |
| **Grafana** | Dashboards | 3000 |
| **Loki** | Log aggregation | 3100 |
| **Alertmanager** | Alerting | 9093 |

### Health Checks

**Service Health:**
```yaml
# Standard Health Endpoint
GET /health/live  # Basic liveness
GET /health/ready # Dependency readiness
GET /metrics      # Prometheus metrics
```

## Scalability Patterns

### Horizontal Scaling

**KEDA Integration:**
- **Upload Service**: Scale 0-20 based on queue length
- **Gallery Service**: Scale 2-50 for magic link traffic
- **AI Processing**: Scale on GPU availability

**Connection Pooling:**
- **PgBouncer**: Transaction pooling for 5000+ connections
- **Redis**: Connection limits per service
- **HTTP**: Keep-alive for service-to-service

### Performance Optimizations

**Database:**
- **StreamingDiskANN**: Vector search at scale
- **Indexing**: Strategic indexes on query patterns
- **Query Optimization**: Async queries with connection pooling

**Caching:**
- **Multi-tier**: L1/L2/L3 cache hierarchy
- **Pre-warming**: Background cache warming
- **CDN**: R2 for asset delivery

## File System Organization

### Service Structure

Each service follows a consistent structure:

```
services/[service-name]/
├── src/
│   ├── api/v1/          # API endpoints
│   ├── services/        # Business logic
│   ├── repositories/    # Data access
│   ├── schemas/         # Pydantic models
│   ├── middleware/      # HTTP middleware
│   └── observability/   # Health checks, metrics
├── tests/               # Unit, integration
├── Dockerfile          # Container definition
└── requirements.txt    # Dependencies
```

### Shared Packages

```yaml
# Monorepo with pnpm workspaces
packages/
├── shared-types/        # Domain types
├── shared-constants/    # Configuration constants
├── shared-validation/   # Validation utilities
└── shared-utils/        # General utilities
```

## Technology Stack

### Frontend
- **React 18.3** with TypeScript
- **Vite** for fast development
- **React Router** for navigation
- **TailwindCSS** for styling
- **Zustand** for state management

### Backend
- **Python 3.11** with FastAPI
- **SQLAlchemy 2.0** async ORM
- **Pydantic** for validation
- **Celery** for background tasks
- **Alembic** for migrations

### Infrastructure
- **Docker** for containerization
- **Traefik v3** for API gateway
- **PostgreSQL 16** with TimescaleDB
- **Redis 7** for caching
- **Prometheus** for monitoring
- **Milvus** for vector search

## Deployment Architecture

### Container Orchestration

```yaml
# Docker Compose Services
├── Application Services (13)
├── Infrastructure (PostgreSQL, Redis, Traefik)
├── Monitoring (Prometheus, Grafana, Loki)
└── Storage (R2, Milvus, etcd)
```

### Environment Strategy

- **Development**: Docker Compose with hot reload
- **Staging**: Kubernetes with auto-scaling
- **Production**: Multi-region deployment with failover

## Future Considerations

### Scalability
- **Sharding**: Database partitioning for multi-tenant scale
- **Geo-Replication**: Regional deployment for global users
- **Edge Caching**: CDN edge locations for faster delivery

### Performance
- **GraphQL**: Potential for optimized data fetching
- **gRPC**: Internal service communication
- **Redis Cluster**: Horizontal caching scaling

### Observability
- **Distributed Tracing**: Jaeger for request tracing
- **Advanced Metrics**: Custom metric instrumentation
- **Log Correlation**: Trace ID propagation across services

---

*This document provides a comprehensive overview of RawDrive's architecture. For specific implementation details, refer to the individual service documentation and codebase structure.*