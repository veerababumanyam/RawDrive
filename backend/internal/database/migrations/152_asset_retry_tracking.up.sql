-- Migration 152: asset retry/failure state-machine tracking.
--
-- Foundation for the server-side HEIC/RAW decode pipeline. The ThumbnailWorker
-- decodes uploads out-of-process and classifies decode failures as transient
-- (retryable infra/resource hiccup) vs terminal (poison bytes — re-decoding is
-- pointless). To drive that state machine the worker needs to (a) count how many
-- times it has retried an asset, (b) know when an asset is next eligible for
-- retry (exponential backoff), and (c) record the server-sniffed format token it
-- decoded against for diagnostics. Additive + idempotent; assets.status stays
-- plain TEXT, so the terminal 'failed' value needs no enum migration.
--
-- Numbered 152: 151 (storage b2 platform settings) is the current max committed;
-- 152 is the next free number.

BEGIN;

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS decode_format TEXT;

-- Partial index keyed on next_retry_at, scoped to the rows the worker actually
-- polls for retry (status='processing', not soft-deleted). Keeps the
-- "due-for-retry" scan an index range read instead of a full table scan + sort
-- on every poll tick.
CREATE INDEX IF NOT EXISTS idx_assets_retryable ON assets(next_retry_at)
    WHERE status='processing' AND deleted_at IS NULL;

COMMIT;
