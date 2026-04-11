-- F-013 (M17 wave 4): persistent TUS upload session state.
--
-- Before this migration, chunked upload state lived in a process-local
-- sync.Map on ChunkedUploadHandler, so every API container restart
-- silently orphaned every in-flight upload and the client had to retry
-- from byte 0. The audit (F-013) flags this as a correctness + durability
-- gap: spec-compliant TUS must survive restarts and multi-instance
-- deployment.
--
-- This table holds:
--   - TUS upload_id (client-facing opaque token)
--   - R2 multipart upload ID (for direct-to-R2 streaming, solves F-008 Part B)
--   - part etags (jsonb array, preserving order for CompleteMultipartUpload)
--   - offset + total_size for resumption
--   - expiry for GC
--   - scan manifest (optional, M16 Tier D)
--
-- Decision packet §3.2 authoritative source:
--   docs/superpowers/plans/2026-04-11-m17-decision-packet.md

CREATE TABLE upload_sessions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id                     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tus_upload_id               text NOT NULL UNIQUE,          -- client-facing TUS ID
  filename                    text NOT NULL,
  content_type                text NOT NULL,
  total_size                  bigint NOT NULL CHECK (total_size > 0),
  upload_offset               bigint NOT NULL DEFAULT 0 CHECK (upload_offset >= 0),
  chunk_size                  bigint NOT NULL,
  r2_multipart_upload_id      text,                           -- R2 CreateMultipartUpload result
  r2_part_etags               jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at                  timestamptz NOT NULL,           -- for GC sweeper
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  completed_at                timestamptz,                    -- non-null once finalized
  scan_manifest               jsonb,                          -- M16 E47-S5 Tier D, optional
  scan_manifest_verified_at   timestamptz
);

CREATE INDEX idx_upload_sessions_workspace ON upload_sessions(workspace_id);
CREATE INDEX idx_upload_sessions_user ON upload_sessions(user_id);
CREATE INDEX idx_upload_sessions_expires
  ON upload_sessions(expires_at)
  WHERE completed_at IS NULL;

-- F-009-style RLS: workspace isolation enforced at the DB layer using the
-- same parameterized set_config pattern wave 3 hardened. Reads/writes
-- from anything other than a caller with app.workspace_id set to the
-- row's workspace_id return zero rows.
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY upload_sessions_workspace_isolation ON upload_sessions
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
