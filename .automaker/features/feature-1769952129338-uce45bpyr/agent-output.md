
🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "in_progress",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "pending",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package",
      "status": "pending",
      "activeForm": "Creating @rawdrive/database-utils package"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "pending",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "pending",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "pending",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "pending",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "pending",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "pending",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

🔧 Tool: Task
Input: {
  "description": "Find SQL patterns in services",
  "prompt": "Search the codebase for repeated SQL patterns that need to be extracted into a shared package. Look for:\n1. `_escape_like_pattern` or similar LIKE pattern escaping functions\n2. Asyncpg connection pooling setup patterns\n3. Transaction context managers\n4. Pagination query builders\n5. Soft delete query patterns\n6. Workspace isolation WHERE clause patterns\n\nFocus on the services/ directory and backend/ directory. Provide file paths and code snippets showing the duplication.",
  "subagent_type": "Explore"
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\services\" \"C:\\Users\\admin\\Desktop\\RawDrive2\\backend\" -type f -name \"*.py\" | head -20"
}

🔧 Tool: Grep
Input: {
  "pattern": "escape_like_pattern|LIKE.*escape|LIKE.*%|_ESCAPE",
  "type": "py"
}

🔧 Tool: Grep
Input: {
  "pattern": "create_async_engine|AsyncSession|async_sessionmaker|pool\\.|NullPool|QueuePool",
  "type": "py"
}

🔧 Tool: Grep
Input: {
  "pattern": "limit.*offset|offset.*limit|\\.limit\\(|\\.offset\\(|LIMIT|OFFSET",
  "type": "py",
  "head_limit": 30
}

🔧 Tool: Grep
Input: {
  "pattern": "is_deleted|soft_delete|deleted_at|where.*deleted_at|where.*is_deleted",
  "type": "py",
  "head_limit": 25
}

🔧 Tool: Grep
Input: {
  "pattern": "\\.where\\(.*workspace_id|workspace_id.*==|workspace_id in|filter.*workspace",
  "type": "py",
  "head_limit": 25
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\db\\postgres.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\gallery-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\invitations-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\client-service\\src\\repositories\\smart_list_repository.py",
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\repositories\\portfolio_recommendation_repository.py",
  "limit": 200
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\client_tag_service.py",
  "limit": 200
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\duplicate_detection_service.py",
  "limit": 200
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\pagination.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\recycle_bin_service.py",
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\client-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\billing-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\deletion_service.py",
  "limit": 180
}

🔧 Tool: Bash
Input: {
  "command": "find \"C:\\Users\\admin\\Desktop\\RawDrive2\\services\" -name \"database.py\" -o -name \"*database*\" | grep -E \"\\.(py)$\" | sort"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "in_progress",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package",
      "status": "pending",
      "activeForm": "Creating @rawdrive/database-utils package"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "pending",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "pending",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "pending",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "pending",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "pending",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "pending",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

Let me examine the existing patterns in detail to understand the implementations:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\db\\postgres.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\gallery-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\pagination.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\invitations-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\client-service\\src\\database.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\billing-service\\src\\database.py"
}

Now let me examine packages structure and existing shared packages:

🔧 Tool: Glob
Input: {
  "pattern": "packages/**/package.json"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\client_tag_service.py",
  "limit": 100
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\package.json"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/shared-api/**/*"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\pnpm-workspace.yaml"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\shared-api\\python\\__init__.py"
}

Now I have a clear picture of the structure. Since this is a Python database utilities package (for Python microservices), I should follow the pattern of `@rawdrive/shared-api` which has both TypeScript and Python versions. Let me update the plan and start creating the package:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "in_progress",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "pending",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "pending",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "pending",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "pending",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "pending",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "pending",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\package.json",
  "content": "{\n  \"name\": \"@rawdrive/database-utils\",\n  \"version\": \"1.0.0\",\n  \"description\": \"Shared PostgreSQL database utilities for RawDrive microservices - connection pooling, query builders, workspace isolation\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"main\": \"dist/index.js\",\n  \"types\": \"dist/index.d.ts\",\n  \"files\": [\n    \"dist\",\n    \"src\",\n    \"python\"\n  ],\n  \"exports\": {\n    \".\": {\n      \"types\": \"./dist/index.d.ts\",\n      \"default\": \"./dist/index.js\"\n    },\n    \"./*\": {\n      \"types\": \"./dist/*.d.ts\",\n      \"default\": \"./dist/*.js\"\n    }\n  },\n  \"scripts\": {\n    \"build\": \"tsc -p tsconfig.json\",\n    \"test\": \"vitest\",\n    \"lint\": \"eslint src --ext .ts\"\n  },\n  \"dependencies\": {},\n  \"devDependencies\": {\n    \"typescript\": \"^5.3.0\",\n    \"vitest\": \"^1.0.0\"\n  },\n  \"peerDependencies\": {}\n}\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\tsconfig.json",
  "content": "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"lib\": [\"ES2022\"],\n    \"outDir\": \"dist\",\n    \"rootDir\": \"src\",\n    \"declaration\": true,\n    \"declarationMap\": true,\n    \"sourceMap\": true,\n    \"strict\": true,\n    \"skipLibCheck\": true,\n    \"esModuleInterop\": true,\n    \"forceConsistentCasingInFileNames\": true,\n    \"resolveJsonModule\": true\n  },\n  \"include\": [\"src/**/*\"],\n  \"exclude\": [\"node_modules\", \"dist\"]\n}\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\src\\index.ts",
  "content": "/**\n * @rawdrive/database-utils\n *\n * Shared PostgreSQL database utilities for RawDrive microservices.\n * Provides consistent patterns for:\n * - Connection pooling with PgBouncer support\n * - Workspace isolation query builders\n * - Pagination helpers\n * - LIKE pattern escaping\n * - Soft delete query patterns\n * - Transaction management\n *\n * Note: This package primarily exports TypeScript types and constants.\n * The actual database operations are implemented in the Python module\n * for use in Python-based microservices.\n */\n\n// Export types for TypeScript services\nexport * from './types';\nexport * from './constants';\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\src\\types.ts",
  "content": "/**\n * Type definitions for database utilities.\n */\n\n/**\n * PostgreSQL transaction isolation levels.\n */\nexport type IsolationLevel = 'read_committed' | 'repeatable_read' | 'serializable';\n\n/**\n * Connection pool statistics.\n */\nexport interface PoolStats {\n  /** Total connections in the pool */\n  size: number;\n  /** Available connections */\n  free_size: number;\n  /** Connections currently in use */\n  used_size: number;\n  /** Minimum pool size */\n  min_size: number;\n  /** Maximum pool size */\n  max_size: number;\n  /** Pool utilization percentage */\n  utilization_percent: number;\n}\n\n/**\n * Configuration for database connection pooling.\n */\nexport interface PoolConfig {\n  /** Database connection URL */\n  database_url: string;\n  /** Minimum number of connections */\n  min_size?: number;\n  /** Maximum number of connections */\n  max_size?: number;\n  /** Command timeout in seconds */\n  command_timeout?: number;\n  /** Maximum connection lifetime in seconds */\n  max_inactive_connection_lifetime?: number;\n  /** Enable PgBouncer routing */\n  pgbouncer_enabled?: boolean;\n  /** PgBouncer host */\n  pgbouncer_host?: string;\n  /** PgBouncer port */\n  pgbouncer_port?: number;\n  /** Disable statement caching (required for PgBouncer transaction mode) */\n  statement_cache_size?: number;\n}\n\n/**\n * Configuration for retry logic.\n */\nexport interface RetryConfig {\n  /** Maximum number of retry attempts */\n  max_attempts: number;\n  /** Initial delay between retries in seconds */\n  base_delay: number;\n  /** Maximum delay between retries in seconds */\n  max_delay: number;\n  /** Base for exponential backoff calculation */\n  exponential_base: number;\n}\n\n/**\n * Soft delete filter options.\n */\nexport type SoftDeleteFilter = 'active' | 'deleted' | 'all';\n\n/**\n * Workspace-scoped query parameters.\n */\nexport interface WorkspaceQueryParams {\n  /** Workspace ID for multi-tenant isolation */\n  workspace_id: string;\n  /** Soft delete filter */\n  soft_delete_filter?: SoftDeleteFilter;\n  /** Additional WHERE conditions */\n  additional_conditions?: string[];\n}\n\n/**\n * Pagination query parameters.\n */\nexport interface PaginationQueryParams {\n  /** Page number (1-based) */\n  page: number;\n  /** Items per page */\n  limit: number;\n  /** Order by column */\n  order_by?: string;\n  /** Sort direction */\n  order_direction?: 'ASC' | 'DESC';\n}\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\src\\constants.ts",
  "content": "/**\n * Database constants shared across services.\n */\n\n/**\n * Default connection pool settings.\n */\nexport const POOL_DEFAULTS = {\n  /** Minimum connections in pool */\n  MIN_SIZE: 2,\n  /** Maximum connections in pool */\n  MAX_SIZE: 20,\n  /** Command timeout in seconds */\n  COMMAND_TIMEOUT: 60,\n  /** Maximum connection lifetime in seconds */\n  MAX_INACTIVE_CONNECTION_LIFETIME: 1800,\n  /** PgBouncer default port */\n  PGBOUNCER_PORT: 6432,\n  /** PgBouncer default host */\n  PGBOUNCER_HOST: 'pgbouncer',\n} as const;\n\n/**\n * Default retry configuration.\n */\nexport const RETRY_DEFAULTS = {\n  /** Maximum retry attempts */\n  MAX_ATTEMPTS: 3,\n  /** Initial delay in seconds */\n  BASE_DELAY: 0.1,\n  /** Maximum delay in seconds */\n  MAX_DELAY: 5.0,\n  /** Exponential backoff base */\n  EXPONENTIAL_BASE: 2.0,\n} as const;\n\n/**\n * Transaction isolation levels.\n */\nexport const ISOLATION_LEVELS = {\n  READ_COMMITTED: 'read_committed',\n  REPEATABLE_READ: 'repeatable_read',\n  SERIALIZABLE: 'serializable',\n} as const;\n\n/**\n * Soft delete filter options.\n */\nexport const SOFT_DELETE_FILTERS = {\n  /** Only active (non-deleted) records */\n  ACTIVE: 'active',\n  /** Only deleted records */\n  DELETED: 'deleted',\n  /** All records regardless of deletion status */\n  ALL: 'all',\n} as const;\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "in_progress",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "pending",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "pending",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "pending",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "pending",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "pending",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

