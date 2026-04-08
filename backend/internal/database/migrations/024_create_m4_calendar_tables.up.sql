-- M4: Calendar & Scheduling — events

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'shoot',
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    location TEXT,
    contact_id UUID REFERENCES contacts(id),
    deal_id UUID REFERENCES deals(id),
    status TEXT NOT NULL DEFAULT 'confirmed',
    recurrence_rule TEXT,
    buffer_before_min INTEGER NOT NULL DEFAULT 0,
    buffer_after_min INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT events_type_check CHECK (event_type IN ('shoot', 'meeting', 'editing', 'personal', 'travel', 'blocked', 'other')),
    CONSTRAINT events_status_check CHECK (status IN ('tentative', 'confirmed', 'cancelled', 'completed')),
    CONSTRAINT events_end_after_start CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_events_workspace_id ON events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_events_workspace_range ON events(workspace_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_events_contact_id ON events(contact_id);
CREATE INDEX IF NOT EXISTS idx_events_deal_id ON events(deal_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_workspace_isolation ON events;
CREATE POLICY events_workspace_isolation ON events
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );
