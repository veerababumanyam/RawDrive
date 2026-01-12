---
description: Create a new Alembic database migration for RawDrive
---

# Create Database Migration

Create a new Alembic migration for schema changes in RawDrive.

## References

- **PRD**: [`.claude/PRD.md`](../PRD.md) - Product requirements and architecture overview
- **Best Practices**:
  - [PostgreSQL Best Practices](../reference/postgresql-best-practices.md)
  - [Microservices Patterns](../reference/microservices-patterns.md)
  - [Coding Standards](../reference/coding-standards.md)

## Usage

```
/migration.create <description>
```

Example:
```
/migration.create "add user preferences table"
```

## Steps

### 1. Ensure Backend Container is Running

```bash
docker compose -f infrastructure/docker/docker-compose.yml ps backend
```

### 2. Create Migration

```bash
# Auto-generate migration from model changes
docker exec rawdrive-backend bash -c "cd /app && alembic revision --autogenerate -m '<description>'"

# Or create empty migration for manual changes
docker exec rawdrive-backend bash -c "cd /app && alembic revision -m '<description>'"
```

### 3. Review Generated Migration

The migration file will be created in `backend/migrations/versions/`.

Check the file and verify:
- ✅ Correct table names (snake_case)
- ✅ workspace_id column for multi-tenant tables
- ✅ Proper indexes (especially on workspace_id, foreign keys)
- ✅ UUID primary keys where appropriate
- ✅ Timestamps (created_at, updated_at)
- ✅ Proper foreign key constraints with ON DELETE behavior

### 4. Edit Migration (if needed)

Common patterns to add:

#### Multi-Tenant Table

```python
def upgrade() -> None:
    op.create_table(
        'table_name',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
    )
    
    # Critical: Index on workspace_id for multi-tenant queries
    op.create_index('ix_table_name_workspace_id', 'table_name', ['workspace_id'])
```

#### Add Column

```python
def upgrade() -> None:
    op.add_column('table_name', sa.Column('new_column', sa.String(length=100), nullable=True))
    
def downgrade() -> None:
    op.drop_column('table_name', 'new_column')
```

#### Add Index

```python
def upgrade() -> None:
    op.create_index('ix_table_column', 'table_name', ['column_name'])
    
def downgrade() -> None:
    op.drop_index('ix_table_column', table_name='table_name')
```

#### Vector Column (pgvector)

```python
from sqlalchemy.dialects.postgresql import ARRAY

def upgrade() -> None:
    # Ensure pgvector extension exists
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    
    op.add_column('table_name', 
        sa.Column('embedding', postgresql.ARRAY(sa.Float, dimensions=1536), nullable=True)
    )
    
    # HNSW index for vector similarity search
    op.execute("""
        CREATE INDEX ix_table_name_embedding_hnsw 
        ON table_name 
        USING hnsw (embedding vector_cosine_ops)
    """)
```

### 5. Test Migration

```bash
# Run migration
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"

# Verify migration applied
docker exec rawdrive-backend bash -c "cd /app && alembic current"

# Check database schema
docker exec -it rawdrive-postgres psql -U rawdrive -d rawdrive -c "\d table_name"
```

### 6. Test Rollback

```bash
# Rollback one migration
docker exec rawdrive-backend bash -c "cd /app && alembic downgrade -1"

# Re-apply
docker exec rawdrive-backend bash -c "cd /app && alembic upgrade head"
```

### 7. Update Models

Ensure SQLAlchemy models in `backend/src/app/models/` match the migration:

```python
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from .base import Base

class TableName(Base):
    __tablename__ = 'table_name'
    
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    workspace_id = Column(UUID(as_uuid=True), ForeignKey('workspaces.id', ondelete='CASCADE'), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
```

## Common Migration Patterns

### Add Enum Type

```python
from sqlalchemy.dialects.postgresql import ENUM

def upgrade() -> None:
    status_enum = ENUM('active', 'inactive', 'pending', name='status_type', create_type=True)
    status_enum.create(op.get_bind())
    
    op.add_column('table_name', sa.Column('status', status_enum, nullable=False, server_default='pending'))

def downgrade() -> None:
    op.drop_column('table_name', 'status')
    op.execute('DROP TYPE status_type')
```

### Add Trigger

```python
def upgrade() -> None:
    # Auto-update updated_at timestamp
    op.execute("""
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
    """)
    
    op.execute("""
        CREATE TRIGGER update_table_name_updated_at 
        BEFORE UPDATE ON table_name
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    """)
```

### Data Migration

```python
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    # Add column
    op.add_column('users', sa.Column('full_name', sa.String(200), nullable=True))
    
    # Migrate data
    connection = op.get_bind()
    connection.execute(
        sa.text("UPDATE users SET full_name = first_name || ' ' || last_name WHERE full_name IS NULL")
    )
    
    # Make column non-nullable
    op.alter_column('users', 'full_name', nullable=False)
```

## Verification Checklist

- [ ] Migration runs without errors
- [ ] Migration can be rolled back
- [ ] Indexes created on workspace_id for multi-tenant tables
- [ ] Foreign keys have proper ON DELETE behavior
- [ ] SQLAlchemy models updated
- [ ] No breaking changes to existing data
- [ ] Migration tested with production-like data volume

## Troubleshooting

### "relation already exists"
- Check if migration was partially applied
- Use `alembic current` to check state
- May need to manually fix database or migration

### "column does not exist"
- Ensure models are imported in `backend/src/app/models/__init__.py`
- Check model inheritance from Base

### Autogenerate misses changes
- Ensure models are imported
- Check that Base.metadata includes all tables
- May need to manually add changes

## Notes

- Always test migrations on a copy of production data
- Keep migrations small and focused
- Use descriptive migration messages
- Never edit applied migrations - create new ones
- Document complex migrations in comments