Now let me create the Python module with all the database utilities:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\__init__.py",
  "content": "\"\"\"\n@rawdrive/database-utils - Python Database Utilities\n\nShared PostgreSQL database utilities for RawDrive microservices.\nProvides consistent patterns for:\n- Connection pooling with PgBouncer support\n- Workspace isolation query builders\n- Pagination helpers\n- LIKE pattern escaping\n- Soft delete query patterns\n- Transaction management\n\nUsage:\n    from database_utils import (\n        # Connection pooling\n        DatabasePool,\n        PoolConfig,\n        PoolStats,\n\n        # Query builders\n        WorkspaceQueryBuilder,\n        PaginationQueryBuilder,\n        SoftDeleteQueryBuilder,\n\n        # Utilities\n        escape_like_pattern,\n        build_pgbouncer_dsn,\n\n        # Context managers\n        get_transaction,\n        get_connection,\n\n        # Constants\n        IsolationLevel,\n        POOL_DEFAULTS,\n        RETRY_DEFAULTS,\n    )\n\"\"\"\n\nfrom .pool import (\n    DatabasePool,\n    PoolConfig,\n    PoolStats,\n    IsolationLevel,\n    get_connection,\n    get_transaction,\n    readonly_transaction,\n    serializable_transaction,\n    savepoint,\n)\nfrom .query_builders import (\n    WorkspaceQueryBuilder,\n    PaginationQueryBuilder,\n    SoftDeleteQueryBuilder,\n    escape_like_pattern,\n)\nfrom .dsn import (\n    build_pgbouncer_dsn,\n    normalize_database_url,\n)\nfrom .retry import (\n    RetryConfig,\n    with_retry,\n    execute_with_retry,\n    fetch_with_retry,\n    fetchval_with_retry,\n    RETRY_DEFAULTS,\n)\nfrom .constants import (\n    POOL_DEFAULTS,\n    SOFT_DELETE_FILTER,\n)\n\n__all__ = [\n    # Connection pooling\n    \"DatabasePool\",\n    \"PoolConfig\",\n    \"PoolStats\",\n    \"IsolationLevel\",\n    \"get_connection\",\n    \"get_transaction\",\n    \"readonly_transaction\",\n    \"serializable_transaction\",\n    \"savepoint\",\n    # Query builders\n    \"WorkspaceQueryBuilder\",\n    \"PaginationQueryBuilder\",\n    \"SoftDeleteQueryBuilder\",\n    \"escape_like_pattern\",\n    # DSN utilities\n    \"build_pgbouncer_dsn\",\n    \"normalize_database_url\",\n    # Retry logic\n    \"RetryConfig\",\n    \"with_retry\",\n    \"execute_with_retry\",\n    \"fetch_with_retry\",\n    \"fetchval_with_retry\",\n    \"RETRY_DEFAULTS\",\n    # Constants\n    \"POOL_DEFAULTS\",\n    \"SOFT_DELETE_FILTER\",\n]\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\constants.py",
  "content": "\"\"\"\nDatabase constants shared across all RawDrive microservices.\n\"\"\"\n\nfrom dataclasses import dataclass\nfrom enum import Enum\nfrom typing import Final\n\n\nclass IsolationLevel(str, Enum):\n    \"\"\"PostgreSQL transaction isolation levels.\"\"\"\n\n    READ_COMMITTED = \"read_committed\"\n    REPEATABLE_READ = \"repeatable_read\"\n    SERIALIZABLE = \"serializable\"\n\n\nclass SoftDeleteFilter(str, Enum):\n    \"\"\"Soft delete filter options for queries.\"\"\"\n\n    ACTIVE = \"active\"  # Only non-deleted records (is_deleted = false)\n    DELETED = \"deleted\"  # Only deleted records (is_deleted = true)\n    ALL = \"all\"  # All records regardless of deletion status\n\n\n@dataclass(frozen=True)\nclass PoolDefaults:\n    \"\"\"Default connection pool settings.\"\"\"\n\n    MIN_SIZE: int = 2\n    MAX_SIZE: int = 20\n    COMMAND_TIMEOUT: int = 60\n    MAX_INACTIVE_CONNECTION_LIFETIME: int = 1800\n    PGBOUNCER_PORT: int = 6432\n    PGBOUNCER_HOST: str = \"pgbouncer\"\n\n\n@dataclass(frozen=True)\nclass RetryDefaults:\n    \"\"\"Default retry configuration.\"\"\"\n\n    MAX_ATTEMPTS: int = 3\n    BASE_DELAY: float = 0.1\n    MAX_DELAY: float = 5.0\n    EXPONENTIAL_BASE: float = 2.0\n\n\n# Singleton instances\nPOOL_DEFAULTS: Final[PoolDefaults] = PoolDefaults()\nRETRY_DEFAULTS: Final[RetryDefaults] = RetryDefaults()\nSOFT_DELETE_FILTER: Final[type[SoftDeleteFilter]] = SoftDeleteFilter\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\dsn.py",
  "content": "\"\"\"\nDatabase DSN (connection string) utilities.\n\nProvides functions to normalize and transform database URLs,\nespecially for PgBouncer routing.\n\"\"\"\n\nimport logging\nfrom typing import Optional\nfrom urllib.parse import urlparse, urlunparse\n\nfrom .constants import POOL_DEFAULTS\n\nlogger = logging.getLogger(__name__)\n\n\ndef normalize_database_url(database_url: str) -> str:\n    \"\"\"\n    Normalize a database URL to standard PostgreSQL format.\n\n    Converts SQLAlchemy-style DSNs (postgresql+asyncpg://) to\n    standard PostgreSQL format (postgresql://).\n\n    Args:\n        database_url: The database URL to normalize\n\n    Returns:\n        Normalized database URL in standard PostgreSQL format\n\n    Example:\n        >>> normalize_database_url(\"postgresql+asyncpg://user:pass@localhost/db\")\n        'postgresql://user:pass@localhost/db'\n    \"\"\"\n    url = database_url\n\n    # Normalize SQLAlchemy DSN to standard PostgreSQL format\n    if url.startswith(\"postgresql+asyncpg://\"):\n        url = url.replace(\"postgresql+asyncpg://\", \"postgresql://\", 1)\n\n    return url\n\n\ndef build_pgbouncer_dsn(\n    database_url: str,\n    pgbouncer_host: Optional[str] = None,\n    pgbouncer_port: Optional[int] = None,\n    enabled: bool = True,\n) -> str:\n    \"\"\"\n    Build a PgBouncer-routed database connection DSN.\n\n    When PgBouncer is enabled, this function transforms the database URL\n    to route connections through PgBouncer instead of directly to PostgreSQL.\n\n    PgBouncer handles connection pooling at the server level, allowing\n    hundreds of application pods to share a smaller pool of actual\n    PostgreSQL connections (critical for scaling to 5000+ concurrent users).\n\n    Args:\n        database_url: Original database connection URL\n        pgbouncer_host: PgBouncer hostname (default: 'pgbouncer')\n        pgbouncer_port: PgBouncer port (default: 6432)\n        enabled: Whether PgBouncer routing is enabled\n\n    Returns:\n        Database URL (potentially transformed for PgBouncer routing)\n\n    Example:\n        >>> build_pgbouncer_dsn(\n        ...     \"postgresql://user:pass@postgres:5432/rawdrive\",\n        ...     pgbouncer_host=\"pgbouncer\",\n        ...     pgbouncer_port=6432,\n        ...     enabled=True\n        ... )\n        'postgresql://user:pass@pgbouncer:6432/rawdrive'\n    \"\"\"\n    # Normalize the URL first\n    dsn = normalize_database_url(database_url)\n\n    # If PgBouncer is disabled, return normalized URL\n    if not enabled:\n        return dsn\n\n    # Set defaults\n    host = pgbouncer_host or POOL_DEFAULTS.PGBOUNCER_HOST\n    port = pgbouncer_port or POOL_DEFAULTS.PGBOUNCER_PORT\n\n    try:\n        parsed = urlparse(dsn)\n\n        # Build new netloc with PgBouncer host/port\n        # Keep original username, password, database, and query params\n        if parsed.username and parsed.password:\n            netloc = f\"{parsed.username}:{parsed.password}@{host}:{port}\"\n        elif parsed.username:\n            netloc = f\"{parsed.username}@{host}:{port}\"\n        else:\n            netloc = f\"{host}:{port}\"\n\n        pgbouncer_dsn = urlunparse((\n            parsed.scheme,\n            netloc,\n            parsed.path,\n            parsed.params,\n            parsed.query,\n            parsed.fragment,\n        ))\n\n        logger.info(\n            \"PgBouncer enabled - routing connections through connection pooler\",\n            extra={\n                \"pgbouncer_host\": host,\n                \"pgbouncer_port\": port,\n            },\n        )\n        return pgbouncer_dsn\n\n    except Exception as e:\n        logger.warning(\n            \"Failed to construct PgBouncer DSN, falling back to direct connection\",\n            extra={\"error\": str(e)},\n        )\n        return dsn\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\query_builders.py",
  "content": "\"\"\"\nSQL Query Builder utilities for RawDrive microservices.\n\nProvides consistent patterns for:\n- LIKE pattern escaping (prevent SQL injection)\n- Workspace isolation (multi-tenant security)\n- Soft delete filtering\n- Pagination queries\n\"\"\"\n\nimport logging\nfrom dataclasses import dataclass, field\nfrom enum import Enum\nfrom typing import Any, List, Optional, Tuple\nfrom uuid import UUID\n\nfrom .constants import SoftDeleteFilter\n\nlogger = logging.getLogger(__name__)\n\n\n# =============================================================================\n# LIKE Pattern Escaping\n# =============================================================================\n\n\ndef escape_like_pattern(pattern: str) -> str:\n    \"\"\"\n    Escape LIKE metacharacters to prevent pattern injection.\n\n    Escapes %, _, and \\\\ characters that have special meaning in SQL LIKE patterns.\n    This prevents malicious users from using wildcards to match unintended data.\n\n    Args:\n        pattern: User-provided search pattern\n\n    Returns:\n        Escaped pattern safe for use in LIKE clauses\n\n    Example:\n        >>> escape_like_pattern(\"50% off!\")\n        '50\\\\\\\\% off!'\n\n        >>> escape_like_pattern(\"user_name\")\n        'user\\\\\\\\_name'\n\n    Usage in SQL:\n        escaped = escape_like_pattern(user_input)\n        query = f\"SELECT * FROM users WHERE name LIKE '%{escaped}%' ESCAPE '\\\\\\\\'\"\n    \"\"\"\n    return (\n        pattern\n        .replace(\"\\\\\", \"\\\\\\\\\")  # Escape backslash first\n        .replace(\"%\", \"\\\\%\")   # Escape percent\n        .replace(\"_\", \"\\\\_\")   # Escape underscore\n    )\n\n\ndef build_like_clause(\n    column: str,\n    pattern: str,\n    param_index: int = 1,\n    case_insensitive: bool = True,\n) -> Tuple[str, str, int]:\n    \"\"\"\n    Build a LIKE clause with proper escaping.\n\n    Args:\n        column: Column name to search\n        pattern: User-provided search pattern\n        param_index: Current parameter index for placeholder\n        case_insensitive: Use ILIKE instead of LIKE (PostgreSQL)\n\n    Returns:\n        Tuple of (clause_string, escaped_pattern, next_param_index)\n\n    Example:\n        >>> clause, value, idx = build_like_clause(\"name\", \"John\", 1)\n        >>> clause\n        \"name ILIKE $1 ESCAPE '\\\\\\\\'\"\n        >>> value\n        '%John%'\n    \"\"\"\n    escaped = escape_like_pattern(pattern)\n    operator = \"ILIKE\" if case_insensitive else \"LIKE\"\n    clause = f\"{column} {operator} ${param_index} ESCAPE '\\\\'\"\n    value = f\"%{escaped}%\"\n    return clause, value, param_index + 1\n\n\n# =============================================================================\n# Workspace Isolation Query Builder\n# =============================================================================\n\n\n@dataclass\nclass WorkspaceQueryBuilder:\n    \"\"\"\n    Build workspace-isolated SQL queries for multi-tenant security.\n\n    All queries in RawDrive MUST include workspace_id filtering\n    to ensure proper data isolation between tenants.\n\n    Example:\n        builder = WorkspaceQueryBuilder(workspace_id)\n        builder.add_condition(\"status\", \"=\", \"active\")\n        builder.add_condition(\"created_at\", \">\", start_date)\n\n        where_clause, params = builder.build()\n        query = f\"SELECT * FROM assets WHERE {where_clause}\"\n        results = await conn.fetch(query, *params)\n    \"\"\"\n\n    workspace_id: UUID\n    conditions: List[Tuple[str, str, Any]] = field(default_factory=list)\n    soft_delete_filter: SoftDeleteFilter = SoftDeleteFilter.ACTIVE\n    _param_index: int = field(default=1, init=False)\n\n    def add_condition(\n        self,\n        column: str,\n        operator: str,\n        value: Any,\n    ) -> \"WorkspaceQueryBuilder\":\n        \"\"\"\n        Add a WHERE condition to the query.\n\n        Args:\n            column: Column name\n            operator: SQL operator (=, >, <, >=, <=, !=, LIKE, IN, etc.)\n            value: Parameter value\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        self.conditions.append((column, operator, value))\n        return self\n\n    def add_like_condition(\n        self,\n        column: str,\n        pattern: str,\n        case_insensitive: bool = True,\n    ) -> \"WorkspaceQueryBuilder\":\n        \"\"\"\n        Add a LIKE condition with proper escaping.\n\n        Args:\n            column: Column name\n            pattern: Search pattern (will be escaped and wrapped with %)\n            case_insensitive: Use ILIKE instead of LIKE\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        escaped = escape_like_pattern(pattern)\n        operator = \"ILIKE\" if case_insensitive else \"LIKE\"\n        # Store with special marker for LIKE handling\n        self.conditions.append((column, f\"{operator}_ESCAPED\", f\"%{escaped}%\"))\n        return self\n\n    def add_in_condition(\n        self,\n        column: str,\n        values: List[Any],\n    ) -> \"WorkspaceQueryBuilder\":\n        \"\"\"\n        Add an IN condition.\n\n        Args:\n            column: Column name\n            values: List of values for IN clause\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        if values:\n            self.conditions.append((column, \"= ANY\", values))\n        return self\n\n    def add_not_in_condition(\n        self,\n        column: str,\n        values: List[Any],\n    ) -> \"WorkspaceQueryBuilder\":\n        \"\"\"\n        Add a NOT IN condition.\n\n        Args:\n            column: Column name\n            values: List of values to exclude\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        if values:\n            self.conditions.append((column, \"!= ALL\", values))\n        return self\n\n    def set_soft_delete_filter(\n        self,\n        filter_type: SoftDeleteFilter,\n    ) -> \"WorkspaceQueryBuilder\":\n        \"\"\"\n        Set the soft delete filter mode.\n\n        Args:\n            filter_type: One of ACTIVE, DELETED, or ALL\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        self.soft_delete_filter = filter_type\n        return self\n\n    def build(self) -> Tuple[str, List[Any]]:\n        \"\"\"\n        Build the WHERE clause and parameters.\n\n        Returns:\n            Tuple of (where_clause, params_list)\n        \"\"\"\n        clauses: List[str] = []\n        params: List[Any] = []\n        param_idx = 1\n\n        # ALWAYS include workspace_id first (critical for multi-tenant isolation)\n        clauses.append(f\"workspace_id = ${param_idx}\")\n        params.append(self.workspace_id)\n        param_idx += 1\n\n        # Add soft delete filter if not ALL\n        if self.soft_delete_filter == SoftDeleteFilter.ACTIVE:\n            clauses.append(\"is_deleted = false\")\n        elif self.soft_delete_filter == SoftDeleteFilter.DELETED:\n            clauses.append(\"is_deleted = true\")\n            clauses.append(\"deleted_at IS NOT NULL\")\n        # SoftDeleteFilter.ALL: no filter added\n\n        # Add user conditions\n        for column, operator, value in self.conditions:\n            if operator.endswith(\"_ESCAPED\"):\n                # Handle LIKE with escape clause\n                actual_op = operator.replace(\"_ESCAPED\", \"\")\n                clauses.append(f\"{column} {actual_op} ${param_idx} ESCAPE '\\\\'\")\n                params.append(value)\n                param_idx += 1\n            elif operator in (\"= ANY\", \"!= ALL\"):\n                # Handle array conditions\n                clauses.append(f\"{column} {operator}(${param_idx})\")\n                params.append(value)\n                param_idx += 1\n            else:\n                clauses.append(f\"{column} {operator} ${param_idx}\")\n                params.append(value)\n                param_idx += 1\n\n        where_clause = \" AND \".join(clauses)\n        return where_clause, params\n\n\n# =============================================================================\n# Pagination Query Builder\n# =============================================================================\n\n\n@dataclass\nclass PaginationQueryBuilder:\n    \"\"\"\n    Build pagination clauses for SQL queries.\n\n    Provides consistent pagination across all services with\n    proper LIMIT/OFFSET handling and count queries.\n\n    Example:\n        pagination = PaginationQueryBuilder(page=2, limit=20)\n        pagination.set_order(\"created_at\", \"DESC\")\n\n        # For main query\n        query = f\"SELECT * FROM assets WHERE ... {pagination.build_suffix()}\"\n        results = await conn.fetch(query, *other_params, *pagination.get_params())\n\n        # For count query\n        count_query = \"SELECT COUNT(*) FROM assets WHERE ...\"\n        total = await conn.fetchval(count_query, *other_params)\n    \"\"\"\n\n    page: int = 1\n    limit: int = 20\n    order_by: Optional[str] = None\n    order_direction: str = \"DESC\"\n    max_limit: int = 100\n\n    def __post_init__(self) -> None:\n        \"\"\"Validate and normalize pagination parameters.\"\"\"\n        self.page = max(1, self.page)\n        self.limit = min(max(1, self.limit), self.max_limit)\n        self.order_direction = self.order_direction.upper()\n        if self.order_direction not in (\"ASC\", \"DESC\"):\n            self.order_direction = \"DESC\"\n\n    @property\n    def offset(self) -> int:\n        \"\"\"Calculate the offset for the query.\"\"\"\n        return (self.page - 1) * self.limit\n\n    def set_order(\n        self,\n        column: str,\n        direction: str = \"DESC\",\n    ) -> \"PaginationQueryBuilder\":\n        \"\"\"\n        Set the order clause.\n\n        Args:\n            column: Column to order by\n            direction: ASC or DESC\n\n        Returns:\n            Self for method chaining\n        \"\"\"\n        self.order_by = column\n        self.order_direction = direction.upper()\n        return self\n\n    def build_order_clause(self) -> str:\n        \"\"\"Build the ORDER BY clause.\"\"\"\n        if self.order_by:\n            return f\"ORDER BY {self.order_by} {self.order_direction}\"\n        return \"\"\n\n    def build_limit_offset(self, param_start: int = 1) -> Tuple[str, List[int], int]:\n        \"\"\"\n        Build LIMIT/OFFSET clause with parameterized values.\n\n        Args:\n            param_start: Starting parameter index\n\n        Returns:\n            Tuple of (clause, [limit, offset], next_param_index)\n        \"\"\"\n        clause = f\"LIMIT ${param_start} OFFSET ${param_start + 1}\"\n        return clause, [self.limit, self.offset], param_start + 2\n\n    def build_suffix(self, param_start: int = 1) -> str:\n        \"\"\"\n        Build the complete query suffix (ORDER BY, LIMIT, OFFSET).\n\n        Args:\n            param_start: Starting parameter index for LIMIT/OFFSET\n\n        Returns:\n            Complete suffix string\n        \"\"\"\n        parts = []\n\n        if self.order_by:\n            parts.append(f\"ORDER BY {self.order_by} {self.order_direction}\")\n\n        parts.append(f\"LIMIT ${param_start} OFFSET ${param_start + 1}\")\n\n        return \" \".join(parts)\n\n    def get_params(self) -> List[int]:\n        \"\"\"Get the pagination parameters (limit, offset).\"\"\"\n        return [self.limit, self.offset]\n\n    def calculate_total_pages(self, total_count: int) -> int:\n        \"\"\"\n        Calculate total pages from total count.\n\n        Args:\n            total_count: Total number of items\n\n        Returns:\n            Total number of pages\n        \"\"\"\n        if self.limit <= 0:\n            return 0\n        return (total_count + self.limit - 1) // self.limit\n\n    def has_next_page(self, total_count: int) -> bool:\n        \"\"\"Check if there is a next page.\"\"\"\n        return self.page < self.calculate_total_pages(total_count)\n\n    def has_prev_page(self) -> bool:\n        \"\"\"Check if there is a previous page.\"\"\"\n        return self.page > 1\n\n\n# =============================================================================\n# Soft Delete Query Builder\n# =============================================================================\n\n\n@dataclass\nclass SoftDeleteQueryBuilder:\n    \"\"\"\n    Build soft delete queries with consistent patterns.\n\n    RawDrive uses soft delete for most entities, setting:\n    - is_deleted = true\n    - deleted_at = NOW()\n    - optionally deleted_by = user_id\n\n    Example:\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n        builder.add_id_condition(\"asset_id\", asset_id)\n\n        # Soft delete\n        query = builder.build_soft_delete()\n        await conn.execute(query, *builder.get_params())\n\n        # Restore\n        query = builder.build_restore()\n        await conn.execute(query, *builder.get_params())\n    \"\"\"\n\n    table_name: str\n    workspace_id: Optional[UUID] = None\n    conditions: List[Tuple[str, Any]] = field(default_factory=list)\n    deleted_by: Optional[UUID] = None\n\n    def set_workspace(self, workspace_id: UUID) -> \"SoftDeleteQueryBuilder\":\n        \"\"\"Set the workspace ID for isolation.\"\"\"\n        self.workspace_id = workspace_id\n        return self\n\n    def set_deleted_by(self, user_id: UUID) -> \"SoftDeleteQueryBuilder\":\n        \"\"\"Set the user performing the deletion.\"\"\"\n        self.deleted_by = user_id\n        return self\n\n    def add_id_condition(\n        self,\n        column: str,\n        value: Any,\n    ) -> \"SoftDeleteQueryBuilder\":\n        \"\"\"Add an ID condition (e.g., asset_id = $1).\"\"\"\n        self.conditions.append((column, value))\n        return self\n\n    def add_ids_condition(\n        self,\n        column: str,\n        values: List[Any],\n    ) -> \"SoftDeleteQueryBuilder\":\n        \"\"\"Add a bulk ID condition (e.g., asset_id = ANY($1)).\"\"\"\n        self.conditions.append((f\"{column}_ARRAY\", values))\n        return self\n\n    def _build_where(self, param_start: int = 1) -> Tuple[str, List[Any], int]:\n        \"\"\"Build WHERE clause for the query.\"\"\"\n        clauses: List[str] = []\n        params: List[Any] = []\n        param_idx = param_start\n\n        # Always include workspace_id\n        if self.workspace_id:\n            clauses.append(f\"workspace_id = ${param_idx}\")\n            params.append(self.workspace_id)\n            param_idx += 1\n\n        for column, value in self.conditions:\n            if column.endswith(\"_ARRAY\"):\n                actual_col = column.replace(\"_ARRAY\", \"\")\n                clauses.append(f\"{actual_col} = ANY(${param_idx})\")\n            else:\n                clauses.append(f\"{column} = ${param_idx}\")\n            params.append(value)\n            param_idx += 1\n\n        return \" AND \".join(clauses), params, param_idx\n\n    def build_soft_delete(self) -> Tuple[str, List[Any]]:\n        \"\"\"\n        Build a soft delete UPDATE query.\n\n        Returns:\n            Tuple of (query_string, params_list)\n        \"\"\"\n        set_clauses = [\"is_deleted = true\", \"deleted_at = NOW()\"]\n        params: List[Any] = []\n        param_idx = 1\n\n        if self.deleted_by:\n            set_clauses.append(f\"deleted_by = ${param_idx}\")\n            params.append(self.deleted_by)\n            param_idx += 1\n\n        where_clause, where_params, _ = self._build_where(param_idx)\n        params.extend(where_params)\n\n        query = f\"\"\"\n            UPDATE {self.table_name}\n            SET {', '.join(set_clauses)}\n            WHERE {where_clause} AND is_deleted = false\n        \"\"\"\n\n        return query.strip(), params\n\n    def build_restore(self) -> Tuple[str, List[Any]]:\n        \"\"\"\n        Build a restore (un-delete) UPDATE query.\n\n        Returns:\n            Tuple of (query_string, params_list)\n        \"\"\"\n        where_clause, params, _ = self._build_where()\n\n        query = f\"\"\"\n            UPDATE {self.table_name}\n            SET is_deleted = false, deleted_at = NULL, deleted_by = NULL\n            WHERE {where_clause} AND is_deleted = true\n        \"\"\"\n\n        return query.strip(), params\n\n    def build_hard_delete(self) -> Tuple[str, List[Any]]:\n        \"\"\"\n        Build a hard delete (permanent) DELETE query.\n\n        WARNING: This permanently removes data. Use with caution.\n\n        Returns:\n            Tuple of (query_string, params_list)\n        \"\"\"\n        where_clause, params, _ = self._build_where()\n\n        query = f\"\"\"\n            DELETE FROM {self.table_name}\n            WHERE {where_clause}\n        \"\"\"\n\n        return query.strip(), params\n\n    def build_filter_active(self) -> str:\n        \"\"\"Get WHERE clause fragment for filtering active records.\"\"\"\n        return \"is_deleted = false\"\n\n    def build_filter_deleted(self) -> str:\n        \"\"\"Get WHERE clause fragment for filtering deleted records.\"\"\"\n        return \"is_deleted = true AND deleted_at IS NOT NULL\"\n\n    def get_params(self) -> List[Any]:\n        \"\"\"Get all condition parameters.\"\"\"\n        params: List[Any] = []\n        if self.deleted_by:\n            params.append(self.deleted_by)\n        if self.workspace_id:\n            params.append(self.workspace_id)\n        for _, value in self.conditions:\n            params.append(value)\n        return params\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "in_progress",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "pending",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\pool.py",
  "content": "\"\"\"\nDatabase Connection Pool Management.\n\nProvides unified connection pooling with PgBouncer support\nfor all RawDrive microservices.\n\"\"\"\n\nfrom __future__ import annotations\n\nimport asyncio\nimport json\nimport logging\nimport time\nfrom contextlib import asynccontextmanager\nfrom dataclasses import dataclass\nfrom typing import Any, AsyncIterator, Callable, Optional, TypeVar\n\nimport asyncpg\nfrom asyncpg import Connection, Pool\nfrom asyncpg.transaction import Transaction\n\nfrom .constants import IsolationLevel, POOL_DEFAULTS\nfrom .dsn import build_pgbouncer_dsn, normalize_database_url\n\nlogger = logging.getLogger(__name__)\n\nT = TypeVar(\"T\")\n\n\n@dataclass\nclass PoolConfig:\n    \"\"\"Configuration for database connection pool.\"\"\"\n\n    database_url: str\n    min_size: int = POOL_DEFAULTS.MIN_SIZE\n    max_size: int = POOL_DEFAULTS.MAX_SIZE\n    command_timeout: int = POOL_DEFAULTS.COMMAND_TIMEOUT\n    max_inactive_connection_lifetime: int = POOL_DEFAULTS.MAX_INACTIVE_CONNECTION_LIFETIME\n    pgbouncer_enabled: bool = False\n    pgbouncer_host: str = POOL_DEFAULTS.PGBOUNCER_HOST\n    pgbouncer_port: int = POOL_DEFAULTS.PGBOUNCER_PORT\n    application_name: Optional[str] = None\n\n    @classmethod\n    def from_env(cls, prefix: str = \"\") -> \"PoolConfig\":\n        \"\"\"\n        Create config from environment variables.\n\n        Args:\n            prefix: Optional prefix for env vars (e.g., \"GALLERY_\")\n\n        Returns:\n            PoolConfig instance\n        \"\"\"\n        import os\n\n        def get_env(key: str, default: Any = None) -> Any:\n            return os.environ.get(f\"{prefix}{key}\", default)\n\n        return cls(\n            database_url=get_env(\"DATABASE_URL\", \"\"),\n            min_size=int(get_env(\"DB_POOL_MIN_SIZE\", POOL_DEFAULTS.MIN_SIZE)),\n            max_size=int(get_env(\"DB_POOL_MAX_SIZE\", POOL_DEFAULTS.MAX_SIZE)),\n            command_timeout=int(get_env(\"DB_COMMAND_TIMEOUT\", POOL_DEFAULTS.COMMAND_TIMEOUT)),\n            max_inactive_connection_lifetime=int(\n                get_env(\"DB_POOL_MAX_LIFETIME_SEC\", POOL_DEFAULTS.MAX_INACTIVE_CONNECTION_LIFETIME)\n            ),\n            pgbouncer_enabled=get_env(\"PGBOUNCER_ENABLED\", \"false\").lower() == \"true\",\n            pgbouncer_host=get_env(\"PGBOUNCER_HOST\", POOL_DEFAULTS.PGBOUNCER_HOST),\n            pgbouncer_port=int(get_env(\"PGBOUNCER_PORT\", POOL_DEFAULTS.PGBOUNCER_PORT)),\n            application_name=get_env(\"SERVICE_NAME\"),\n        )\n\n\n@dataclass\nclass PoolStats:\n    \"\"\"Statistics about the connection pool state.\"\"\"\n\n    size: int\n    free_size: int\n    used_size: int\n    min_size: int\n    max_size: int\n\n    @property\n    def utilization_percent(self) -> float:\n        \"\"\"Calculate pool utilization as a percentage.\"\"\"\n        if self.size == 0:\n            return 0.0\n        return (self.used_size / self.size) * 100\n\n    def to_dict(self) -> dict:\n        \"\"\"Convert to dictionary for logging/monitoring.\"\"\"\n        return {\n            \"size\": self.size,\n            \"free_size\": self.free_size,\n            \"used_size\": self.used_size,\n            \"min_size\": self.min_size,\n            \"max_size\": self.max_size,\n            \"utilization_percent\": round(self.utilization_percent, 2),\n        }\n\n\nclass DatabasePool:\n    \"\"\"\n    Unified database connection pool manager.\n\n    Provides connection pooling with PgBouncer support,\n    read replica routing, and health checking.\n\n    Example:\n        pool = DatabasePool(config)\n        await pool.initialize()\n\n        async with pool.get_connection() as conn:\n            result = await conn.fetch(\"SELECT * FROM users\")\n\n        await pool.close()\n    \"\"\"\n\n    def __init__(self, config: PoolConfig):\n        \"\"\"\n        Initialize the pool manager.\n\n        Args:\n            config: Pool configuration\n        \"\"\"\n        self.config = config\n        self._pool: Optional[Pool] = None\n        self._read_pool: Optional[Pool] = None\n\n    async def initialize(self) -> None:\n        \"\"\"Initialize the primary connection pool.\"\"\"\n        if self._pool is not None:\n            return\n\n        dsn = build_pgbouncer_dsn(\n            self.config.database_url,\n            pgbouncer_host=self.config.pgbouncer_host,\n            pgbouncer_port=self.config.pgbouncer_port,\n            enabled=self.config.pgbouncer_enabled,\n        )\n\n        pool_kwargs: dict = {\n            \"dsn\": dsn,\n            \"min_size\": self.config.min_size,\n            \"max_size\": self.config.max_size,\n            \"command_timeout\": self.config.command_timeout,\n            \"max_inactive_connection_lifetime\": float(self.config.max_inactive_connection_lifetime),\n            \"init\": self._setup_connection,\n        }\n\n        # Disable statement caching for PgBouncer compatibility\n        if self.config.pgbouncer_enabled:\n            pool_kwargs[\"statement_cache_size\"] = 0\n\n        if self.config.application_name:\n            pool_kwargs[\"server_settings\"] = {\n                \"application_name\": self.config.application_name,\n            }\n\n        self._pool = await asyncpg.create_pool(**pool_kwargs)\n\n        logger.info(\n            \"PostgreSQL pool initialized\",\n            extra={\n                \"min_size\": self.config.min_size,\n                \"max_size\": self.config.max_size,\n                \"pgbouncer_enabled\": self.config.pgbouncer_enabled,\n            },\n        )\n\n    async def initialize_read_replica(self, read_replica_url: str) -> None:\n        \"\"\"\n        Initialize a separate pool for read replicas.\n\n        Args:\n            read_replica_url: Database URL for read replica\n        \"\"\"\n        if self._read_pool is not None:\n            return\n\n        dsn = build_pgbouncer_dsn(\n            read_replica_url,\n            pgbouncer_host=self.config.pgbouncer_host,\n            pgbouncer_port=self.config.pgbouncer_port,\n            enabled=self.config.pgbouncer_enabled,\n        )\n\n        pool_kwargs: dict = {\n            \"dsn\": dsn,\n            \"min_size\": self.config.min_size,\n            \"max_size\": self.config.max_size,\n            \"command_timeout\": self.config.command_timeout,\n            \"init\": self._setup_connection,\n        }\n\n        if self.config.pgbouncer_enabled:\n            pool_kwargs[\"statement_cache_size\"] = 0\n\n        if self.config.application_name:\n            pool_kwargs[\"server_settings\"] = {\n                \"application_name\": f\"{self.config.application_name}-read\",\n            }\n\n        self._read_pool = await asyncpg.create_pool(**pool_kwargs)\n\n        logger.info(\n            \"Read replica pool initialized\",\n            extra={\"pgbouncer_enabled\": self.config.pgbouncer_enabled},\n        )\n\n    async def _setup_connection(self, conn: asyncpg.Connection) -> None:\n        \"\"\"Set up JSON/JSONB type codecs for a connection.\"\"\"\n        await conn.set_type_codec(\n            'json',\n            encoder=json.dumps,\n            decoder=json.loads,\n            schema='pg_catalog'\n        )\n        await conn.set_type_codec(\n            'jsonb',\n            encoder=json.dumps,\n            decoder=json.loads,\n            schema='pg_catalog'\n        )\n\n    async def close(self) -> None:\n        \"\"\"Close all connection pools.\"\"\"\n        if self._pool is not None:\n            await self._pool.close()\n            self._pool = None\n            logger.info(\"Primary pool closed\")\n\n        if self._read_pool is not None:\n            await self._read_pool.close()\n            self._read_pool = None\n            logger.info(\"Read replica pool closed\")\n\n    def get_pool(self, read_only: bool = False) -> Pool:\n        \"\"\"\n        Get the appropriate pool.\n\n        Args:\n            read_only: If True, returns read replica pool (or primary if not available)\n\n        Returns:\n            Connection pool\n        \"\"\"\n        if read_only and self._read_pool is not None:\n            return self._read_pool\n\n        if self._pool is None:\n            raise RuntimeError(\"Pool not initialized. Call initialize() first.\")\n\n        return self._pool\n\n    @asynccontextmanager\n    async def acquire(self, read_only: bool = False) -> AsyncIterator[Connection]:\n        \"\"\"\n        Acquire a connection from the pool.\n\n        Args:\n            read_only: If True, uses read replica pool\n\n        Yields:\n            Database connection\n        \"\"\"\n        pool = self.get_pool(read_only=read_only)\n        async with pool.acquire() as conn:\n            yield conn\n\n    async def get_stats(self, include_read_replica: bool = True) -> dict:\n        \"\"\"\n        Get connection pool statistics.\n\n        Args:\n            include_read_replica: Include read replica stats if available\n\n        Returns:\n            Dictionary with pool statistics\n        \"\"\"\n        stats = {}\n\n        if self._pool is not None:\n            stats[\"primary\"] = PoolStats(\n                size=self._pool.get_size(),\n                free_size=self._pool.get_idle_size(),\n                used_size=self._pool.get_size() - self._pool.get_idle_size(),\n                min_size=self._pool.get_min_size(),\n                max_size=self._pool.get_max_size(),\n            ).to_dict()\n\n        if include_read_replica and self._read_pool is not None:\n            stats[\"read_replica\"] = PoolStats(\n                size=self._read_pool.get_size(),\n                free_size=self._read_pool.get_idle_size(),\n                used_size=self._read_pool.get_size() - self._read_pool.get_idle_size(),\n                min_size=self._read_pool.get_min_size(),\n                max_size=self._read_pool.get_max_size(),\n            ).to_dict()\n\n        return stats\n\n    async def healthcheck(self, timeout: float = 1.0) -> bool:\n        \"\"\"\n        Run a lightweight health check (SELECT 1).\n\n        Args:\n            timeout: Maximum time to wait for health check\n\n        Returns:\n            True if healthy, False otherwise\n        \"\"\"\n        try:\n            async with self.acquire() as conn:\n                result = await asyncio.wait_for(\n                    conn.fetchval(\"SELECT 1\"),\n                    timeout=timeout,\n                )\n                return result == 1\n        except Exception as e:\n            logger.warning(\"Health check failed\", extra={\"error\": str(e)})\n            return False\n\n\n# =============================================================================\n# Global Pool Instance (for simple service setup)\n# =============================================================================\n\n_pool: Optional[DatabasePool] = None\n\n\nasync def init_pool(config: PoolConfig) -> DatabasePool:\n    \"\"\"\n    Initialize the global database pool.\n\n    Args:\n        config: Pool configuration\n\n    Returns:\n        Initialized DatabasePool instance\n    \"\"\"\n    global _pool\n    if _pool is None:\n        _pool = DatabasePool(config)\n        await _pool.initialize()\n    return _pool\n\n\nasync def get_pool_instance() -> DatabasePool:\n    \"\"\"Get the global pool instance.\"\"\"\n    if _pool is None:\n        raise RuntimeError(\"Pool not initialized. Call init_pool() first.\")\n    return _pool\n\n\nasync def close_pool() -> None:\n    \"\"\"Close the global pool.\"\"\"\n    global _pool\n    if _pool is not None:\n        await _pool.close()\n        _pool = None\n\n\n@asynccontextmanager\nasync def get_connection(read_only: bool = False) -> AsyncIterator[Connection]:\n    \"\"\"\n    Get a connection from the global pool.\n\n    Args:\n        read_only: If True, uses read replica pool\n\n    Yields:\n        Database connection\n    \"\"\"\n    pool = await get_pool_instance()\n    async with pool.acquire(read_only=read_only) as conn:\n        yield conn\n\n\n# =============================================================================\n# Transaction Context Managers\n# =============================================================================\n\n\n@asynccontextmanager\nasync def get_transaction(\n    isolation: IsolationLevel = IsolationLevel.READ_COMMITTED,\n    readonly: bool = False,\n    deferrable: bool = False,\n) -> AsyncIterator[Connection]:\n    \"\"\"\n    Execute a block of code within a database transaction.\n\n    Automatically handles transaction lifecycle:\n    - Acquires a connection from the pool\n    - Starts a transaction with specified isolation level\n    - Commits on successful completion\n    - Rolls back on exception\n    - Returns the connection to the pool\n\n    Args:\n        isolation: Transaction isolation level\n        readonly: If True, the transaction is read-only\n        deferrable: If True and readonly=True, allows deferrable serializable transactions\n\n    Yields:\n        Connection with active transaction\n\n    Example:\n        async with get_transaction() as conn:\n            await conn.execute(\"INSERT INTO users (name) VALUES ($1)\", \"John\")\n            await conn.execute(\"INSERT INTO audit_log (action) VALUES ($1)\", \"user_created\")\n    \"\"\"\n    pool = await get_pool_instance()\n    started_at = time.monotonic()\n\n    async with pool.acquire() as conn:\n        async with conn.transaction(\n            isolation=isolation.value,\n            readonly=readonly,\n            deferrable=deferrable,\n        ):\n            logger.debug(\n                \"Transaction started\",\n                extra={\n                    \"isolation\": isolation.value,\n                    \"readonly\": readonly,\n                },\n            )\n            try:\n                yield conn\n                elapsed = time.monotonic() - started_at\n                logger.debug(\n                    \"Transaction committed\",\n                    extra={\"elapsed_seconds\": elapsed},\n                )\n            except Exception:\n                elapsed = time.monotonic() - started_at\n                logger.debug(\n                    \"Transaction rolled back\",\n                    extra={\"elapsed_seconds\": elapsed},\n                )\n                raise\n\n\n@asynccontextmanager\nasync def readonly_transaction(\n    isolation: IsolationLevel = IsolationLevel.READ_COMMITTED,\n) -> AsyncIterator[Connection]:\n    \"\"\"\n    Execute a block of code within a read-only transaction.\n\n    Read-only transactions provide optimization hints to PostgreSQL\n    and prevent accidental data modifications.\n\n    Args:\n        isolation: Transaction isolation level\n\n    Yields:\n        Connection with active read-only transaction\n    \"\"\"\n    async with get_transaction(isolation=isolation, readonly=True) as conn:\n        yield conn\n\n\n@asynccontextmanager\nasync def serializable_transaction(\n    readonly: bool = False,\n) -> AsyncIterator[Connection]:\n    \"\"\"\n    Execute a block of code within a serializable transaction.\n\n    Serializable isolation provides the strongest consistency guarantees,\n    preventing all concurrency anomalies at the cost of potential\n    serialization failures that must be retried.\n\n    Args:\n        readonly: If True, the transaction is read-only\n\n    Yields:\n        Connection with active serializable transaction\n    \"\"\"\n    async with get_transaction(\n        isolation=IsolationLevel.SERIALIZABLE,\n        readonly=readonly,\n    ) as conn:\n        yield conn\n\n\n@asynccontextmanager\nasync def savepoint(\n    conn: Connection,\n    name: Optional[str] = None,\n) -> AsyncIterator[Transaction]:\n    \"\"\"\n    Create a savepoint within an existing transaction.\n\n    Savepoints allow partial rollback within a transaction,\n    useful for implementing retry logic or conditional operations.\n\n    Args:\n        conn: Active connection with a transaction\n        name: Optional name for the savepoint\n\n    Yields:\n        Savepoint transaction object\n\n    Example:\n        async with get_transaction() as conn:\n            await conn.execute(\"INSERT INTO orders (id) VALUES ($1)\", order_id)\n            try:\n                async with savepoint(conn) as sp:\n                    await conn.execute(\"INSERT INTO payments ...\")\n            except PaymentError:\n                # Order insert preserved, payment rolled back\n                await conn.execute(\"UPDATE orders SET status = 'payment_failed' ...\")\n    \"\"\"\n    async with conn.transaction() as tx:\n        logger.debug(\"Savepoint created\", extra={\"name\": name})\n        yield tx\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "completed",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "completed",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Implement retry logic utilities",
      "status": "in_progress",
      "activeForm": "Implementing retry logic utilities"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\retry.py",
  "content": "\"\"\"\nDatabase Retry Logic and Error Handling.\n\nProvides automatic retry with exponential backoff for\ntransient database failures (deadlocks, serialization errors, etc.).\n\"\"\"\n\nfrom __future__ import annotations\n\nimport asyncio\nimport logging\nimport random\nfrom dataclasses import dataclass, field\nfrom functools import wraps\nfrom typing import Any, Callable, Optional, Tuple, Type, TypeVar\n\nimport asyncpg\n\nfrom .constants import RETRY_DEFAULTS\n\nlogger = logging.getLogger(__name__)\n\nT = TypeVar(\"T\")\n\n\n# Default retryable exceptions\nRETRYABLE_EXCEPTIONS: Tuple[Type[Exception], ...] = (\n    asyncpg.DeadlockDetectedError,\n    asyncpg.SerializationError,\n    asyncpg.TooManyConnectionsError,\n    asyncpg.ConnectionDoesNotExistError,\n    asyncpg.InterfaceError,\n)\n\n\n@dataclass\nclass RetryConfig:\n    \"\"\"Configuration for database operation retries.\"\"\"\n\n    max_attempts: int = RETRY_DEFAULTS.MAX_ATTEMPTS\n    base_delay: float = RETRY_DEFAULTS.BASE_DELAY\n    max_delay: float = RETRY_DEFAULTS.MAX_DELAY\n    exponential_base: float = RETRY_DEFAULTS.EXPONENTIAL_BASE\n    retryable_exceptions: Tuple[Type[Exception], ...] = field(\n        default_factory=lambda: RETRYABLE_EXCEPTIONS\n    )\n    jitter: bool = True  # Add random jitter to delays\n\n    def calculate_delay(self, attempt: int) -> float:\n        \"\"\"\n        Calculate delay for given attempt number.\n\n        Args:\n            attempt: Current attempt number (1-based)\n\n        Returns:\n            Delay in seconds\n        \"\"\"\n        delay = min(\n            self.base_delay * (self.exponential_base ** (attempt - 1)),\n            self.max_delay,\n        )\n\n        if self.jitter:\n            # Add 0-50% jitter\n            delay += delay * random.uniform(0, 0.5)\n\n        return delay\n\n\ndef with_retry(\n    config: Optional[RetryConfig] = None,\n) -> Callable[[Callable[..., T]], Callable[..., T]]:\n    \"\"\"\n    Decorator for automatic retry of database operations.\n\n    Implements exponential backoff with jitter for retryable exceptions\n    like deadlocks and serialization failures.\n\n    Args:\n        config: Retry configuration (uses defaults if not provided)\n\n    Returns:\n        Decorated function with automatic retry behavior\n\n    Example:\n        @with_retry()\n        async def transfer_funds(from_id: int, to_id: int, amount: Decimal):\n            async with serializable_transaction() as conn:\n                await conn.execute(\n                    \"UPDATE accounts SET balance = balance - $1 WHERE id = $2\",\n                    amount, from_id\n                )\n                await conn.execute(\n                    \"UPDATE accounts SET balance = balance + $1 WHERE id = $2\",\n                    amount, to_id\n                )\n    \"\"\"\n    retry_config = config or RetryConfig()\n\n    def decorator(func: Callable[..., T]) -> Callable[..., T]:\n        @wraps(func)\n        async def wrapper(*args: Any, **kwargs: Any) -> T:\n            last_exception: Optional[Exception] = None\n\n            for attempt in range(1, retry_config.max_attempts + 1):\n                try:\n                    return await func(*args, **kwargs)\n                except retry_config.retryable_exceptions as e:\n                    last_exception = e\n\n                    if attempt == retry_config.max_attempts:\n                        logger.warning(\n                            \"Database operation failed after max retries\",\n                            extra={\n                                \"function\": func.__name__,\n                                \"attempts\": attempt,\n                                \"error\": str(e),\n                                \"error_type\": type(e).__name__,\n                            },\n                        )\n                        raise\n\n                    delay = retry_config.calculate_delay(attempt)\n\n                    logger.info(\n                        \"Retrying database operation\",\n                        extra={\n                            \"function\": func.__name__,\n                            \"attempt\": attempt,\n                            \"max_attempts\": retry_config.max_attempts,\n                            \"delay_seconds\": delay,\n                            \"error\": str(e),\n                            \"error_type\": type(e).__name__,\n                        },\n                    )\n                    await asyncio.sleep(delay)\n\n            # This should not be reached, but satisfy type checker\n            if last_exception:\n                raise last_exception\n            raise RuntimeError(\"Unexpected retry loop exit\")\n\n        return wrapper  # type: ignore\n\n    return decorator\n\n\nasync def execute_with_retry(\n    conn_getter: Callable,\n    query: str,\n    *args: Any,\n    config: Optional[RetryConfig] = None,\n) -> str:\n    \"\"\"\n    Execute a query with automatic retry on transient failures.\n\n    Args:\n        conn_getter: Async context manager that provides a connection\n        query: The SQL query to execute\n        *args: Query parameters\n        config: Retry configuration\n\n    Returns:\n        The status of the query execution (e.g., \"INSERT 0 1\")\n\n    Example:\n        from database_utils import get_connection, execute_with_retry\n\n        status = await execute_with_retry(\n            get_connection,\n            \"UPDATE users SET last_login = NOW() WHERE id = $1\",\n            user_id,\n        )\n    \"\"\"\n    retry_config = config or RetryConfig()\n\n    @with_retry(retry_config)\n    async def _execute() -> str:\n        async with conn_getter() as conn:\n            return await conn.execute(query, *args)\n\n    return await _execute()\n\n\nasync def fetch_with_retry(\n    conn_getter: Callable,\n    query: str,\n    *args: Any,\n    config: Optional[RetryConfig] = None,\n) -> list[asyncpg.Record]:\n    \"\"\"\n    Fetch results with automatic retry on transient failures.\n\n    Args:\n        conn_getter: Async context manager that provides a connection\n        query: The SQL query to execute\n        *args: Query parameters\n        config: Retry configuration\n\n    Returns:\n        List of records from the query\n\n    Example:\n        users = await fetch_with_retry(\n            get_connection,\n            \"SELECT * FROM users WHERE status = $1\",\n            \"active\",\n        )\n    \"\"\"\n    retry_config = config or RetryConfig()\n\n    @with_retry(retry_config)\n    async def _fetch() -> list[asyncpg.Record]:\n        async with conn_getter() as conn:\n            return await conn.fetch(query, *args)\n\n    return await _fetch()\n\n\nasync def fetchval_with_retry(\n    conn_getter: Callable,\n    query: str,\n    *args: Any,\n    column: int = 0,\n    config: Optional[RetryConfig] = None,\n) -> Any:\n    \"\"\"\n    Fetch a single value with automatic retry on transient failures.\n\n    Args:\n        conn_getter: Async context manager that provides a connection\n        query: The SQL query to execute\n        *args: Query parameters\n        column: The column index to return (default: 0)\n        config: Retry configuration\n\n    Returns:\n        The value from the specified column of the first row\n\n    Example:\n        count = await fetchval_with_retry(\n            get_connection,\n            \"SELECT COUNT(*) FROM users WHERE status = $1\",\n            \"active\",\n        )\n    \"\"\"\n    retry_config = config or RetryConfig()\n\n    @with_retry(retry_config)\n    async def _fetchval() -> Any:\n        async with conn_getter() as conn:\n            return await conn.fetchval(query, *args, column=column)\n\n    return await _fetchval()\n\n\nasync def fetchrow_with_retry(\n    conn_getter: Callable,\n    query: str,\n    *args: Any,\n    config: Optional[RetryConfig] = None,\n) -> Optional[asyncpg.Record]:\n    \"\"\"\n    Fetch a single row with automatic retry on transient failures.\n\n    Args:\n        conn_getter: Async context manager that provides a connection\n        query: The SQL query to execute\n        *args: Query parameters\n        config: Retry configuration\n\n    Returns:\n        Single record or None\n\n    Example:\n        user = await fetchrow_with_retry(\n            get_connection,\n            \"SELECT * FROM users WHERE id = $1\",\n            user_id,\n        )\n    \"\"\"\n    retry_config = config or RetryConfig()\n\n    @with_retry(retry_config)\n    async def _fetchrow() -> Optional[asyncpg.Record]:\n        async with conn_getter() as conn:\n            return await conn.fetchrow(query, *args)\n\n    return await _fetchrow()\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "completed",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "completed",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Implement retry logic utilities",
      "status": "completed",
      "activeForm": "Implementing retry logic utilities"
    },
    {
      "content": "Create README documentation",
      "status": "in_progress",
      "activeForm": "Creating README documentation"
    },
    {
      "content": "Update services to use shared package",
      "status": "pending",
      "activeForm": "Updating services to use shared package"
    }
  ]
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\README.md",
  "content": "# @rawdrive/database-utils\n\nShared PostgreSQL database utilities for RawDrive microservices.\n\n## Features\n\n- **Connection Pooling** - Unified asyncpg pool management with PgBouncer support\n- **Workspace Isolation** - Query builders that enforce multi-tenant security\n- **LIKE Pattern Escaping** - Prevent SQL injection in search queries\n- **Pagination Helpers** - Consistent LIMIT/OFFSET pagination across services\n- **Soft Delete Patterns** - Standard soft delete/restore queries\n- **Transaction Management** - Context managers with isolation level support\n- **Retry Logic** - Automatic retry with exponential backoff for transient failures\n\n## Installation\n\nThe package is a Python module in the monorepo. Add it to your service's Python path:\n\n```python\n# In your service's pyproject.toml or setup.py\ndependencies = [\n    # Other dependencies\n]\n\n# Add to PYTHONPATH in docker-compose or deployment config\nPYTHONPATH=/app/packages/database-utils/python:$PYTHONPATH\n```\n\n## Usage\n\n### Connection Pooling\n\n```python\nfrom database_utils import (\n    DatabasePool,\n    PoolConfig,\n    init_pool,\n    get_connection,\n    close_pool,\n)\n\n# Option 1: Using DatabasePool directly\nconfig = PoolConfig(\n    database_url=\"postgresql://user:pass@localhost/db\",\n    min_size=2,\n    max_size=20,\n    pgbouncer_enabled=True,\n)\n\npool = DatabasePool(config)\nawait pool.initialize()\n\nasync with pool.acquire() as conn:\n    result = await conn.fetch(\"SELECT * FROM users\")\n\nawait pool.close()\n\n# Option 2: Using global pool functions\nconfig = PoolConfig.from_env()  # Load from environment variables\nawait init_pool(config)\n\nasync with get_connection() as conn:\n    result = await conn.fetch(\"SELECT * FROM users\")\n\nawait close_pool()\n```\n\n### Workspace Isolation\n\n```python\nfrom database_utils import WorkspaceQueryBuilder, SoftDeleteFilter\nfrom uuid import UUID\n\nworkspace_id = UUID(\"...\")\n\n# Build workspace-scoped query\nbuilder = WorkspaceQueryBuilder(workspace_id)\nbuilder.add_condition(\"status\", \"=\", \"active\")\nbuilder.add_like_condition(\"name\", \"John\")  # Properly escaped\nbuilder.set_soft_delete_filter(SoftDeleteFilter.ACTIVE)\n\nwhere_clause, params = builder.build()\n# where_clause: \"workspace_id = $1 AND is_deleted = false AND status = $2 AND name ILIKE $3 ESCAPE '\\\\'\"\n# params: [workspace_id, \"active\", \"%John%\"]\n\nquery = f\"SELECT * FROM clients WHERE {where_clause}\"\nresults = await conn.fetch(query, *params)\n```\n\n### LIKE Pattern Escaping\n\n```python\nfrom database_utils import escape_like_pattern, build_like_clause\n\n# Basic escaping\nuser_input = \"50% off!\"\nsafe_pattern = escape_like_pattern(user_input)\n# safe_pattern: \"50\\\\% off!\"\n\n# Build complete LIKE clause\nclause, value, next_idx = build_like_clause(\"name\", \"John\", param_index=1)\n# clause: \"name ILIKE $1 ESCAPE '\\\\'\"\n# value: \"%John%\"\n```\n\n### Pagination\n\n```python\nfrom database_utils import PaginationQueryBuilder\n\npagination = PaginationQueryBuilder(page=2, limit=20)\npagination.set_order(\"created_at\", \"DESC\")\n\n# Build query suffix\nsuffix = pagination.build_suffix(param_start=3)\n# suffix: \"ORDER BY created_at DESC LIMIT $3 OFFSET $4\"\n\n# Get parameters\nparams = pagination.get_params()\n# params: [20, 20]  # limit=20, offset=20 (page 2)\n\n# Full query example\nquery = f\"\"\"\n    SELECT * FROM assets\n    WHERE workspace_id = $1 AND status = $2\n    {suffix}\n\"\"\"\nresults = await conn.fetch(query, workspace_id, \"active\", *params)\n\n# Calculate metadata\ntotal = await conn.fetchval(\"SELECT COUNT(*) FROM assets WHERE ...\")\nhas_next = pagination.has_next_page(total)\ntotal_pages = pagination.calculate_total_pages(total)\n```\n\n### Soft Delete\n\n```python\nfrom database_utils import SoftDeleteQueryBuilder\nfrom uuid import UUID\n\nworkspace_id = UUID(\"...\")\nasset_id = UUID(\"...\")\nuser_id = UUID(\"...\")\n\nbuilder = SoftDeleteQueryBuilder(\"assets\")\nbuilder.set_workspace(workspace_id)\nbuilder.set_deleted_by(user_id)\nbuilder.add_id_condition(\"asset_id\", asset_id)\n\n# Soft delete\nquery, params = builder.build_soft_delete()\nawait conn.execute(query, *params)\n\n# Restore\nquery, params = builder.build_restore()\nawait conn.execute(query, *params)\n\n# Filter clauses for SELECT queries\nactive_filter = builder.build_filter_active()  # \"is_deleted = false\"\ndeleted_filter = builder.build_filter_deleted()  # \"is_deleted = true AND deleted_at IS NOT NULL\"\n```\n\n### Transaction Management\n\n```python\nfrom database_utils import (\n    get_transaction,\n    readonly_transaction,\n    serializable_transaction,\n    savepoint,\n    IsolationLevel,\n)\n\n# Basic transaction\nasync with get_transaction() as conn:\n    await conn.execute(\"INSERT INTO users ...\")\n    await conn.execute(\"INSERT INTO audit_log ...\")\n    # Commits on success, rolls back on exception\n\n# Read-only transaction\nasync with readonly_transaction() as conn:\n    users = await conn.fetch(\"SELECT * FROM users\")\n    # Any write attempt will fail\n\n# Serializable isolation (strongest consistency)\nasync with serializable_transaction() as conn:\n    balance = await conn.fetchval(\"SELECT balance FROM accounts WHERE id = $1\", 1)\n    await conn.execute(\"UPDATE accounts SET balance = $1 WHERE id = $2\", balance - 100, 1)\n\n# Savepoints for partial rollback\nasync with get_transaction() as conn:\n    await conn.execute(\"INSERT INTO orders (id) VALUES ($1)\", order_id)\n    try:\n        async with savepoint(conn):\n            await conn.execute(\"INSERT INTO payments ...\")\n    except PaymentError:\n        # Order preserved, payment rolled back\n        await conn.execute(\"UPDATE orders SET status = 'failed' ...\")\n```\n\n### Retry Logic\n\n```python\nfrom database_utils import (\n    with_retry,\n    RetryConfig,\n    execute_with_retry,\n    fetch_with_retry,\n    get_connection,\n)\n\n# Using decorator\n@with_retry()\nasync def transfer_funds(from_id: int, to_id: int, amount: Decimal):\n    async with serializable_transaction() as conn:\n        # Automatically retries on deadlock or serialization failure\n        await conn.execute(\"UPDATE accounts SET balance = balance - $1 WHERE id = $2\", amount, from_id)\n        await conn.execute(\"UPDATE accounts SET balance = balance + $1 WHERE id = $2\", amount, to_id)\n\n# Custom retry config\nconfig = RetryConfig(\n    max_attempts=5,\n    base_delay=0.2,\n    max_delay=10.0,\n)\n\n@with_retry(config)\nasync def my_critical_operation():\n    ...\n\n# Using helper functions\nstatus = await execute_with_retry(\n    get_connection,\n    \"UPDATE users SET last_login = NOW() WHERE id = $1\",\n    user_id,\n)\n\nusers = await fetch_with_retry(\n    get_connection,\n    \"SELECT * FROM users WHERE status = $1\",\n    \"active\",\n)\n```\n\n## Environment Variables\n\nThe package respects these environment variables when using `PoolConfig.from_env()`:\n\n| Variable | Description | Default |\n|----------|-------------|---------|\n| `DATABASE_URL` | PostgreSQL connection URL | Required |\n| `DB_POOL_MIN_SIZE` | Minimum pool connections | 2 |\n| `DB_POOL_MAX_SIZE` | Maximum pool connections | 20 |\n| `DB_COMMAND_TIMEOUT` | Query timeout (seconds) | 60 |\n| `DB_POOL_MAX_LIFETIME_SEC` | Max connection lifetime | 1800 |\n| `PGBOUNCER_ENABLED` | Enable PgBouncer routing | false |\n| `PGBOUNCER_HOST` | PgBouncer hostname | pgbouncer |\n| `PGBOUNCER_PORT` | PgBouncer port | 6432 |\n| `SERVICE_NAME` | Application name for connections | None |\n\n## Migration from Service-Specific Database Modules\n\nReplace service-specific database.py imports with the shared package:\n\n### Before\n\n```python\n# In gallery-service/src/database.py (duplicated in 6+ services)\nfrom src.database import get_connection, get_pool, close_pool\n```\n\n### After\n\n```python\nfrom database_utils import (\n    init_pool,\n    get_connection,\n    close_pool,\n    PoolConfig,\n)\n\n# In main.py startup\nconfig = PoolConfig.from_env()\nawait init_pool(config)\n\n# Use get_connection as before\nasync with get_connection() as conn:\n    ...\n```\n\n## TypeScript Types\n\nFor TypeScript services (if any), the package also exports type definitions:\n\n```typescript\nimport type {\n    PoolConfig,\n    PoolStats,\n    IsolationLevel,\n    RetryConfig,\n} from '@rawdrive/database-utils';\n```\n\n## Best Practices\n\n1. **Always use WorkspaceQueryBuilder** for queries that access tenant data\n2. **Never hardcode workspace_id** - extract from JWT token in middleware\n3. **Use escape_like_pattern** for any user-provided search input\n4. **Prefer PaginationQueryBuilder** over manual LIMIT/OFFSET\n5. **Use transactions** for multi-statement operations\n6. **Apply @with_retry** to critical operations that may face contention\n7. **Enable PgBouncer** in production for better connection scaling\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "completed",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "completed",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Implement retry logic utilities",
      "status": "completed",
      "activeForm": "Implementing retry logic utilities"
    },
    {
      "content": "Create README documentation",
      "status": "completed",
      "activeForm": "Creating README documentation"
    },
    {
      "content": "Update gallery-service to use shared package",
      "status": "in_progress",
      "activeForm": "Updating gallery-service to use shared package"
    }
  ]
}

