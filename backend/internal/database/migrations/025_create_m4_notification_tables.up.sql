-- M4: Notifications — notifications, notification_preferences

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    action_url TEXT,
    metadata JSONB DEFAULT '{}',
    channel TEXT NOT NULL DEFAULT 'in_app',
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_channel_check CHECK (channel IN ('in_app', 'email', 'whatsapp', 'push'))
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX idx_notifications_user_id ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_workspace_id ON notifications(workspace_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_owner ON notifications
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR user_id::text = current_setting('app.user_id', true)
    );

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
    digest_mode TEXT NOT NULL DEFAULT 'none',
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_prefs_user_category_unique UNIQUE (user_id, category),
    CONSTRAINT notification_prefs_category_check CHECK (category IN ('bookings', 'payments', 'gallery_updates', 'team_activity', 'marketing', 'security')),
    CONSTRAINT notification_prefs_digest_check CHECK (digest_mode IN ('none', 'daily', 'weekly'))
);

CREATE INDEX idx_notification_prefs_user_id ON notification_preferences(user_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_prefs_owner ON notification_preferences
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR user_id::text = current_setting('app.user_id', true)
    );
