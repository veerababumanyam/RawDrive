# @rawdrive/database-utils

Shared PostgreSQL database utilities for RawDrive microservices.

## Features

- **Connection Pooling** - Unified asyncpg pool management with PgBouncer support
- **Workspace Isolation** - Query builders that enforce multi-tenant security
- **LIKE Pattern Escaping** - Prevent SQL injection in search queries
- **Pagination Helpers** - Consistent LIMIT/OFFSET pagination across services
- **Soft Delete Patterns** - Standard soft delete/restore queries
- **Transaction Management** - Context managers with isolation level support
- **Retry Logic** - Automatic retry with exponential backoff for transient failures

## Installation

The package is a Python module in the monorepo. Add it to your service's Python path:

```python
# In your service's pyproject.toml or setup.py
dependencies = [
    # Other dependencies
]

# Add to PYTHONPATH in docker-compose or deployment config
PYTHONPATH=/app/packages/database-utils/python:$PYTHONPATH
```

## Usage

### Connection Pooling

```python
from database_utils import (
    DatabasePool,
    PoolConfig,
    init_pool,
    get_connection,
    close_pool,
)

# Option 1: Using DatabasePool directly
config = PoolConfig(
    database_url="postgresql://user:pass@localhost/db",
    min_size=2,
    max_size=20,
    pgbouncer_enabled=True,
)

pool = DatabasePool(config)
await pool.initialize()

async with pool.acquire() as conn:
    result = await conn.fetch("SELECT * FROM users")

await pool.close()

# Option 2: Using global pool functions
config = PoolConfig.from_env()  # Load from environment variables
await init_pool(config)

async with get_connection() as conn:
    result = await conn.fetch("SELECT * FROM users")

await close_pool()
```

### Workspace Isolation

```python
from database_utils import WorkspaceQueryBuilder, SoftDeleteFilter
from uuid import UUID

workspace_id = UUID("...")

# Build workspace-scoped query
builder = WorkspaceQueryBuilder(workspace_id)
builder.add_condition("status", "=", "active")
builder.add_like_condition("name", "John")  # Properly escaped
builder.set_soft_delete_filter(SoftDeleteFilter.ACTIVE)

where_clause, params = builder.build()
# where_clause: "workspace_id = $1 AND is_deleted = false AND status = $2 AND name ILIKE $3 ESCAPE '\\'"
# params: [workspace_id, "active", "%John%"]

query = f"SELECT * FROM clients WHERE {where_clause}"
results = await conn.fetch(query, *params)
```

### LIKE Pattern Escaping

```python
from database_utils import escape_like_pattern, build_like_clause

# Basic escaping
user_input = "50% off!"
safe_pattern = escape_like_pattern(user_input)
# safe_pattern: "50\\% off!"

# Build complete LIKE clause
clause, value, next_idx = build_like_clause("name", "John", param_index=1)
# clause: "name ILIKE $1 ESCAPE '\\'"
# value: "%John%"
```

### Pagination

```python
from database_utils import PaginationQueryBuilder

pagination = PaginationQueryBuilder(page=2, limit=20)
pagination.set_order("created_at", "DESC")

# Build query suffix
suffix = pagination.build_suffix(param_start=3)
# suffix: "ORDER BY created_at DESC LIMIT $3 OFFSET $4"

# Get parameters
params = pagination.get_params()
# params: [20, 20]  # limit=20, offset=20 (page 2)

# Full query example
query = f"""
    SELECT * FROM assets
    WHERE workspace_id = $1 AND status = $2
    {suffix}
"""
results = await conn.fetch(query, workspace_id, "active", *params)

# Calculate metadata
total = await conn.fetchval("SELECT COUNT(*) FROM assets WHERE ...")
has_next = pagination.has_next_page(total)
total_pages = pagination.calculate_total_pages(total)
```

### Soft Delete

```python
from database_utils import SoftDeleteQueryBuilder
from uuid import UUID

workspace_id = UUID("...")
asset_id = UUID("...")
user_id = UUID("...")

builder = SoftDeleteQueryBuilder("assets")
builder.set_workspace(workspace_id)
builder.set_deleted_by(user_id)
builder.add_id_condition("asset_id", asset_id)

# Soft delete
query, params = builder.build_soft_delete()
await conn.execute(query, *params)

# Restore
query, params = builder.build_restore()
await conn.execute(query, *params)

# Filter clauses for SELECT queries
active_filter = builder.build_filter_active()  # "is_deleted = false"
deleted_filter = builder.build_filter_deleted()  # "is_deleted = true AND deleted_at IS NOT NULL"
```

