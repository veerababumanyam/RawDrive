"""Create ai_provider_settings table for admin-configurable AI providers.

This migration creates the ai_provider_settings table which stores configuration
for AI providers (Google Cloud Vision, Google Gemini) used for face detection.

Key features:
- Encrypted credential storage (API keys, service account JSON)
- Configurable rate limits and timeouts per provider
- Provider priority for failover ordering
- Health status tracking for circuit breaker integration
- Enable/disable toggle for each provider

Configuration precedence:
1. Admin settings (this table) - highest priority
2. Environment variables - fallback when admin settings not configured

Revision ID: 0027
Revises: 0026
Create Date: 2025-12-23
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0027"
down_revision = "0026"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create ai_provider_settings table for provider configuration.
    
    Table structure:
    - id: Primary key UUID
    - provider_name: Unique identifier (cloud_vision, gemini)
    - credentials_encrypted: Encrypted API keys/service account JSON
    - config: Provider-specific configuration (model, project_id, etc.)
    - is_enabled: Toggle to enable/disable provider
    - priority: Failover order (lower = higher priority)
    - rate_limit_per_minute: Max requests per minute
    - timeout_ms: Request timeout in milliseconds
    - health_status: Current health (healthy, unhealthy, unknown)
    - last_health_check: Timestamp of last health check
    - timestamps: created_at, updated_at
    """
    
    # Create ai_provider_settings table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS ai_provider_settings (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            
            -- Unique provider identifier
            -- Values: 'cloud_vision', 'gemini'
            provider_name VARCHAR(50) NOT NULL UNIQUE,
            
            -- Encrypted credentials (API keys, service account JSON)
            -- Encrypted using AES-256-GCM with application encryption key
            -- NULL means credentials should be loaded from environment variables
            credentials_encrypted BYTEA,
            
            -- Provider-specific configuration as JSONB
            -- Cloud Vision: {"project_id": "...", "max_results": 50}
            -- Gemini: {"model": "gemini-2.5-flash", "max_output_tokens": 1024}
            config JSONB NOT NULL DEFAULT '{}',
            
            -- Enable/disable toggle for this provider
            -- Disabled providers are skipped during provider selection
            is_enabled BOOLEAN NOT NULL DEFAULT true,
            
            -- Priority for failover ordering (lower number = higher priority)
            -- Example: cloud_vision=0 (primary), gemini=1 (fallback)
            priority INTEGER NOT NULL DEFAULT 0,
            
            -- Rate limit: maximum requests per minute
            -- NULL means no rate limiting (use provider's default)
            rate_limit_per_minute INTEGER,
            
            -- Request timeout in milliseconds
            -- Requests exceeding this timeout will be cancelled
            timeout_ms INTEGER NOT NULL DEFAULT 30000,
            
            -- Current health status for circuit breaker integration
            -- Values: 'healthy', 'unhealthy', 'unknown'
            health_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
            
            -- Timestamp of last health check
            -- NULL if never checked
            last_health_check TIMESTAMPTZ,
            
            -- Timestamps for auditing
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Constraints
            CONSTRAINT ai_provider_settings_health_status_valid CHECK (
                health_status IN ('healthy', 'unhealthy', 'unknown')
            ),
            CONSTRAINT ai_provider_settings_timeout_positive CHECK (timeout_ms > 0),
            CONSTRAINT ai_provider_settings_rate_limit_positive CHECK (
                rate_limit_per_minute IS NULL OR rate_limit_per_minute > 0
            )
        );
        """
    )
    
    # Create index for provider lookup
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_provider_settings_name ON ai_provider_settings(provider_name);"
    )
    
    # Create index for enabled providers ordered by priority
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_provider_settings_enabled ON ai_provider_settings(is_enabled, priority);"
    )
    
    # Create trigger for automatic updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_ai_provider_settings_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    
    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_ai_provider_settings_updated_at ON ai_provider_settings;
        CREATE TRIGGER trigger_ai_provider_settings_updated_at
            BEFORE UPDATE ON ai_provider_settings
            FOR EACH ROW
            EXECUTE FUNCTION update_ai_provider_settings_updated_at();
        """
    )
    
    # Insert default provider configurations
    # Credentials are NULL - will fall back to environment variables
    op.execute(
        """
        INSERT INTO ai_provider_settings (provider_name, config, priority, rate_limit_per_minute, timeout_ms)
        VALUES 
            ('cloud_vision', '{"max_results": 50}', 0, 1800, 30000),
            ('gemini', '{"model": "gemini-2.5-flash", "max_output_tokens": 2048}', 1, 60, 60000)
        ON CONFLICT (provider_name) DO NOTHING;
        """
    )


def downgrade() -> None:
    """Drop ai_provider_settings table.
    
    WARNING: This will permanently delete all provider configurations.
    """
    # Drop trigger
    op.execute("DROP TRIGGER IF EXISTS trigger_ai_provider_settings_updated_at ON ai_provider_settings;")
    op.execute("DROP FUNCTION IF EXISTS update_ai_provider_settings_updated_at();")
    
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_ai_provider_settings_enabled;")
    op.execute("DROP INDEX IF EXISTS idx_ai_provider_settings_name;")
    
    # Drop table
    op.execute("DROP TABLE IF EXISTS ai_provider_settings;")
