# Data Model: Per-User Gemini LLM Settings

**Feature**: 003-user-gemini-settings
**Date**: 2025-12-27
**Status**: Complete

## Entity Relationship Diagram

```
┌─────────────────────────────────────┐
│            users                     │
│  (existing table)                    │
│─────────────────────────────────────│
│  user_id: UUID PK                    │
│  workspace_id: UUID FK               │
│  ...                                 │
└─────────────────┬───────────────────┘
                  │ 1:1
                  ▼
┌─────────────────────────────────────┐
│      user_gemini_settings           │
│─────────────────────────────────────│
│  user_id: UUID PK FK                │
│  api_key_encrypted: BYTEA           │
│  api_key_prefix: VARCHAR(10)        │
│  api_key_suffix: VARCHAR(10)        │
│  selected_model_id: UUID FK ────────┼──┐
│  status: VARCHAR(20)                │  │
│  last_validated_at: TIMESTAMPTZ     │  │
│  validation_error: TEXT             │  │
│  created_at: TIMESTAMPTZ            │  │
│  updated_at: TIMESTAMPTZ            │  │
└─────────────────────────────────────┘  │
                                         │ N:1
                                         ▼
┌─────────────────────────────────────┐
│          gemini_models              │
│─────────────────────────────────────│
│  model_id: UUID PK                  │
│  identifier: VARCHAR(100) UNIQUE    │
│  display_name: VARCHAR(200)         │
│  description: TEXT                  │
│  sort_order: INTEGER                │
│  is_active: BOOLEAN                 │
│  is_default: BOOLEAN                │
│  created_at: TIMESTAMPTZ            │
│  updated_at: TIMESTAMPTZ            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         ai_usage_logs               │
│─────────────────────────────────────│
│  log_id: UUID PK                    │
│  user_id: UUID FK                   │
│  workspace_id: UUID FK              │
│  model_identifier: VARCHAR(100)     │
│  feature_type: VARCHAR(50)          │
│  success: BOOLEAN                   │
│  error_code: VARCHAR(50)            │
│  created_at: TIMESTAMPTZ            │
└─────────────────────────────────────┘
```

## Entity Definitions

### 1. user_gemini_settings

Stores per-user Gemini API configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | PK, FK → users(user_id), ON DELETE CASCADE | Links to user; 1:1 relationship |
| `api_key_encrypted` | BYTEA | NULLABLE | AES-256-GCM encrypted API key |
| `api_key_prefix` | VARCHAR(10) | NULLABLE | First 4 chars of original key (for display) |
| `api_key_suffix` | VARCHAR(10) | NULLABLE | Last 4 chars of original key (for display) |
| `selected_model_id` | UUID | FK → gemini_models(model_id), NULLABLE | User's selected model; NULL = use platform default |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'not_configured' | One of: 'not_configured', 'connected', 'validation_failed' |
| `last_validated_at` | TIMESTAMPTZ | NULLABLE | Timestamp of last successful validation |
| `validation_error` | TEXT | NULLABLE | Last validation error message (for troubleshooting) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_user_gemini_settings_status` ON `status` (for admin dashboard queries)

**Validation Rules**:
- `status` must be one of: 'not_configured', 'connected', 'validation_failed'
- If `api_key_encrypted` is NOT NULL, `api_key_prefix` and `api_key_suffix` must also be NOT NULL
- If `status` = 'connected', `last_validated_at` must be NOT NULL

---

### 2. gemini_models

Admin-managed catalogue of available Gemini models.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `model_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique model identifier |
| `identifier` | VARCHAR(100) | UNIQUE, NOT NULL | Google's model identifier (e.g., 'gemini-2.5-flash') |
| `display_name` | VARCHAR(200) | NOT NULL | User-facing name (e.g., 'Gemini 2.5 Flash') |
| `description` | TEXT | NULLABLE | Optional description for admin reference |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | Order in dropdown (lower = higher priority) |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | Whether model appears in user dropdowns |
| `is_default` | BOOLEAN | NOT NULL, DEFAULT FALSE | Platform default when user has no selection |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes**:
- `idx_gemini_models_active_order` ON `is_active`, `sort_order` (for dropdown queries)
- `idx_gemini_models_identifier` ON `identifier` (for lookups)

**Validation Rules**:
- Exactly one row must have `is_default = TRUE` at any time
- Cannot set `is_active = FALSE` if `is_default = TRUE`
- Cannot delete the last active model
- `identifier` must match Google's model naming convention

**Constraints**:
```sql
-- Ensure exactly one default model
CREATE UNIQUE INDEX idx_gemini_models_single_default
ON gemini_models (is_default) WHERE is_default = TRUE;

-- Prevent deactivating default model
ALTER TABLE gemini_models ADD CONSTRAINT chk_default_must_be_active
CHECK (NOT (is_default = TRUE AND is_active = FALSE));
```

---

### 3. ai_usage_logs

