-- F-006 Part B (audit 2026-04-10): persist refresh session state so
-- sessions survive service restarts. Before this migration the JWT
-- service kept refreshTokens / userSessions / families maps in process
-- memory only, so every API container restart invalidated every active
-- refresh session and forced every user to re-authenticate.
--
-- The application layer now goes through auth.RefreshSessionStore —
-- see backend/internal/auth/refresh_session_store.go for the interface
-- and backend/internal/repository/refresh_session_repo.go for the
-- DB-backed implementation.
--
-- Tokens are stored as their hex SHA-256 hash, never raw. An attacker
-- with DB read access gets hashes they still have to reverse.
--
-- Not workspace-scoped: refresh sessions are keyed by user, and the
-- workspace context is copied into the row so rotated tokens can
-- reissue access tokens with the same claims without a fresh DB join.

CREATE TABLE IF NOT EXISTS refresh_sessions (
    token_hash       TEXT PRIMARY KEY,
    sub              TEXT        NOT NULL,
    family_id        TEXT        NOT NULL,
    workspace_id     TEXT        NOT NULL DEFAULT '',
    role             TEXT        NOT NULL DEFAULT '',
    platform_role    TEXT        NOT NULL DEFAULT '',
    state_id         TEXT        NOT NULL DEFAULT '',
    expires_at       TIMESTAMPTZ NOT NULL,
    revoked          BOOLEAN     NOT NULL DEFAULT FALSE,
    used             BOOLEAN     NOT NULL DEFAULT FALSE,
    family_revoked   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup by user_id for the session-limit check and administrative
-- "show me all sessions for this user" queries.
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_sub
    ON refresh_sessions (sub)
    WHERE revoked = FALSE AND family_revoked = FALSE;

-- Lookup by family_id for revoke-cascade writes and reuse detection.
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_family
    ON refresh_sessions (family_id);

-- Optional cleanup sweeper index — lets a periodic job DELETE rows
-- whose expires_at < now() without full-table scans.
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires
    ON refresh_sessions (expires_at)
    WHERE revoked = FALSE AND family_revoked = FALSE;
