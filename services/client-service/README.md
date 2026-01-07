# Client CRM & Relationship Management Microservice

Production-grade microservice for comprehensive client relationship management in the RawDrive photography platform.

## Overview

**Status**: Production Ready (Phases 1-10 Complete)  
**Port**: 8007 (dev), TBD (prod)  
**API Endpoints**: 75+  
**Database**: Shared PostgreSQL with workspace isolation  
**Caching**: 3-tier Redis strategy  

## Quick Start

```bash
# Development
cd services/client-service
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8007

# Docker
docker-compose -f docker-compose.client-service.yaml up -d

# Health check
curl http://localhost:8007/health
```

## Features Implemented

### Phase 1-5: Foundation ✅
- FastAPI with lifespan management
- asyncpg connection pools
- Redis with circuit breaker
- JWT auth with shared secret
- Prometheus metrics
- Rate limiting (10-200 req/min)
- Client CRUD with 3-tier caching
- Contacts & addresses (multi-support)
- Tags with bulk operations
- Gallery linking with proofing stats

### Phase 6-10: Advanced Features ✅
- Activity timeline (unified manual + system events)
- Communication history with follow-ups
- Smart lists (dynamic segmentation)
- CSV import/export (duplicate detection)
- Bulk operations (tags, status, delete)

## Performance Targets

- Client list: < 300ms (10K clients)
- Detail load: < 500ms
- Search: < 200ms
- KEDA autoscaling: 2-20 replicas
- Rate: 100 RPS per pod sustained

## Environment Variables

```bash
DATABASE_URL=postgresql://...
REDIS_URL=redis://redis:6379/0
JWT_SECRET=<64-byte-hex>
CORS_ORIGINS=http://localhost:3000,https://rawdrive.io
```

## Documentation

See full documentation in this README and `/docs/Features/` directory.

## License

Proprietary - RawDrive Platform
