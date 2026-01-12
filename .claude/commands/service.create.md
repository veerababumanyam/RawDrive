---
description: Create a new microservice in the RawDrive platform
---

# Create New Microservice

Create a new FastAPI microservice following RawDrive's architecture patterns.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [Microservices Patterns](../reference/microservices-patterns.md)
  - [FastAPI Best Practices](../reference/fastapi-best-practices.md)
  - [Coding Standards](../reference/coding-standards.md)
  - [Security Best Practices](../reference/security-best-practices.md)
  - [Observability Best Practices](../reference/observability-best-practices.md)

## Usage

```
/service.create <service-name> <port> <description>
```

Example:
```
/service.create analytics 8014 "Analytics and reporting service"
```

## Steps

### 1. Create Service Directory Structure

```bash
mkdir -p services/<service-name>/src/{api/v1,services,repositories,schemas,middleware,cache,observability}
mkdir -p services/<service-name>/tests/{unit,integration,load}
```

### 2. Create Core Files

#### `services/<service-name>/src/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from .api.v1 import router as api_router
from .observability.health import router as health_router
from .config import settings

app = FastAPI(
    title="<ServiceName> Service",
    description="<Description>",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics
Instrumentator().instrument(app).expose(app)

# Routes
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(api_router, prefix="/api/v1", tags=["api"])

@app.get("/")
async def root():
    return {"service": "<service-name>", "status": "running"}
```

#### `services/<service-name>/src/config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Service
    SERVICE_NAME: str = "<service-name>"
    SERVICE_PORT: int = <port>
    
    # Database
    DATABASE_URL: str
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT
    JWT_SECRET: str
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    class Config:
        env_file = ".env"

settings = Settings()
```

#### `services/<service-name>/Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE <port>

# Run application
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "<port>"]
```

#### `services/<service-name>/requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.31
asyncpg==0.29.0
redis==5.0.7
pydantic==2.7.4
pydantic-settings==2.3.4
prometheus-fastapi-instrumentator==7.0.0
python-jose[cryptography]==3.3.0
```

### 3. Create Health Check

#### `services/<service-name>/src/observability/health.py`

```python
from fastapi import APIRouter, status
from sqlalchemy import text
from ..database import get_db

router = APIRouter()

@router.get("/live", status_code=status.HTTP_200_OK)
async def liveness():
    """Kubernetes liveness probe"""
    return {"status": "alive"}

@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness():
    """Kubernetes readiness probe - checks dependencies"""
    try:
        # Check database
        async with get_db() as db:
            await db.execute(text("SELECT 1"))
        
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        return {"status": "not ready", "error": str(e)}
```

### 4. Add to Docker Compose

Add to `infrastructure/docker/docker-compose.yml`:

```yaml
  <service-name>:
    build:
      context: ../../services/<service-name>
      dockerfile: Dockerfile
    container_name: rawdrive-<service-name>
    ports:
      - "<port>:<port>"
    environment:
      - DATABASE_URL=postgresql://rawdrive:rawdrive@postgres:5432/rawdrive
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - postgres
      - redis
    restart: unless-stopped
    networks:
      - rawdrive-network
```

### 5. Add Traefik Routing

Add to `infrastructure/docker/traefik/dynamic.yaml`:

```yaml
  <service-name>-router:
    rule: "PathPrefix(`/api/v1/<service-name>`)"
    service: <service-name>-service
    priority: 140
    middlewares:
      - rate-limit

services:
  <service-name>-service:
    loadBalancer:
      servers:
        - url: "http://<service-name>:<port>"
```

### 6. Create Tests

#### `services/<service-name>/tests/test_health.py`

```python
import pytest
from httpx import AsyncClient
from src.main import app

@pytest.mark.asyncio
async def test_liveness():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health/live")
        assert response.status_code == 200
        assert response.json()["status"] == "alive"
```

### 7. Update Documentation

Add service to:
- `README.md` - Service URLs table
- `CLAUDE.md` - Microservices architecture section
- `docs/ARCHITECTURE_QUICK_REFERENCE.md`

### 8. Create README

#### `services/<service-name>/README.md`

```markdown
# <ServiceName> Service

<Description>

## Features

- Feature 1
- Feature 2

## API Endpoints

- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /api/v1/<service-name>/*` - Service endpoints

## Development

```bash
# Run locally
cd services/<service-name>
uvicorn src.main:app --reload --port <port>

# Run tests
pytest

# Run with Docker
docker compose up <service-name>
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - JWT signing secret
```

## Verification

1. Start the service: `docker compose up <service-name>`
2. Check health: `curl http://localhost:<port>/health/live`
3. Check docs: `http://localhost:<port>/docs`
4. Verify Traefik routing: Check Traefik dashboard

## Notes

- Follow RawDrive's 3-layer architecture: Repository → Service → API
- Always include workspace_id for multi-tenant isolation
- Use shared JWT_SECRET across all services
- Implement Prometheus metrics
- Add comprehensive error handling
