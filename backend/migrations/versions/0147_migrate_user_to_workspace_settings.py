"""Migrate user settings to workspace settings.

Revision ID: 0147
Revises: 0146
Create Date: 2026-01-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = '0147'
down_revision = '0146'
branch_labels = None
depends_on = None

def upgrade() -> None:
    conn = op.get_bind()

    # 1. Get all workspaces
    workspaces = conn.execute(sa.text("SELECT workspace_id FROM workspaces")).fetchall()

    for ws_row in workspaces:
        workspace_id = ws_row[0]

        # 2. Find owner of the workspace
        # correct query using workspace_memberships and roles
        owner_row = conn.execute(sa.text("""
            SELECT wm.user_id 
            FROM workspace_memberships wm
            JOIN member_roles mr ON wm.membership_id = mr.membership_id
            JOIN roles r ON mr.role_id = r.role_id
            WHERE wm.workspace_id = :ws_id AND r.name = 'owner'
            LIMIT 1
        """), {"ws_id": workspace_id}).fetchone()

        ai_migrated = False
        
        if owner_row:
            owner_id = owner_row[0]

            # 3. Migrate AI Settings if present
            gemini_settings = conn.execute(sa.text(
                "SELECT * FROM user_gemini_settings WHERE user_id = :uid"
            ), {"uid": owner_id}).fetchone()

            if gemini_settings:
                user_s = conn.execute(sa.text("""
                    SELECT api_key_encrypted, api_key_iv, api_key_prefix, api_key_suffix, 
                           selected_model_id, status, last_validated_at, validation_error
                    FROM user_gemini_settings WHERE user_id = :uid
                """), {"uid": owner_id}).fetchone()
                
                if user_s:
                    conn.execute(sa.text("""
                        INSERT INTO workspace_ai_settings (
                            workspace_id, provider, api_key_encrypted, api_key_iv, 
                            api_key_prefix, api_key_suffix, selected_model_id, status, 
                            last_validated_at, validation_error, created_at, updated_at
                        ) VALUES (
                            :ws_id, 'gemini', :enc, :iv, :prefix, :suffix, :mid, :status, 
                            :lva, :verr, NOW(), NOW()
                        )
                        ON CONFLICT (workspace_id) DO NOTHING
                    """), {
                        "ws_id": workspace_id,
                        "enc": user_s[0],
                        "iv": user_s[1],
                        "prefix": user_s[2],
                        "suffix": user_s[3],
                        "mid": user_s[4],
                        "status": user_s[5],
                        "lva": user_s[6],
                        "verr": user_s[7]
                    })
                    ai_migrated = True

        if not ai_migrated:
            conn.execute(sa.text("""
                INSERT INTO workspace_ai_settings (workspace_id, provider, status)
                VALUES (:ws_id, 'gemini', 'not_configured')
                ON CONFLICT (workspace_id) DO NOTHING
            """), {"ws_id": workspace_id})
            
        # Create default workspace_security_settings
        conn.execute(sa.text("""
            INSERT INTO workspace_security_settings (workspace_id, require_2fa, session_timeout_minutes)
            VALUES (:ws_id, FALSE, 1440)
            ON CONFLICT (workspace_id) DO NOTHING
        """), {"ws_id": workspace_id})

        # Create default workspace_notification_settings
        # Updated to use default_email_preferences (JSONB) instead of invalid boolean column
        conn.execute(sa.text("""
            INSERT INTO workspace_notification_settings (workspace_id, default_email_preferences)
            VALUES (:ws_id, '{}')
            ON CONFLICT (workspace_id) DO NOTHING
        """), {"ws_id": workspace_id})
        
        # Create default workspace_privacy_settings
        conn.execute(sa.text("""
            INSERT INTO workspace_privacy_settings (workspace_id, analytics_enabled)
            VALUES (:ws_id, TRUE)
            ON CONFLICT (workspace_id) DO NOTHING
        """), {"ws_id": workspace_id})

def downgrade() -> None:
    pass
