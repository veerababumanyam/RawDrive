"""Seed biometric consent for test user workspaces (database-only, no .env).

Grants biometric consent (FaceID) for known test workspaces so test users
are not prompted. Data lives in workspace_biometric_settings; no dependency
on application .env or startup code.

Test workspace IDs (from docs/TEST_USERS.md and test_constants.py):
- Tier: 11111111-1111-1111-1111-000000000001..005 (free, starter, pro, business, enterprise)
- Test roles: 44444444-4444-4444-4444-444444444000

Requires: 0165_add_biometric_consent_tables (workspace_biometric_settings must exist).
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0194"
down_revision = "0193"
branch_labels = None
depends_on = None

# Test workspace IDs: tier users + test-roles workspace (docs/TEST_USERS.md)
TEST_WORKSPACE_IDS = [
    "11111111-1111-1111-1111-000000000001",  # free
    "11111111-1111-1111-1111-000000000002",  # starter
    "11111111-1111-1111-1111-000000000003",  # professional
    "11111111-1111-1111-1111-000000000004",  # business
    "11111111-1111-1111-1111-000000000005",  # enterprise
    "44444444-4444-4444-4444-444444444000",  # test-roles-workspace
]

CONSENT_POLICY_VERSION = "1.0-migration-test-users"


def upgrade() -> None:
    """Grant biometric consent for test workspaces that exist in workspaces table."""
    # Build IN clause: 'id1','id2',...
    in_list = ",".join(f"'{wid}'::uuid" for wid in TEST_WORKSPACE_IDS)

    # Insert or update workspace_biometric_settings for test workspaces that exist.
    # consented_by: use first user if any, else NULL (audit trail still records policy version).
    op.execute(
        f"""
        INSERT INTO workspace_biometric_settings (
            workspace_id,
            face_detection_enabled,
            consent_status,
            consented_by,
            consented_at,
            consent_ip_address,
            consent_user_agent,
            consent_policy_version
        )
        SELECT
            w.workspace_id,
            TRUE,
            'granted',
            (SELECT user_id FROM users LIMIT 1),
            NOW(),
            '127.0.0.1'::inet,
            'Migration 0194 (test users)',
            '{CONSENT_POLICY_VERSION}'
        FROM workspaces w
        WHERE w.workspace_id IN ({in_list})
        ON CONFLICT (workspace_id) DO UPDATE SET
            face_detection_enabled = TRUE,
            consent_status = 'granted',
            consented_by = COALESCE(EXCLUDED.consented_by, workspace_biometric_settings.consented_by),
            consented_at = COALESCE(EXCLUDED.consented_at, workspace_biometric_settings.consented_at),
            consent_ip_address = COALESCE(EXCLUDED.consent_ip_address, workspace_biometric_settings.consent_ip_address),
            consent_user_agent = EXCLUDED.consent_user_agent,
            consent_policy_version = EXCLUDED.consent_policy_version,
            withdrawn_by = NULL,
            withdrawn_at = NULL,
            withdrawal_ip_address = NULL,
            withdrawal_reason = NULL,
            updated_at = NOW()
        """
    )

    # Ensure face_rate_limit_config exists for these workspaces (app expects it after consent).
    op.execute(
        f"""
        INSERT INTO face_rate_limit_config (workspace_id)
        SELECT w.workspace_id
        FROM workspaces w
        WHERE w.workspace_id IN ({in_list})
        ON CONFLICT (workspace_id) DO NOTHING
        """
    )


def downgrade() -> None:
    """Remove seeded consent for test users (set back to not_granted)."""
    in_list = ",".join(f"'{wid}'::uuid" for wid in TEST_WORKSPACE_IDS)
    op.execute(
        f"""
        UPDATE workspace_biometric_settings
        SET
            face_detection_enabled = FALSE,
            consent_status = 'not_granted',
            consented_by = NULL,
            consented_at = NULL,
            consent_ip_address = NULL,
            consent_user_agent = NULL,
            consent_policy_version = NULL,
            updated_at = NOW()
        WHERE workspace_id IN ({in_list})
          AND consent_policy_version = '{CONSENT_POLICY_VERSION}'
        """
    )
