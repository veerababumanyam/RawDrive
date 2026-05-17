-- M41 / 105 — Anonymous client-side favorites for the public gallery viewer.
--
-- Separate from proofing_selections by design:
--   - proofing_selections requires (client_name, client_email) and represents
--     a formal "I want this delivered/printed" decision; the public POST
--     endpoint is append-only and selection-limit-enforced.
--   - gallery_favorites is anonymous (keyed on an opaque guest_session_id
--     stored in the visitor's localStorage), toggleable (POST creates,
--     DELETE removes), and has no limit. It's the lightweight "heart this
--     photo while browsing" affordance the lightbox Star button writes to.
--
-- The two systems intentionally do NOT share storage. A future "convert my
-- favorites to a proofing submission" CTA (see RCA carry-forward) will
-- bridge them by reading gallery_favorites for the session and POSTing to
-- the existing /public/galleries/{slug}/proof endpoint — that bridge is
-- the only point where the two concepts merge.
--
-- guest_session_id is a TEXT (not UUID typed) so the frontend can store
-- any opaque identifier — today it's a crypto.randomUUID() string in
-- localStorage, but a future authenticated-recipient flow could populate
-- it with a session token without a schema change.

CREATE TABLE IF NOT EXISTS gallery_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    guest_session_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gallery_favorites_unique UNIQUE (gallery_id, asset_id, guest_session_id)
);

-- Index for "list this gallery's favorites" (owner dashboard aggregations)
-- and the lightweight per-asset count query.
CREATE INDEX IF NOT EXISTS idx_gallery_favorites_gallery
    ON gallery_favorites(gallery_id);

-- Index for "hydrate this guest's favorites on share-link load" — the
-- frontend reads (gallery_id, guest_session_id) on mount to repaint the
-- Star button state.
CREATE INDEX IF NOT EXISTS idx_gallery_favorites_session
    ON gallery_favorites(gallery_id, guest_session_id);
