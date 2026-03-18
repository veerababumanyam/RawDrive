---
name: database-migrations
description: "PostgreSQL schema design, SQLAlchemy 2.0 async models, Alembic migrations, pgvector, and indexing for RawDrive. Use this skill when creating or modifying database models, writing migrations, designing schemas, adding indexes, working with vector embeddings, or optimizing queries. Also use for relationship loading strategies (selectinload vs joinedload), JSONB columns, enum types, or any database-related decisions. Triggers on: database, migration, model, SQLAlchemy, Alembic, schema, index, pgvector, query optimization, PostgreSQL."
---

# Database & Migration Patterns

RawDrive uses PostgreSQL 16 + SQLAlchemy 2.0 async + Alembic. Every table requires workspace_id for multi-tenant isolation.

## Model Template

```python
from sqlalchemy import Column, String, DateTime, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.db.base import Base
import uuid

class Gallery(Base):
    __tablename__ = "galleries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    metadata_ = Column("metadata", JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=text("NOW()"))
    updated_at = Column(DateTime(timezone=True), server_default=text("NOW()"), onupdate=text("NOW()"))

    # Relationships
    assets = relationship("Asset", back_populates="gallery", lazy="noload")

    __table_args__ = (
        Index("ix_galleries_workspace_created", "workspace_id", "created_at"),
    )
```

## Schema Design Rules

| Aspect | Convention |
|--------|-----------|
| Table names | `snake_case` plural: `gallery_assets` |
| Column names | `snake_case`: `created_at` |
| Primary keys | UUIDv4 (never sequential integers) |
| Foreign keys | `target_table_id`: `gallery_id`, `owner_id` |
| Timestamps | UTC with timezone, server-side defaults |
| Flexible data | JSONB (not JSON) |
| Enums | Native PostgreSQL ENUM types |
| Multi-tenancy | **Every table has `workspace_id`** |

## Async Query Patterns

```python
# 2.0 style - ALWAYS use this
from sqlalchemy import select
from sqlalchemy.orm import selectinload, joinedload

# Basic query
result = await session.execute(
    select(Gallery).where(
        Gallery.workspace_id == workspace_id,
        Gallery.id == gallery_id
    )
)
gallery = result.scalars().first()

# One-to-many: use selectinload
result = await session.execute(
    select(Gallery).options(selectinload(Gallery.assets))
    .where(Gallery.workspace_id == workspace_id)
)

# Many-to-one: use joinedload
result = await session.execute(
    select(Asset).options(joinedload(Asset.gallery))
    .where(Asset.workspace_id == workspace_id)
)

# CRITICAL: Async SQLAlchemy CANNOT implicit lazy load - always specify loading strategy
```

## Indexing Strategy

```python
# Foreign keys - always index
Column(UUID, ForeignKey("workspaces.id"), index=True)

# Composite index for common filter pairs
Index("ix_assets_workspace_created", "workspace_id", "created_at")

# Partial index for active records
Index("ix_galleries_active", "workspace_id", postgresql_where=text("deleted_at IS NULL"))

# GIN index for JSONB search
Index("ix_assets_metadata", "metadata", postgresql_using="gin")

# Vector index (pgvector HNSW) - required for >10k vectors
Index(
    "ix_assets_embedding",
    "embedding",
    postgresql_using="hnsw",
    postgresql_with={"m": 16, "ef_construction": 64},
    postgresql_ops={"embedding": "vector_cosine_ops"}
)
```

## Migration Workflow

```bash
# Create migration (Docker)
docker exec rawdrive-backend alembic revision --autogenerate -m "add gallery_password column"

# Apply migration
docker exec rawdrive-backend alembic upgrade head

# Rollback one step
docker exec rawdrive-backend alembic downgrade -1
```

**Migration rules:**
- Autogenerate is a DRAFT - always review the generated file
- Enum changes need manual `op.execute("ALTER TYPE ... ADD VALUE ...")`
- Separate schema changes from heavy data backfills
- Test migrations on a copy of production data before applying

## pgvector for Embeddings

```python
from pgvector.sqlalchemy import Vector

class AssetEmbedding(Base):
    __tablename__ = "asset_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id = Column(UUID, ForeignKey("assets.id"), nullable=False)
    workspace_id = Column(UUID, ForeignKey("workspaces.id"), nullable=False)
    embedding = Column(Vector(768))  # Gemini=768, CLIP=512, Face=128

# Similarity search (always filter by workspace_id!)
stmt = (
    select(AssetEmbedding)
    .where(AssetEmbedding.workspace_id == workspace_id)
    .order_by(AssetEmbedding.embedding.cosine_distance(query_vector))
    .limit(10)
)
```

**Deep dive:** Read `.claude/reference/postgresql-best-practices.md`