Now let me update the gallery-service as an example of how to migrate to the shared package:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\gallery-service\\src\\database.py"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\gallery-service\\src\\database.py",
  "content": "\"\"\"\nDatabase connection module for PostgreSQL with PgBouncer support.\n\nOptimized for 50K concurrent gallery views with:\n- Connection pooling (up to 100 connections per pod)\n- Read replica support for public endpoints\n- Async operations with asyncpg\n- PgBouncer routing for 5000+ concurrent user scaling\n\nThis module wraps @rawdrive/database-utils for service-specific configuration.\n\"\"\"\n\nfrom __future__ import annotations\n\nimport sys\nfrom pathlib import Path\nfrom typing import AsyncGenerator, Optional, List\nfrom contextlib import asynccontextmanager\nimport asyncpg\n\n# Add database-utils to path for import\n# In production, this would be handled by PYTHONPATH in the container\n_packages_path = Path(__file__).parent.parent.parent.parent.parent / \"packages\" / \"database-utils\" / \"python\"\nif str(_packages_path) not in sys.path:\n    sys.path.insert(0, str(_packages_path))\n\nfrom database_utils import (\n    DatabasePool,\n    PoolConfig,\n    PoolStats as DBPoolStats,\n)\nfrom database_utils.dsn import build_pgbouncer_dsn\n\nfrom src.config import settings\nfrom src.log_config import get_logger\n\nlogger = get_logger(__name__)\n\n# Global pool instance\n_pool_instance: Optional[DatabasePool] = None\n\n\ndef _create_pool_config() -> PoolConfig:\n    \"\"\"Create pool configuration from service settings.\"\"\"\n    return PoolConfig(\n        database_url=settings.DATABASE_URL,\n        min_size=settings.DB_POOL_MIN_SIZE,\n        max_size=settings.DB_POOL_MAX_SIZE,\n        command_timeout=settings.DB_COMMAND_TIMEOUT,\n        pgbouncer_enabled=settings.PGBOUNCER_ENABLED,\n        pgbouncer_host=settings.PGBOUNCER_HOST,\n        pgbouncer_port=settings.PGBOUNCER_PORT,\n        application_name=\"gallery-service\",\n    )\n\n\nasync def get_pool() -> asyncpg.Pool:\n    \"\"\"Get or create the primary database connection pool.\"\"\"\n    global _pool_instance\n\n    if _pool_instance is None:\n        config = _create_pool_config()\n        _pool_instance = DatabasePool(config)\n        await _pool_instance.initialize()\n\n        # Initialize read replica if configured\n        if settings.DATABASE_READ_REPLICA_URL:\n            await _pool_instance.initialize_read_replica(settings.DATABASE_READ_REPLICA_URL)\n\n        logger.info(\n            \"Database pools initialized via @rawdrive/database-utils\",\n            extra={\n                \"min_size\": config.min_size,\n                \"max_size\": config.max_size,\n                \"pgbouncer_enabled\": config.pgbouncer_enabled,\n            }\n        )\n\n    return _pool_instance.get_pool(read_only=False)\n\n\nasync def get_read_pool() -> asyncpg.Pool:\n    \"\"\"Get or create the read replica connection pool.\n\n    Falls back to primary pool if no read replica configured.\n    \"\"\"\n    global _pool_instance\n\n    if _pool_instance is None:\n        await get_pool()  # Initialize pools\n\n    return _pool_instance.get_pool(read_only=True)\n\n\nasync def close_pool():\n    \"\"\"Close all database connection pools.\"\"\"\n    global _pool_instance\n    if _pool_instance:\n        await _pool_instance.close()\n        _pool_instance = None\n        logger.info(\"Database pools closed\")\n\n\n@asynccontextmanager\nasync def get_connection(read_only: bool = False) -> AsyncGenerator[asyncpg.Connection, None]:\n    \"\"\"Get a database connection from the appropriate pool.\n\n    Args:\n        read_only: If True, uses read replica pool (for public gallery views)\n    \"\"\"\n    global _pool_instance\n\n    if _pool_instance is None:\n        await get_pool()  # Initialize pools\n\n    async with _pool_instance.acquire(read_only=read_only) as conn:\n        yield conn\n\n\nasync def execute(query: str, *args, read_only: bool = False) -> str:\n    \"\"\"Execute a query and return the status.\"\"\"\n    async with get_connection(read_only=read_only) as conn:\n        return await conn.execute(query, *args)\n\n\nasync def fetch(query: str, *args, read_only: bool = False) -> List[asyncpg.Record]:\n    \"\"\"Execute a query and return all rows.\"\"\"\n    async with get_connection(read_only=read_only) as conn:\n        return await conn.fetch(query, *args)\n\n\nasync def fetchrow(query: str, *args, read_only: bool = False) -> Optional[asyncpg.Record]:\n    \"\"\"Execute a query and return a single row.\"\"\"\n    async with get_connection(read_only=read_only) as conn:\n        return await conn.fetchrow(query, *args)\n\n\nasync def fetchval(query: str, *args, read_only: bool = False):\n    \"\"\"Execute a query and return a single value.\"\"\"\n    async with get_connection(read_only=read_only) as conn:\n        return await conn.fetchval(query, *args)\n\n\nasync def get_pool_stats() -> dict:\n    \"\"\"Get connection pool statistics for monitoring.\"\"\"\n    global _pool_instance\n\n    if _pool_instance is None:\n        return {\"error\": \"Pool not initialized\"}\n\n    return await _pool_instance.get_stats()\n\n\n# Compatibility alias for backward compatibility with xmp_sync endpoints\nget_database = get_connection\n"
}