### Transaction Management

```python
from database_utils import (
    get_transaction,
    readonly_transaction,
    serializable_transaction,
    savepoint,
    IsolationLevel,
)

# Basic transaction
async with get_transaction() as conn:
    await conn.execute("INSERT INTO users ...")
    await conn.execute("INSERT INTO audit_log ...")
    # Commits on success, rolls back on exception

# Read-only transaction
async with readonly_transaction() as conn:
    users = await conn.fetch("SELECT * FROM users")
    # Any write attempt will fail

# Serializable isolation (strongest consistency)
async with serializable_transaction() as conn:
    balance = await conn.fetchval("SELECT balance FROM accounts WHERE id = $1", 1)
    await conn.execute("UPDATE accounts SET balance = $1 WHERE id = $2", balance - 100, 1)

# Savepoints for partial rollback
async with get_transaction() as conn:
    await conn.execute("INSERT INTO orders (id) VALUES ($1)", order_id)
    try:
        async with savepoint(conn):
            await conn.execute("INSERT INTO payments ...")
    except PaymentError:
        # Order preserved, payment rolled back
        await conn.execute("UPDATE orders SET status = 'failed' ...")
```

### Retry Logic

```python
from database_utils import (
    with_retry,
    RetryConfig,
    execute_with_retry,
    fetch_with_retry,
    get_connection,
)

# Using decorator
@with_retry()
async def transfer_funds(from_id: int, to_id: int, amount: Decimal):
    async with serializable_transaction() as conn:
        # Automatically retries on deadlock or serialization failure
        await conn.execute("UPDATE accounts SET balance = balance - $1 WHERE id = $2", amount, from_id)
        await conn.execute("UPDATE accounts SET balance = balance + $1 WHERE id = $2", amount, to_id)

# Custom retry config
config = RetryConfig(
    max_attempts=5,
    base_delay=0.2,
    max_delay=10.0,
)

@with_retry(config)
async def my_critical_operation():
    ...

# Using helper functions
status = await execute_with_retry(
    get_connection,
    "UPDATE users SET last_login = NOW() WHERE id = $1",
    user_id,
)

users = await fetch_with_retry(
    get_connection,
    "SELECT * FROM users WHERE status = $1",
    "active",
)
```

## Environment Variables

The package respects these environment variables when using `PoolConfig.from_env()`:

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection URL | Required |
| `DB_POOL_MIN_SIZE` | Minimum pool connections | 2 |
| `DB_POOL_MAX_SIZE` | Maximum pool connections | 20 |
| `DB_COMMAND_TIMEOUT` | Query timeout (seconds) | 60 |
| `DB_POOL_MAX_LIFETIME_SEC` | Max connection lifetime | 1800 |
| `PGBOUNCER_ENABLED` | Enable PgBouncer routing | false |
| `PGBOUNCER_HOST` | PgBouncer hostname | pgbouncer |
| `PGBOUNCER_PORT` | PgBouncer port | 6432 |
| `SERVICE_NAME` | Application name for connections | None |

## Migration from Service-Specific Database Modules

Replace service-specific database.py imports with the shared package:

### Before

```python
# In gallery-service/src/database.py (duplicated in 6+ services)
from src.database import get_connection, get_pool, close_pool
```

### After

```python
from database_utils import (
    init_pool,
    get_connection,
    close_pool,
    PoolConfig,
)

# In main.py startup
config = PoolConfig.from_env()
await init_pool(config)

# Use get_connection as before
async with get_connection() as conn:
    ...
```

## TypeScript Types

For TypeScript services (if any), the package also exports type definitions:

```typescript
import type {
    PoolConfig,
    PoolStats,
    IsolationLevel,
    RetryConfig,
} from '@rawdrive/database-utils';
```

## Best Practices

1. **Always use WorkspaceQueryBuilder** for queries that access tenant data
2. **Never hardcode workspace_id** - extract from JWT token in middleware
3. **Use escape_like_pattern** for any user-provided search input
4. **Prefer PaginationQueryBuilder** over manual LIMIT/OFFSET
5. **Use transactions** for multi-statement operations
6. **Apply @with_retry** to critical operations that may face contention
7. **Enable PgBouncer** in production for better connection scaling
