-- Reserve original upload bytes while TUS sessions are in flight so concurrent
-- sessions cannot collectively overrun workspace quota before finalize.

ALTER TABLE workspace_storage
    ADD COLUMN IF NOT EXISTS reserved_bytes BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_workspace_storage_reserved
    ON workspace_storage (reserved_bytes)
    WHERE reserved_bytes > 0;