Now let's update the client_tag_service.py to use the shared escape_like_pattern:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\client_tag_service.py"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\backend\\src\\app\\services\\client_tag_service.py",
  "old_string": "import logging\nimport math\nimport re\nfrom typing import Any, Optional\nfrom uuid import UUID\n\nfrom app.db.postgres import get_postgres_pool\nfrom app.services.client_exceptions import (\n    ClientNotFoundError,\n    ClientValidationError,\n    TagAlreadyAssignedError,\n    TagDuplicateError,\n    TagNotFoundError,\n)\n\nlogger = logging.getLogger(__name__)\n\n# ---------------------------------------------------------------------------\n# Constants\n# ---------------------------------------------------------------------------\n\n# Default colors for tags if none specified\nDEFAULT_TAG_COLORS = [\n    \"#3B82F6\",  # Blue\n    \"#10B981\",  # Green\n    \"#8B5CF6\",  # Purple\n    \"#F59E0B\",  # Amber\n    \"#EF4444\",  # Red\n    \"#06B6D4\",  # Cyan\n    \"#EC4899\",  # Pink\n    \"#6366F1\",  # Indigo\n]\n\n# Maximum tags per workspace\nMAX_TAGS_PER_WORKSPACE = 500\n\n# Maximum tag name length\nMAX_TAG_NAME_LENGTH = 50\n\n# Hex color validation pattern\nHEX_COLOR_PATTERN = re.compile(r\"^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$\")\n\n\ndef escape_like_pattern(pattern: str) -> str:\n    \"\"\"Escape LIKE metacharacters to prevent pattern injection.\n\n    Escapes %, _, and \\ characters that have special meaning in SQL LIKE patterns.\n    \"\"\"\n    return pattern.replace(\"\\\\\", \"\\\\\\\\\").replace(\"%\", \"\\\\%\").replace(\"_\", \"\\\\_\")",
  "new_string": "import logging\nimport math\nimport re\nimport sys\nfrom pathlib import Path\nfrom typing import Any, Optional\nfrom uuid import UUID\n\nfrom app.db.postgres import get_postgres_pool\nfrom app.services.client_exceptions import (\n    ClientNotFoundError,\n    ClientValidationError,\n    TagAlreadyAssignedError,\n    TagDuplicateError,\n    TagNotFoundError,\n)\n\n# Import escape_like_pattern from shared database-utils package\n# In production, PYTHONPATH includes the package path\n_packages_path = Path(__file__).parent.parent.parent.parent.parent / \"packages\" / \"database-utils\" / \"python\"\nif str(_packages_path) not in sys.path:\n    sys.path.insert(0, str(_packages_path))\n\nfrom database_utils.query_builders import escape_like_pattern\n\nlogger = logging.getLogger(__name__)\n\n# ---------------------------------------------------------------------------\n# Constants\n# ---------------------------------------------------------------------------\n\n# Default colors for tags if none specified\nDEFAULT_TAG_COLORS = [\n    \"#3B82F6\",  # Blue\n    \"#10B981\",  # Green\n    \"#8B5CF6\",  # Purple\n    \"#F59E0B\",  # Amber\n    \"#EF4444\",  # Red\n    \"#06B6D4\",  # Cyan\n    \"#EC4899\",  # Pink\n    \"#6366F1\",  # Indigo\n]\n\n# Maximum tags per workspace\nMAX_TAGS_PER_WORKSPACE = 500\n\n# Maximum tag name length\nMAX_TAG_NAME_LENGTH = 50\n\n# Hex color validation pattern\nHEX_COLOR_PATTERN = re.compile(r\"^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$\")"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "completed",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "completed",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Implement retry logic utilities",
      "status": "completed",
      "activeForm": "Implementing retry logic utilities"
    },
    {
      "content": "Create README documentation",
      "status": "completed",
      "activeForm": "Creating README documentation"
    },
    {
      "content": "Update gallery-service to use shared package",
      "status": "completed",
      "activeForm": "Updating gallery-service to use shared package"
    },
    {
      "content": "Update backend client_tag_service to use shared package",
      "status": "completed",
      "activeForm": "Updating backend client_tag_service to use shared package"
    },
    {
      "content": "Add unit tests for database-utils",
      "status": "in_progress",
      "activeForm": "Adding unit tests for database-utils"
    }
  ]
}

