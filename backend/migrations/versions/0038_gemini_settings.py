"""Gemini settings schema for per-user API key management.

Revision ID: 0038
Revises: 0037
Create Date: 2025-12-27
"""

from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create gemini_models catalogue table
    op.execute("""
        CREATE TABLE IF NOT EXISTS gemini_models (
            model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            identifier VARCHAR(100) NOT NULL UNIQUE,
            display_name VARCHAR(200) NOT NULL,
            description TEXT,
            capabilities TEXT[],
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT chk_default_must_be_active
            CHECK (NOT (is_default = TRUE AND is_active = FALSE))
        );

        -- Ensure exactly one default model
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gemini_models_single_default
        ON gemini_models (is_default) WHERE is_default = TRUE;

        CREATE INDEX IF NOT EXISTS idx_gemini_models_active_order
        ON gemini_models (is_active, sort_order);
    """)

    # 2. Seed initial models
    op.execute("""
        INSERT INTO gemini_models (identifier, display_name, sort_order, is_active, is_default) VALUES
          ('gemini-2.5-flash', 'Gemini 2.5 Flash', 1, TRUE, TRUE),
          ('gemini-2.5-pro', 'Gemini 2.5 Pro', 2, TRUE, FALSE),
          ('gemini-1.5-flash', 'Gemini 1.5 Flash', 3, TRUE, FALSE),
          ('gemini-1.5-pro', 'Gemini 1.5 Pro', 4, TRUE, FALSE)
        ON CONFLICT (identifier) DO NOTHING;
    """)

    # 3. Create user_gemini_settings table
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_gemini_settings (
            user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
            api_key_encrypted BYTEA,
            api_key_iv BYTEA,
            api_key_prefix VARCHAR(10),
            api_key_suffix VARCHAR(10),
            selected_model_id UUID REFERENCES gemini_models(model_id) ON DELETE SET NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'not_configured',
            last_validated_at TIMESTAMPTZ,
            validation_error TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT chk_status_values
            CHECK (status IN ('not_configured', 'connected', 'validation_failed')),

            CONSTRAINT chk_key_parts_consistency
            CHECK (
                (api_key_encrypted IS NULL AND api_key_prefix IS NULL AND api_key_suffix IS NULL) OR
                (api_key_encrypted IS NOT NULL AND api_key_prefix IS NOT NULL AND api_key_suffix IS NOT NULL)
            )
        );

        CREATE INDEX IF NOT EXISTS idx_user_gemini_settings_status ON user_gemini_settings (status);
        CREATE INDEX IF NOT EXISTS idx_user_gemini_settings_model ON user_gemini_settings (selected_model_id) WHERE selected_model_id IS NOT NULL;
    """)

    # 4. Create ai_usage_logs table
    op.execute("""
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
            log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            model_identifier VARCHAR(100) NOT NULL,
            feature_type VARCHAR(50) NOT NULL,
            success BOOLEAN NOT NULL,
            error_code VARCHAR(50),
            tokens_used INTEGER,
            latency_ms INTEGER,
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
        ON ai_usage_logs (user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace_created
        ON ai_usage_logs (workspace_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ai_usage_logs")
    op.execute("DROP TABLE IF EXISTS user_gemini_settings")
    op.execute("DROP TABLE IF EXISTS gemini_models")