Tracks AI feature usage per user for admin visibility.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `log_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique log entry identifier |
| `user_id` | UUID | FK → users(user_id), NOT NULL | User who made the AI call |
| `workspace_id` | UUID | FK → workspaces(workspace_id), NOT NULL | Workspace context |
| `model_identifier` | VARCHAR(100) | NOT NULL | Model used for this call |
| `feature_type` | VARCHAR(50) | NOT NULL | Feature that made the call (e.g., 'smart_curation', 'captioning') |
| `success` | BOOLEAN | NOT NULL | Whether the call succeeded |
| `error_code` | VARCHAR(50) | NULLABLE | Error code if failed |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the call was made |

**Indexes**:
- `idx_ai_usage_user_created` ON `user_id`, `created_at DESC` (for per-user history)
- `idx_ai_usage_workspace_created` ON `workspace_id`, `created_at DESC` (for admin dashboard)

**Note**: No sensitive data (API keys, prompts, responses) stored in this table.

---

## State Transitions

### user_gemini_settings.status

```
┌──────────────────┐
│  not_configured  │ ◄─────────────────────────────────┐
└────────┬─────────┘                                   │
         │ User adds API key                           │
         │ (validation succeeds)                       │
         ▼                                             │
┌──────────────────┐                                   │
│    connected     │ ◄────────────┐                    │
└────────┬─────────┘              │                    │
         │ Validation fails       │ Re-validation      │ User revokes key
         │ (key expired/revoked)  │ succeeds           │
         ▼                        │                    │
┌──────────────────┐              │                    │
│ validation_failed│ ─────────────┘                    │
└────────┬─────────┘                                   │
         │ User revokes key                            │
         └─────────────────────────────────────────────┘
```

**Transitions**:
| From | To | Trigger |
|------|-----|---------|
| not_configured | connected | User adds key + validation succeeds |
| not_configured | validation_failed | User adds key + validation fails |
| connected | validation_failed | Runtime validation fails (key expired) |
| connected | not_configured | User revokes key |
| validation_failed | connected | User updates key + validation succeeds |
| validation_failed | not_configured | User revokes key |

---

## Seed Data

### gemini_models (Initial Catalogue)

```sql
INSERT INTO gemini_models (model_id, identifier, display_name, sort_order, is_active, is_default) VALUES
  (gen_random_uuid(), 'gemini-2.5-flash', 'Gemini 2.5 Flash', 1, TRUE, TRUE),
  (gen_random_uuid(), 'gemini-2.5-pro', 'Gemini 2.5 Pro', 2, TRUE, FALSE),
  (gen_random_uuid(), 'gemini-1.5-flash', 'Gemini 1.5 Flash', 3, TRUE, FALSE),
  (gen_random_uuid(), 'gemini-1.5-pro', 'Gemini 1.5 Pro', 4, TRUE, FALSE);
```

**Note**: Gemini 3 models (Pro Preview, Flash Preview) will be added by admin when available. The seed data includes stable, generally-available models.

---

## Migration Script (0038_gemini_settings.py)

```python
"""Gemini settings schema for per-user API key management.

Revision ID: 0038
Revises: 0037
Create Date: 2025-12-27
"""

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create gemini_models catalogue table
    op.execute("""
        CREATE TABLE IF NOT EXISTS gemini_models (
            model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            identifier VARCHAR(100) NOT NULL UNIQUE,
            display_name VARCHAR(200) NOT NULL,
            description TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT chk_default_must_be_active
            CHECK (NOT (is_default = TRUE AND is_active = FALSE))
        );

        -- Ensure exactly one default model
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_models_single_default
        ON gemini_models (is_default) WHERE is_default = TRUE;

        CREATE INDEX IF NOT EXISTS idx_gemini_models_active_order
        ON gemini_models (is_active, sort_order);
    """)

    # 2. Seed initial models
    op.execute("""
        INSERT INTO gemini_models (identifier, display_name, sort_order, is_active, is_default) VALUES
          ('gemini-2.5-flash', 'Gemini 2.5 Flash', 1, TRUE, TRUE),
          ('gemini-2.5-pro', 'Gemini 2.5 Pro', 2, TRUE, FALSE),
          ('gemini-1.5-flash', 'Gemini 1.5 Flash', 3, TRUE, FALSE),
          ('gemini-1.5-pro', 'Gemini 1.5 Pro', 4, TRUE, FALSE)
        ON CONFLICT (identifier) DO NOTHING;
    """)

    # 3. Create user_gemini_settings table
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_gemini_settings (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            api_key_encrypted BYTEA,
            api_key_prefix VARCHAR(10),
            api_key_suffix VARCHAR(10),
            selected_model_id UUID REFERENCES gemini_models(model_id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'not_configured',
            last_validated_at TIMESTAMPTZ,
            validation_error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT chk_status_values
            CHECK (status IN ('not_configured', 'connected', 'validation_failed')),

            CONSTRAINT chk_key_parts_consistency
            CHECK (
                (api_key_encrypted IS NULL AND api_key_prefix IS NULL AND api_key_suffix IS NULL) OR
                (api_key_encrypted IS NOT NULL AND api_key_prefix IS NOT NULL AND api_key_suffix IS NOT NULL)
            )
        );

        CREATE INDEX IF NOT EXISTS idx_user_gemini_settings_status ON user_gemini_settings (status);
    """)

    # 4. Create ai_usage_logs table
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            model_identifier VARCHAR(100) NOT NULL,
            feature_type VARCHAR(50) NOT NULL,
            success BOOLEAN NOT NULL,
            error_code VARCHAR(50),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
        ON ai_usage_logs (user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_created
        ON ai_usage_logs (workspace_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_usage_logs")
    op.execute("DROP TABLE IF EXISTS user_gemini_settings")
    op.execute("DROP TABLE IF EXISTS gemini_models")
```