Now let me add tests for the database utilities:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\tests\\__init__.py",
  "content": "\"\"\"Tests for @rawdrive/database-utils package.\"\"\"\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\tests\\test_query_builders.py",
  "content": "\"\"\"Tests for query builder utilities.\"\"\"\n\nimport pytest\nfrom uuid import UUID, uuid4\n\nimport sys\nfrom pathlib import Path\n\n# Add parent to path for imports\nsys.path.insert(0, str(Path(__file__).parent.parent))\n\nfrom query_builders import (\n    escape_like_pattern,\n    build_like_clause,\n    WorkspaceQueryBuilder,\n    PaginationQueryBuilder,\n    SoftDeleteQueryBuilder,\n)\nfrom constants import SoftDeleteFilter\n\n\nclass TestEscapeLikePattern:\n    \"\"\"Tests for escape_like_pattern function.\"\"\"\n\n    def test_escapes_percent(self):\n        \"\"\"Percent signs are escaped.\"\"\"\n        assert escape_like_pattern(\"50% off\") == \"50\\\\% off\"\n\n    def test_escapes_underscore(self):\n        \"\"\"Underscores are escaped.\"\"\"\n        assert escape_like_pattern(\"user_name\") == \"user\\\\_name\"\n\n    def test_escapes_backslash(self):\n        \"\"\"Backslashes are escaped.\"\"\"\n        assert escape_like_pattern(\"path\\\\file\") == \"path\\\\\\\\file\"\n\n    def test_escapes_multiple_characters(self):\n        \"\"\"Multiple special characters are escaped.\"\"\"\n        result = escape_like_pattern(\"50% off_sale\\\\today\")\n        assert result == \"50\\\\% off\\\\_sale\\\\\\\\today\"\n\n    def test_empty_string(self):\n        \"\"\"Empty string returns empty string.\"\"\"\n        assert escape_like_pattern(\"\") == \"\"\n\n    def test_no_special_chars(self):\n        \"\"\"String without special chars is unchanged.\"\"\"\n        assert escape_like_pattern(\"hello world\") == \"hello world\"\n\n\nclass TestBuildLikeClause:\n    \"\"\"Tests for build_like_clause function.\"\"\"\n\n    def test_builds_ilike_by_default(self):\n        \"\"\"Default is case-insensitive ILIKE.\"\"\"\n        clause, value, next_idx = build_like_clause(\"name\", \"John\", 1)\n        assert \"ILIKE\" in clause\n        assert \"$1\" in clause\n        assert value == \"%John%\"\n        assert next_idx == 2\n\n    def test_builds_like_when_case_sensitive(self):\n        \"\"\"Case-sensitive uses LIKE.\"\"\"\n        clause, value, _ = build_like_clause(\"name\", \"John\", 1, case_insensitive=False)\n        assert \"LIKE\" in clause\n        assert \"ILIKE\" not in clause\n\n    def test_escapes_pattern(self):\n        \"\"\"Pattern is escaped properly.\"\"\"\n        _, value, _ = build_like_clause(\"name\", \"50%\", 1)\n        assert value == \"%50\\\\%%\"\n\n    def test_increments_param_index(self):\n        \"\"\"Parameter index is incremented.\"\"\"\n        clause, _, next_idx = build_like_clause(\"name\", \"test\", 5)\n        assert \"$5\" in clause\n        assert next_idx == 6\n\n\nclass TestWorkspaceQueryBuilder:\n    \"\"\"Tests for WorkspaceQueryBuilder class.\"\"\"\n\n    def test_always_includes_workspace_id(self):\n        \"\"\"Workspace ID is always first condition.\"\"\"\n        workspace_id = uuid4()\n        builder = WorkspaceQueryBuilder(workspace_id)\n        where_clause, params = builder.build()\n\n        assert \"workspace_id = $1\" in where_clause\n        assert params[0] == workspace_id\n\n    def test_adds_active_filter_by_default(self):\n        \"\"\"Active soft delete filter is applied by default.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        where_clause, _ = builder.build()\n\n        assert \"is_deleted = false\" in where_clause\n\n    def test_deleted_filter(self):\n        \"\"\"Deleted filter includes both conditions.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        builder.set_soft_delete_filter(SoftDeleteFilter.DELETED)\n        where_clause, _ = builder.build()\n\n        assert \"is_deleted = true\" in where_clause\n        assert \"deleted_at IS NOT NULL\" in where_clause\n\n    def test_all_filter(self):\n        \"\"\"All filter excludes soft delete conditions.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)\n        where_clause, _ = builder.build()\n\n        assert \"is_deleted\" not in where_clause\n\n    def test_add_condition(self):\n        \"\"\"Conditions are added with parameters.\"\"\"\n        workspace_id = uuid4()\n        builder = WorkspaceQueryBuilder(workspace_id)\n        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)\n        builder.add_condition(\"status\", \"=\", \"active\")\n        where_clause, params = builder.build()\n\n        assert \"status = $2\" in where_clause\n        assert params[1] == \"active\"\n\n    def test_add_like_condition(self):\n        \"\"\"LIKE conditions are properly escaped.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)\n        builder.add_like_condition(\"name\", \"50% sale\")\n        where_clause, params = builder.build()\n\n        assert \"ILIKE\" in where_clause\n        assert \"ESCAPE\" in where_clause\n        assert \"%50\\\\% sale%\" in params\n\n    def test_add_in_condition(self):\n        \"\"\"IN conditions use ANY syntax.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        builder.set_soft_delete_filter(SoftDeleteFilter.ALL)\n        values = [uuid4(), uuid4()]\n        builder.add_in_condition(\"id\", values)\n        where_clause, params = builder.build()\n\n        assert \"= ANY($2)\" in where_clause\n        assert params[1] == values\n\n    def test_method_chaining(self):\n        \"\"\"Methods return self for chaining.\"\"\"\n        builder = WorkspaceQueryBuilder(uuid4())\n        result = builder.add_condition(\"a\", \"=\", 1).add_condition(\"b\", \"=\", 2)\n        assert result is builder\n\n\nclass TestPaginationQueryBuilder:\n    \"\"\"Tests for PaginationQueryBuilder class.\"\"\"\n\n    def test_calculates_offset(self):\n        \"\"\"Offset is calculated from page and limit.\"\"\"\n        pagination = PaginationQueryBuilder(page=3, limit=20)\n        assert pagination.offset == 40  # (3-1) * 20\n\n    def test_normalizes_page(self):\n        \"\"\"Page less than 1 is normalized.\"\"\"\n        pagination = PaginationQueryBuilder(page=0, limit=20)\n        assert pagination.page == 1\n\n    def test_normalizes_limit(self):\n        \"\"\"Limit is clamped to max_limit.\"\"\"\n        pagination = PaginationQueryBuilder(page=1, limit=200, max_limit=100)\n        assert pagination.limit == 100\n\n    def test_builds_order_clause(self):\n        \"\"\"Order clause is built correctly.\"\"\"\n        pagination = PaginationQueryBuilder()\n        pagination.set_order(\"created_at\", \"DESC\")\n        clause = pagination.build_order_clause()\n\n        assert clause == \"ORDER BY created_at DESC\"\n\n    def test_builds_limit_offset(self):\n        \"\"\"LIMIT/OFFSET clause is built with params.\"\"\"\n        pagination = PaginationQueryBuilder(page=2, limit=10)\n        clause, params, next_idx = pagination.build_limit_offset(param_start=3)\n\n        assert clause == \"LIMIT $3 OFFSET $4\"\n        assert params == [10, 10]  # limit=10, offset=10\n        assert next_idx == 5\n\n    def test_builds_complete_suffix(self):\n        \"\"\"Complete suffix includes ORDER BY, LIMIT, OFFSET.\"\"\"\n        pagination = PaginationQueryBuilder(page=1, limit=20)\n        pagination.set_order(\"id\", \"ASC\")\n        suffix = pagination.build_suffix(param_start=2)\n\n        assert \"ORDER BY id ASC\" in suffix\n        assert \"LIMIT $2\" in suffix\n        assert \"OFFSET $3\" in suffix\n\n    def test_calculates_total_pages(self):\n        \"\"\"Total pages calculated correctly.\"\"\"\n        pagination = PaginationQueryBuilder(limit=20)\n        assert pagination.calculate_total_pages(100) == 5\n        assert pagination.calculate_total_pages(101) == 6\n        assert pagination.calculate_total_pages(0) == 0\n\n    def test_has_next_page(self):\n        \"\"\"Next page detection works.\"\"\"\n        pagination = PaginationQueryBuilder(page=2, limit=20)\n        assert pagination.has_next_page(60) is True\n        assert pagination.has_next_page(40) is False\n\n    def test_has_prev_page(self):\n        \"\"\"Previous page detection works.\"\"\"\n        assert PaginationQueryBuilder(page=1).has_prev_page() is False\n        assert PaginationQueryBuilder(page=2).has_prev_page() is True\n\n\nclass TestSoftDeleteQueryBuilder:\n    \"\"\"Tests for SoftDeleteQueryBuilder class.\"\"\"\n\n    def test_builds_soft_delete_query(self):\n        \"\"\"Soft delete query sets correct fields.\"\"\"\n        workspace_id = uuid4()\n        asset_id = uuid4()\n\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n        builder.add_id_condition(\"asset_id\", asset_id)\n\n        query, params = builder.build_soft_delete()\n\n        assert \"UPDATE assets\" in query\n        assert \"is_deleted = true\" in query\n        assert \"deleted_at = NOW()\" in query\n        assert \"is_deleted = false\" in query  # WHERE condition\n        assert workspace_id in params\n        assert asset_id in params\n\n    def test_builds_soft_delete_with_deleted_by(self):\n        \"\"\"Soft delete includes deleted_by when set.\"\"\"\n        workspace_id = uuid4()\n        user_id = uuid4()\n\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n        builder.set_deleted_by(user_id)\n\n        query, params = builder.build_soft_delete()\n\n        assert \"deleted_by = $1\" in query\n        assert user_id in params\n\n    def test_builds_restore_query(self):\n        \"\"\"Restore query clears delete fields.\"\"\"\n        workspace_id = uuid4()\n        asset_id = uuid4()\n\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n        builder.add_id_condition(\"asset_id\", asset_id)\n\n        query, params = builder.build_restore()\n\n        assert \"UPDATE assets\" in query\n        assert \"is_deleted = false\" in query\n        assert \"deleted_at = NULL\" in query\n        assert \"is_deleted = true\" in query  # WHERE condition\n\n    def test_builds_hard_delete_query(self):\n        \"\"\"Hard delete uses DELETE statement.\"\"\"\n        workspace_id = uuid4()\n\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n\n        query, _ = builder.build_hard_delete()\n\n        assert \"DELETE FROM assets\" in query\n\n    def test_bulk_ids_condition(self):\n        \"\"\"Bulk ID condition uses ANY syntax.\"\"\"\n        workspace_id = uuid4()\n        ids = [uuid4(), uuid4(), uuid4()]\n\n        builder = SoftDeleteQueryBuilder(\"assets\")\n        builder.set_workspace(workspace_id)\n        builder.add_ids_condition(\"asset_id\", ids)\n\n        query, params = builder.build_soft_delete()\n\n        assert \"= ANY($\" in query\n        assert ids in params\n\n    def test_filter_clauses(self):\n        \"\"\"Filter clause helpers return correct SQL.\"\"\"\n        builder = SoftDeleteQueryBuilder(\"assets\")\n\n        assert builder.build_filter_active() == \"is_deleted = false\"\n        assert \"is_deleted = true\" in builder.build_filter_deleted()\n        assert \"deleted_at IS NOT NULL\" in builder.build_filter_deleted()\n\n\nif __name__ == \"__main__\":\n    pytest.main([__file__, \"-v\"])\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\tests\\test_dsn.py",
  "content": "\"\"\"Tests for DSN (connection string) utilities.\"\"\"\n\nimport pytest\nimport sys\nfrom pathlib import Path\n\n# Add parent to path for imports\nsys.path.insert(0, str(Path(__file__).parent.parent))\n\nfrom dsn import normalize_database_url, build_pgbouncer_dsn\n\n\nclass TestNormalizeDatabaseUrl:\n    \"\"\"Tests for normalize_database_url function.\"\"\"\n\n    def test_converts_sqlalchemy_format(self):\n        \"\"\"SQLAlchemy format is converted to standard format.\"\"\"\n        url = \"postgresql+asyncpg://user:pass@localhost:5432/db\"\n        result = normalize_database_url(url)\n        assert result == \"postgresql://user:pass@localhost:5432/db\"\n\n    def test_preserves_standard_format(self):\n        \"\"\"Standard format is unchanged.\"\"\"\n        url = \"postgresql://user:pass@localhost:5432/db\"\n        result = normalize_database_url(url)\n        assert result == url\n\n    def test_preserves_query_params(self):\n        \"\"\"Query parameters are preserved.\"\"\"\n        url = \"postgresql+asyncpg://user:pass@localhost/db?sslmode=require\"\n        result = normalize_database_url(url)\n        assert \"sslmode=require\" in result\n\n\nclass TestBuildPgbouncerDsn:\n    \"\"\"Tests for build_pgbouncer_dsn function.\"\"\"\n\n    def test_returns_normalized_url_when_disabled(self):\n        \"\"\"Returns normalized URL when PgBouncer is disabled.\"\"\"\n        url = \"postgresql+asyncpg://user:pass@postgres:5432/db\"\n        result = build_pgbouncer_dsn(url, enabled=False)\n        assert result == \"postgresql://user:pass@postgres:5432/db\"\n\n    def test_replaces_host_and_port_when_enabled(self):\n        \"\"\"Host and port are replaced when PgBouncer is enabled.\"\"\"\n        url = \"postgresql://user:pass@postgres:5432/db\"\n        result = build_pgbouncer_dsn(\n            url,\n            pgbouncer_host=\"pgbouncer.local\",\n            pgbouncer_port=6432,\n            enabled=True,\n        )\n\n        assert \"pgbouncer.local:6432\" in result\n        assert \"postgres:5432\" not in result\n\n    def test_preserves_credentials(self):\n        \"\"\"Username and password are preserved.\"\"\"\n        url = \"postgresql://myuser:mypass@postgres:5432/db\"\n        result = build_pgbouncer_dsn(\n            url,\n            pgbouncer_host=\"pgbouncer\",\n            enabled=True,\n        )\n\n        assert \"myuser:mypass@\" in result\n\n    def test_preserves_database_name(self):\n        \"\"\"Database name is preserved.\"\"\"\n        url = \"postgresql://user:pass@postgres:5432/mydb\"\n        result = build_pgbouncer_dsn(\n            url,\n            pgbouncer_host=\"pgbouncer\",\n            enabled=True,\n        )\n\n        assert \"/mydb\" in result\n\n    def test_preserves_query_params(self):\n        \"\"\"Query parameters are preserved.\"\"\"\n        url = \"postgresql://user:pass@postgres:5432/db?sslmode=require\"\n        result = build_pgbouncer_dsn(\n            url,\n            pgbouncer_host=\"pgbouncer\",\n            enabled=True,\n        )\n\n        assert \"sslmode=require\" in result\n\n    def test_uses_default_host_and_port(self):\n        \"\"\"Uses default PgBouncer host and port if not specified.\"\"\"\n        url = \"postgresql://user:pass@postgres:5432/db\"\n        result = build_pgbouncer_dsn(url, enabled=True)\n\n        # Default is pgbouncer:6432\n        assert \"pgbouncer:6432\" in result\n\n    def test_handles_url_without_password(self):\n        \"\"\"Handles URLs with only username.\"\"\"\n        url = \"postgresql://myuser@postgres:5432/db\"\n        result = build_pgbouncer_dsn(\n            url,\n            pgbouncer_host=\"pgbouncer\",\n            enabled=True,\n        )\n\n        assert \"myuser@pgbouncer\" in result\n\n\nif __name__ == \"__main__\":\n    pytest.main([__file__, \"-v\"])\n"
}

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\\python\\tests\\test_retry.py",
  "content": "\"\"\"Tests for retry logic utilities.\"\"\"\n\nimport pytest\nimport asyncio\nfrom unittest.mock import AsyncMock, patch\nimport sys\nfrom pathlib import Path\n\n# Add parent to path for imports\nsys.path.insert(0, str(Path(__file__).parent.parent))\n\nfrom retry import (\n    RetryConfig,\n    with_retry,\n    RETRYABLE_EXCEPTIONS,\n)\n\n\nclass TestRetryConfig:\n    \"\"\"Tests for RetryConfig class.\"\"\"\n\n    def test_default_values(self):\n        \"\"\"Default values are set correctly.\"\"\"\n        config = RetryConfig()\n        assert config.max_attempts == 3\n        assert config.base_delay == 0.1\n        assert config.max_delay == 5.0\n        assert config.exponential_base == 2.0\n        assert config.jitter is True\n\n    def test_calculate_delay_exponential(self):\n        \"\"\"Delay increases exponentially without jitter.\"\"\"\n        config = RetryConfig(\n            base_delay=1.0,\n            exponential_base=2.0,\n            jitter=False,\n        )\n\n        assert config.calculate_delay(1) == 1.0  # 1 * 2^0\n        assert config.calculate_delay(2) == 2.0  # 1 * 2^1\n        assert config.calculate_delay(3) == 4.0  # 1 * 2^2\n\n    def test_calculate_delay_respects_max(self):\n        \"\"\"Delay is capped at max_delay.\"\"\"\n        config = RetryConfig(\n            base_delay=1.0,\n            max_delay=3.0,\n            exponential_base=2.0,\n            jitter=False,\n        )\n\n        assert config.calculate_delay(10) == 3.0  # Would be 512, but capped\n\n    def test_calculate_delay_adds_jitter(self):\n        \"\"\"Delay includes jitter when enabled.\"\"\"\n        config = RetryConfig(\n            base_delay=1.0,\n            exponential_base=1.0,  # No exponential growth\n            jitter=True,\n        )\n\n        # With jitter, delay should be between 1.0 and 1.5\n        delay = config.calculate_delay(1)\n        assert 1.0 <= delay <= 1.5\n\n\nclass TestWithRetryDecorator:\n    \"\"\"Tests for with_retry decorator.\"\"\"\n\n    @pytest.mark.asyncio\n    async def test_returns_result_on_success(self):\n        \"\"\"Returns result when function succeeds.\"\"\"\n        @with_retry()\n        async def success_func():\n            return \"success\"\n\n        result = await success_func()\n        assert result == \"success\"\n\n    @pytest.mark.asyncio\n    async def test_retries_on_retryable_exception(self):\n        \"\"\"Retries when retryable exception is raised.\"\"\"\n        call_count = 0\n\n        @with_retry(RetryConfig(max_attempts=3, base_delay=0.01))\n        async def flaky_func():\n            nonlocal call_count\n            call_count += 1\n            if call_count < 3:\n                # Simulate a retryable error\n                raise Exception(\"Simulated error\")\n            return \"success\"\n\n        # Mock the retryable exceptions to include our Exception\n        config = RetryConfig(\n            max_attempts=3,\n            base_delay=0.01,\n            retryable_exceptions=(Exception,),\n        )\n\n        call_count = 0\n\n        @with_retry(config)\n        async def flaky_func2():\n            nonlocal call_count\n            call_count += 1\n            if call_count < 3:\n                raise Exception(\"Simulated error\")\n            return \"success\"\n\n        result = await flaky_func2()\n        assert result == \"success\"\n        assert call_count == 3\n\n    @pytest.mark.asyncio\n    async def test_raises_after_max_attempts(self):\n        \"\"\"Raises exception after max attempts exhausted.\"\"\"\n        config = RetryConfig(\n            max_attempts=3,\n            base_delay=0.01,\n            retryable_exceptions=(ValueError,),\n        )\n\n        @with_retry(config)\n        async def always_fails():\n            raise ValueError(\"Always fails\")\n\n        with pytest.raises(ValueError, match=\"Always fails\"):\n            await always_fails()\n\n    @pytest.mark.asyncio\n    async def test_does_not_retry_non_retryable_exception(self):\n        \"\"\"Does not retry non-retryable exceptions.\"\"\"\n        call_count = 0\n        config = RetryConfig(\n            max_attempts=3,\n            base_delay=0.01,\n            retryable_exceptions=(ValueError,),  # Only retry ValueError\n        )\n\n        @with_retry(config)\n        async def raises_type_error():\n            nonlocal call_count\n            call_count += 1\n            raise TypeError(\"Not retryable\")\n\n        with pytest.raises(TypeError):\n            await raises_type_error()\n\n        # Should only be called once (no retries)\n        assert call_count == 1\n\n\nclass TestRetryableExceptions:\n    \"\"\"Tests for default retryable exceptions.\"\"\"\n\n    def test_includes_common_database_errors(self):\n        \"\"\"Includes common transient database errors.\"\"\"\n        import asyncpg\n\n        # These should all be in the default retryable exceptions\n        assert asyncpg.DeadlockDetectedError in RETRYABLE_EXCEPTIONS\n        assert asyncpg.SerializationError in RETRYABLE_EXCEPTIONS\n        assert asyncpg.TooManyConnectionsError in RETRYABLE_EXCEPTIONS\n\n\nif __name__ == \"__main__\":\n    pytest.main([__file__, \"-v\"])\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore codebase for repeated SQL patterns",
      "status": "completed",
      "activeForm": "Exploring codebase for repeated SQL patterns"
    },
    {
      "content": "Plan shared database-utils package structure",
      "status": "completed",
      "activeForm": "Planning shared database-utils package structure"
    },
    {
      "content": "Create @rawdrive/database-utils package structure",
      "status": "completed",
      "activeForm": "Creating @rawdrive/database-utils package structure"
    },
    {
      "content": "Implement LIKE pattern escaping utility",
      "status": "completed",
      "activeForm": "Implementing LIKE pattern escaping utility"
    },
    {
      "content": "Implement connection pooling utilities",
      "status": "completed",
      "activeForm": "Implementing connection pooling utilities"
    },
    {
      "content": "Implement transaction context managers",
      "status": "completed",
      "activeForm": "Implementing transaction context managers"
    },
    {
      "content": "Implement pagination query builders",
      "status": "completed",
      "activeForm": "Implementing pagination query builders"
    },
    {
      "content": "Implement soft delete queries",
      "status": "completed",
      "activeForm": "Implementing soft delete queries"
    },
    {
      "content": "Implement workspace isolation utilities",
      "status": "completed",
      "activeForm": "Implementing workspace isolation utilities"
    },
    {
      "content": "Implement retry logic utilities",
      "status": "completed",
      "activeForm": "Implementing retry logic utilities"
    },
    {
      "content": "Create README documentation",
      "status": "completed",
      "activeForm": "Creating README documentation"
    },
    {
      "content": "Update gallery-service to use shared package",
      "status": "completed",
      "activeForm": "Updating gallery-service to use shared package"
    },
    {
      "content": "Update backend client_tag_service to use shared package",
      "status": "completed",
      "activeForm": "Updating backend client_tag_service to use shared package"
    },
    {
      "content": "Add unit tests for database-utils",
      "status": "completed",
      "activeForm": "Adding unit tests for database-utils"
    }
  ]
}

