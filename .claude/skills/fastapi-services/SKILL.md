---
name: fastapi-services
description: "RawDrive backend development with FastAPI, SQLAlchemy 2.0 async, and the mandatory 3-layer architecture (API -> Service -> Repository). Use this skill when creating or modifying backend endpoints, services, repositories, Pydantic schemas, middleware, or any Python backend code. Also use when someone asks about the backend architecture, dependency injection, error handling, or async patterns. Triggers on: FastAPI, endpoint, service layer, repository, Pydantic, SQLAlchemy, backend API, Python backend."
---

# FastAPI Backend Architecture

RawDrive enforces a strict **3-layer architecture**. Business logic lives in Services, never in API handlers or Models.

## Layer Responsibilities

```
API Handler (api/v1/)     → HTTP concerns only: parse request, call service, return response
Service (services/)       → Business logic, validation, orchestration, cross-cutting concerns
Repository (repositories/) → Database access, query construction, workspace isolation
```

## Creating a New Feature

### 1. Schema (schemas/)
```python
from pydantic import BaseModel, ConfigDict, Field
from uuid import UUID
from datetime import datetime

class GalleryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

class GalleryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
```

### 2. Repository (repositories/)
```python
class GalleryRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, gallery: Gallery) -> Gallery:
        self.db.add(gallery)
        await self.db.flush()
        return gallery

    async def get_by_id(self, gallery_id: UUID, workspace_id: UUID) -> Gallery | None:
        result = await self.db.execute(
            select(Gallery).where(
                Gallery.id == gallery_id,
                Gallery.workspace_id == workspace_id
            )
        )
        return result.scalars().first()
```

### 3. Service (services/)
```python
class GalleryService:
    def __init__(self, db: AsyncSession):
        self.repo = GalleryRepository(db)
        self.db = db

    async def create_gallery(self, data: GalleryCreate, workspace_id: UUID, user_id: UUID) -> Gallery:
        gallery = Gallery(
            name=data.name,
            description=data.description,
            workspace_id=workspace_id,
            created_by=user_id,
        )
        gallery = await self.repo.create(gallery)
        await self.db.commit()
        return gallery
```

### 4. API Handler (api/v1/)
```python
router = APIRouter(prefix="/galleries", tags=["galleries"])

async def get_gallery_service(db: AsyncSession = Depends(get_db)) -> GalleryService:
    return GalleryService(db)

@router.post("/", response_model=GalleryResponse, status_code=201)
async def create_gallery(
    data: GalleryCreate,
    current_user: CurrentUser,
    service: GalleryService = Depends(get_gallery_service),
):
    return await service.create_gallery(
        data=data,
        workspace_id=current_user.workspace_id,
        user_id=current_user.id,
    )
```

## Key Rules

1. **Async everything:** ALL database I/O uses `async/await`. Never `requests.get()` or `time.sleep()`.
2. **Route prefix:** Always `/api/v1/resource-name` (kebab-case)
3. **Dependency injection:** Use `Depends()` for services, DB sessions, auth
4. **Type annotations:** Use `Annotated` types for common dependencies:
   ```python
   CurrentUser = Annotated[User, Depends(get_current_user)]
   CurrentWorkspace = Annotated[Workspace, Depends(get_current_workspace)]
   ```
5. **Error handling:** Raise `HTTPException` with clear messages. Global handlers catch `SQLAlchemyError`.
6. **Pagination:** ALWAYS implement for list endpoints (`skip`/`limit` or cursor-based)
7. **N+1 prevention:** Use `selectinload`/`joinedload` for relationships
8. **Imports:** Absolute only — `from app.services.gallery import GalleryService`

## File Placement

```
backend/src/app/
├── api/v1/          # Route handlers ONLY
├── services/        # Business logic (NEVER in models/)
├── repositories/    # Data access with workspace isolation
├── models/          # SQLAlchemy ORM models ONLY
├── schemas/         # Pydantic request/response schemas
├── middleware/      # FastAPI middleware
├── workers/         # Celery background tasks
├── core/            # Auth, config, exceptions
└── utils/           # Shared utilities
```

**Deep dive:** Read `.claude/reference/fastapi-best-practices.md`
