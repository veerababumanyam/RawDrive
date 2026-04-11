# RawDrive Database Schema

This directory documents the live Postgres schema produced by the 142 migrations under `backend/internal/database/migrations/`.

ISSUE-005 (brownfield P1) closure: the repository previously had zero ERD or schema reference — understanding the shape of the database required reading every migration in order. This document and the accompanying `schema.sql` dump are the canonical reference.

## Files

| File | Content | When to regenerate |
|---|---|---|
| `schema.sql` | Full `pg_dump --schema-only` snapshot of the live development database | After every migration that lands on `main` — regenerate via `scripts/refresh-schema.sh` |
| `README.md` (this file) | Core-entity ERD and refresh instructions | When new top-level entities or relationships are introduced |

`schema.sql` is authoritative for column-level detail (types, constraints, indexes, defaults). The ERD below is a high-level map of the domain and intentionally omits supporting tables (analytics, metrics, audit, ephemeral sessions) so the diagram stays readable.

## Refreshing the schema dump

The dev compose stack must be running (`docker compose up -d`). From the repo root:

```bash
./scripts/refresh-schema.sh
```

This runs `pg_dump --schema-only --no-owner --no-privileges` inside the `postgres` container and writes the result to `docs/db/schema.sql`. Commit the regenerated file as part of the PR that lands the migration.

## Core entity ERD (17 tables)

The diagram covers the top-level identity, workspace, gallery, asset, and album entities plus the M17 MFA tables. All 104 tables in the schema are documented in full in `schema.sql`.

```mermaid
erDiagram
    users ||--o{ user_profiles : "has"
    users ||--o{ user_auth_methods : "has"
    users ||--o{ user_mfa_enrollments : "enrolls"
    users ||--o{ user_mfa_recovery_codes : "issues"
    users ||--o{ workspace_members : "joins"
    users ||--o{ workspaces : "owns"
    users ||--o{ galleries : "creates"
    users ||--o{ assets : "uploads"
    users ||--o{ platform_settings : "updates"

    workspaces ||--o{ workspace_members : "has"
    workspaces ||--|| workspace_storage : "has"
    workspaces ||--o{ galleries : "contains"
    workspaces ||--o{ assets : "owns"
    workspaces ||--o{ audit_logs : "emits"

    galleries ||--o{ gallery_assets : "links"
    galleries ||--o{ albums : "contains"
    albums ||--o{ albums : "nests"
    albums ||--o{ album_assets : "links"
    albums }o--|| assets : "cover"

    assets ||--o{ gallery_assets : "appears_in"
    assets ||--o{ album_assets : "appears_in"
    assets ||--o{ asset_derivatives : "has"

    users {
        uuid id PK
        text email UK
        text password_hash
        bool email_verified
        timestamptz mfa_grace_until
    }
    workspaces {
        uuid id PK
        uuid owner_id FK
        text name
        text plan
        text status
    }
    workspace_members {
        uuid workspace_id PK,FK
        uuid user_id PK,FK
        uuid role_id FK
    }
    workspace_storage {
        uuid workspace_id PK,FK
        bigint used_bytes
        bigint quota_bytes
    }
    galleries {
        uuid id PK
        uuid workspace_id FK
        uuid created_by FK
        text slug UK
        text visibility
    }
    gallery_assets {
        uuid gallery_id PK,FK
        uuid asset_id PK,FK
        int sort_order
    }
    assets {
        uuid id PK
        uuid workspace_id FK
        uuid uploaded_by FK
        text filename
        text storage_key
        bigint size_bytes
        text status
    }
    asset_derivatives {
        uuid id PK
        uuid asset_id FK
        text kind
        text storage_key
    }
    albums {
        uuid id PK
        uuid gallery_id FK
        uuid parent_id FK
        uuid cover_asset_id FK
    }
    album_assets {
        uuid album_id PK,FK
        uuid asset_id PK,FK
    }
    user_profiles {
        uuid user_id PK,FK
        text display_name
        text avatar_url
    }
    user_auth_methods {
        uuid id PK
        uuid user_id FK
        text provider
    }
    user_mfa_enrollments {
        uuid id PK
        uuid user_id FK
        bytea encrypted_secret
        bool verified_at
    }
    user_mfa_recovery_codes {
        uuid id PK
        uuid user_id FK
        text code_hash
        timestamptz used_at
    }
    platform_settings {
        text category PK
        text key PK
        jsonb value
        bytea encrypted_value
        uuid updated_by FK
    }
    audit_logs {
        uuid id PK
        uuid workspace_id FK
        text action
        jsonb metadata
    }
```

## Notable schema facts

- **Multi-tenant key:** nearly every user-facing table carries `workspace_id` with a FK to `workspaces.id`. `BulkMoveToGallery` in `asset_repo.go` illustrates the correct enforcement pattern (ISSUE-007 fix).
- **Soft-delete:** tables with `deleted_at timestamptz` are soft-deleted. Repository queries must filter `deleted_at IS NULL`.
- **RLS:** row-level security is expected to be enforced via the tenant middleware that calls `SET app.workspace_id = ...` per-request. See `backend/internal/middleware/tenant.go`.
- **Encryption at rest (F-005):** `platform_settings.encrypted_value` and `user_mfa_enrollments.encrypted_secret` are envelope-encrypted with the `PLATFORM_SETTINGS_KEK`.
- **Migrations are forward-only in CI** but each migration ships a paired `.down.sql` for emergency local rollback.
- **Vector search:** `pgvector` is enabled. Tables like `quality_scores` and embedding caches store `vector(n)` columns.

## Why no full 104-table ERD?

A single mermaid ERD covering all 104 tables would be unreadable (mermaid starts to overflow around 30 tables and becomes unusable past 50). The authoritative column-level reference is `schema.sql`. If you need a full visual graph, regenerate from `schema.sql` with a dedicated tool — SchemaSpy, [dbdiagram.io](https://dbdiagram.io), or `pg_dump | dbml` pipelines all handle the full table set better than mermaid.