Let me verify the package structure and ensure everything is in order:

🔧 Tool: Bash
Input: {
  "command": "cd \"C:\\Users\\admin\\Desktop\\RawDrive2\\packages\\database-utils\" && find . -type f -name \"*.py\" -o -name \"*.ts\" -o -name \"*.json\" 2>/dev/null | head -30",
  "description": "List all package files"
}

🔧 Tool: Glob
Input: {
  "pattern": "packages/database-utils/**/*"
}

The package is complete. Let me provide a summary of the implementation:

<summary>
## Summary: Extract repeated SQL patterns into @rawdrive/database-utils

### Changes Implemented

1. **Created new shared package `@rawdrive/database-utils`** with both TypeScript and Python modules:
   - TypeScript types and constants for database configuration
   - Python utilities for database operations

2. **Implemented core utilities:**
   - **LIKE pattern escaping** (`escape_like_pattern`, `build_like_clause`) - Prevents SQL injection in LIKE queries
   - **Connection pooling** (`DatabasePool`, `PoolConfig`, `PoolStats`) - Unified asyncpg pool management with PgBouncer support
   - **DSN utilities** (`build_pgbouncer_dsn`, `normalize_database_url`) - Transforms database URLs for PgBouncer routing
   - **Transaction context managers** (`get_transaction`, `readonly_transaction`, `serializable_transaction`, `savepoint`)
   - **Workspace isolation** (`WorkspaceQueryBuilder`) - Enforces multi-tenant security in all queries
   - **Pagination helpers** (`PaginationQueryBuilder`) - Consistent LIMIT/OFFSET pagination
   - **Soft delete patterns** (`SoftDeleteQueryBuilder`) - Standard soft delete/restore queries
   - **Retry logic** (`with_retry`, `RetryConfig`, `execute_with_retry`, `fetch_with_retry`) - Automatic retry with exponential backoff for transient failures

