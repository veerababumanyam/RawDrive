-- M16 E49-S1: Workspace-level upload policy mode
-- Controls how strict the Tier D enforcement is for a given workspace.
-- Reference: _cobolt-output/latest/planning/feature-architecture-delta.md §6.3

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS upload_policy_mode TEXT NOT NULL
        DEFAULT 'standard';

-- Backfill: existing workspaces stay on 'standard' unless an admin changes them.
-- Note: we do NOT add a CHECK constraint — the service layer validates the allowed set
-- ('standard', 'strict_client_scan', 'strict_original_preservation') so we can add
-- new modes without a migration. Consistent with the pattern used in 052_m15_enterprise_hardening.

CREATE INDEX IF NOT EXISTS idx_workspaces_upload_policy_mode
    ON workspaces (upload_policy_mode)
    WHERE upload_policy_mode <> 'standard';
