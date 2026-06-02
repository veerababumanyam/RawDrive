-- Migration 143: branded client email automation
-- Adds a per-gallery toggle for the automated client email drip plus an
-- idempotent send ledger. Publishing a gallery enqueues "ready" (now),
-- "reminder" (+7d) and, when an expiry is set, "last_chance" (expires_at-3d)
-- rows; a polling worker sends the due ones via the branded template and marks
-- them sent. The dedupe unique index guarantees the worker never double-sends.

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS email_automation_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN galleries.email_automation_enabled IS
  'When true, publishing the gallery enqueues the branded client email drip (ready / reminder / last-chance). Photographer can disable per gallery.';

CREATE TABLE IF NOT EXISTS gallery_email_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id    UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    recipient     TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at       TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'pending',
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gallery_email_events_event_type_chk
      CHECK (event_type IN ('ready', 'reminder', 'last_chance')),
    CONSTRAINT gallery_email_events_status_chk
      CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
);

COMMENT ON TABLE gallery_email_events IS
  'Idempotent ledger of automated branded client emails for a gallery. One row per (gallery, event_type, recipient).';

-- Backs the polling worker''s "what is due" scan: pending events whose time has come.
CREATE INDEX IF NOT EXISTS idx_gallery_email_events_due
  ON gallery_email_events (scheduled_for)
  WHERE sent_at IS NULL AND status = 'pending';

-- Idempotency: a given gallery never enqueues the same event for the same
-- recipient twice, so re-publishing or a worker retry cannot double-send.
CREATE UNIQUE INDEX IF NOT EXISTS idx_gallery_email_events_dedupe
  ON gallery_email_events (gallery_id, event_type, recipient);