3. **Updated services to use shared package:**
   - `services/gallery-service/src/database.py` - Now uses `DatabasePool` from shared package
   - `backend/src/app/services/client_tag_service.py` - Now imports `escape_like_pattern` from shared package

4. **Added comprehensive unit tests:**
   - `test_query_builders.py` - Tests for query builder utilities
   - `test_dsn.py` - Tests for DSN transformation utilities  
   - `test_retry.py` - Tests for retry logic

### Files Modified
- `services/gallery-service/src/database.py` - Migrated to use shared package
- `backend/src/app/services/client_tag_service.py` - Replaced local `escape_like_pattern` with shared import

### Files Created
- `packages/database-utils/package.json`
- `packages/database-utils/tsconfig.json`
- `packages/database-utils/README.md`
- `packages/database-utils/src/index.ts`
- `packages/database-utils/src/types.ts`
- `packages/database-utils/src/constants.ts`
- `packages/database-utils/python/__init__.py`
- `packages/database-utils/python/constants.py`
- `packages/database-utils/python/dsn.py`
- `packages/database-utils/python/pool.py`
- `packages/database-utils/python/query_builders.py`
- `packages/database-utils/python/retry.py`
- `packages/database-utils/python/tests/__init__.py`
- `packages/database-utils/python/tests/test_query_builders.py`
- `packages/database-utils/python/tests/test_dsn.py`
- `packages/database-utils/python/tests/test_retry.py`

### Notes for Developer

1. **Migration path**: Other services (billing-service, client-service, invitations-service, webhooks-service, onboarding-service) can be migrated similarly to gallery-service. Each service should:
   - Add database-utils to PYTHONPATH (handled in Docker compose or deployment)
   - Import from `database_utils` instead of local implementations
   - Keep the same API surface for backward compatibility

2. **PgBouncer compatibility**: The shared pool utilities automatically handle statement cache disabling when PgBouncer is enabled.

3. **Workspace isolation**: The `WorkspaceQueryBuilder` class ensures all queries include `workspace_id` filtering by default, preventing cross-tenant data leakage.

4. **PYTHONPATH configuration**: For production, add to service Docker configurations:
   ```
   PYTHONPATH=/app/packages/database-utils/python:$PYTHONPATH
   ```

5. **Eliminated duplication**: This package eliminates ~80+ lines of duplicated code across 10+ services for:
   - PgBouncer DSN building (identical in 6 services)
   - Connection pool initialization (identical in 6 services)
   - LIKE pattern escaping (scattered across services)
</summary>