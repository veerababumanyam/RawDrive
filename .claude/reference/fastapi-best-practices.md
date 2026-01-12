# FastAPI Microservices Best Practices Reference

A concise guide for building services in the RawDrive microservice ecosystem.

---

## Table of Contents

1. [Project Structure (Microservice)](#1-project-structure-microservice)
2. [Pydantic v2 Models](#2-pydantic-v2-models)
3. [Dependency Injection & Services](#3-dependency-injection--services)
4. [Routing & API Versioning](#4-routing--api-versioning)
5. [Error Handling (Standardized)](#5-error-handling-standardized)
6. [Async Database & Transactions](#6-async-database--transactions)
7. [Security & Auth](#7-security--auth)
8. [Performance](#8-performance)

---

## 1. Project Structure (Microservice)

Each microservice (e.g., `apps/gallery-service`) follows this structure:

```text
src/
├── app/
│   ├── api/
│   │   ├── v1/
│   │   │   └── endpoints/   # Route handlers
│   │   └── deps.py          # Dependency definitions
│   ├── core/
│   │   ├── config.py        # Pydantic Settings
│   │   └── security.py      # Auth logic
│   ├── db/
│   │   ├── session.py       # Async engine/session
│   │   └── base.py          # SQLAlchemy Base
│   ├── models/              # ORM Models
│   ├── schemas/             # Pydantic Schemas
│   ├── services/            # Business Logic Layer
│   └── main.py              # App entrypoint
├── tests/
├── alembic/
└── pyproject.toml
```

**Rule:** Keep business logic in `services/`, not in route handlers.

---

## 2. Pydantic v2 Models

We use **Pydantic v2**. Note the configuration changes from v1.

### Schema Config

```python
from pydantic import BaseModel, ConfigDict, Field

class UserBase(BaseModel):
    email: str
    is_active: bool = True
    
    # v2 Config
    model_config = ConfigDict(from_attributes=True) 
```

### Validation

Use `field_validator` and `model_validator`.

```python
from pydantic import field_validator

@field_validator('slug')
def validate_slug(cls, v: str) -> str:
    if not v.islower():
        raise ValueError('Slug must be lowercase')
    return v
```

---

## 3. Dependency Injection & Services

### Database Session

Always use `deps.get_db` for async sessions.

```python
@router.get("/")
async def get_users(db: AsyncSession = Depends(deps.get_db)):
    ...
```

### Service Layer Injection

Inject services to keep routes clean.

```python
# services/user_service.py
class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, id: UUID) -> User:
        ...

# api/v1/endpoints/users.py
async def get_user_service(db: AsyncSession = Depends(deps.get_db)) -> UserService:
    return UserService(db)

@router.get("/{id}")
async def get_user(
    id: UUID,
    service: UserService = Depends(get_user_service)
):
    return await service.get_by_id(id)
```

### Current User / Workspace

Common dependencies used across services:

```python
CurrentWorkspace = Annotated[Workspace, Depends(deps.get_current_workspace)]
CurrentUser = Annotated[User, Depends(deps.get_current_user)]
```

---

## 4. Routing & API Versioning

*   **Prefix:** Always use `/api/v1`.
*   **Tags:** Use tags for grouping in Swagger UI (e.g., `["galleries"]`).
*   **Routers:** Split routers by resource.

```python
# main.py
app.include_router(galleries.router, prefix="/api/v1/galleries", tags=["galleries"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["assets"])
```

---

## 5. Error Handling (Standardized)

Use `HTTPException` with clear detail messages. Ensure errors are machine-parsable if needed.

```python
from fastapi import HTTPException, status

raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Gallery not found",
)
```

**Global Exception Handlers:**
Defined in `app/main.py` to catch `RequestValidationError` and `SQLAlchemyError` to return clean JSON errors instead of 500 crashes.

---

## 6. Async Database & Transactions

All DB IO must be `await`ed.

*   **Select:** `(await db.execute(select(Model))).scalars().all()`
*   **Commit:** `await db.commit()`
*   **Rollback:** Happens automatically in dependency on error, but intentional rollback: `await db.rollback()`.

---

## 7. Security & Auth

*   **JWT:** `OAuth2PasswordBearer` flows. Services validate tokens via shared secret or Public Key (if separate auth server).
*   **Scopes:** Use scopes for permissions (e.g., `galleries:read`, `galleries:write`).
*   **Password Hashing:** Passlib with Argon2 or Bcrypt.

---

## 8. Performance

*   **Pagination:** ALWAYS implement pagination (`skip`/`limit` or cursor-based) for list endpoints.
*   **N+1 Queries:** Use `selectinload` options in SQLAlchemy queries.
*   **FastAPI Response Model:** Using `response_model` ensures output filtering (removing secrets) but has serialization cost. For huge lists, return standard dictionaries or use ORjson.

```python
from fastapi.responses import ORJSONResponse

@app.get("/items", response_class=ORJSONResponse)
```
