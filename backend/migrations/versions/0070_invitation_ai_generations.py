"""Create invitation_ai_generations table for AI usage auditing.

Feature: 017-digital-wedding-invitations
Revision ID: 0070
Revises: 0069
Create Date: 2026-01-01
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0070"
down_revision = "0069"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create invitation_ai_generations table."""
    op.execute(
        """
        CREATE TABLE invitation_ai_generations (
            -- Primary key
            generation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Foreign keys
            invitation_id UUID NOT NULL REFERENCES digital_invitations(invitation_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id),

            -- Generation type
            generation_type VARCHAR(20) NOT NULL CHECK (generation_type IN ('text', 'image')),

            -- Request
            prompt TEXT NOT NULL,
            field_target VARCHAR(100), -- 'headline', 'bio', 'rsvp_text', 'background'
            language VARCHAR(10),
            provider VARCHAR(50), -- 'gemini', 'imagen', 'nano_banana'
            model VARCHAR(100),

            -- Response
            generated_options JSONB, -- Array of generated options
            selected_option_index INTEGER,
            was_used BOOLEAN DEFAULT FALSE,

            -- Performance
            latency_ms INTEGER,
            tokens_used INTEGER,
            cost_estimate DECIMAL(10, 6),

            -- Status
            status VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'failed', 'timeout')),
            error_message TEXT,

            -- Audit
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    # Indexes
    op.execute(
        """
        CREATE INDEX idx_invitation_ai_gen_invitation ON invitation_ai_generations(invitation_id);
        CREATE INDEX idx_invitation_ai_gen_workspace ON invitation_ai_generations(workspace_id);
        CREATE INDEX idx_invitation_ai_gen_user ON invitation_ai_generations(user_id);
        CREATE INDEX idx_invitation_ai_gen_type ON invitation_ai_generations(generation_type, status);
        CREATE INDEX idx_invitation_ai_gen_time ON invitation_ai_generations(created_at DESC);
        """
    )


def downgrade() -> None:
    """Drop invitation_ai_generations table."""
    op.execute("DROP TABLE IF EXISTS invitation_ai_generations;")
