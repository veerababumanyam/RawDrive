"""Initial auth/rbac schema with pgvector and required tables.

Revision ID: 0001
Revises: 
Create Date: 2025-12-17
"""

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector;")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) NOT NULL UNIQUE,
            display_name VARCHAR(255) NOT NULL,
            preferred_language VARCHAR(10) DEFAULT 'en-IN',
            email_verified BOOLEAN DEFAULT FALSE,
            email_verified_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            disabled_at TIMESTAMPTZ
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_identities (
            identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            provider VARCHAR(50) NOT NULL,
            provider_user_id VARCHAR(255),
            email VARCHAR(255) NOT NULL,
            email_verified BOOLEAN DEFAULT FALSE,
            password_hash VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_used_at TIMESTAMPTZ,
            UNIQUE(provider, provider_user_id),
            UNIQUE(provider, email)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspaces (
            workspace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) NOT NULL UNIQUE,
            status VARCHAR(50) DEFAULT 'active',
            default_language VARCHAR(10) DEFAULT 'en-IN',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_memberships (
            membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            status VARCHAR(50) DEFAULT 'active',
            invited_by_user_id UUID REFERENCES users(user_id),
            invited_at TIMESTAMPTZ,
            accepted_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, user_id)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS roles (
            role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            permissions TEXT[] NOT NULL DEFAULT '{}',
            is_system BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, name)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS member_roles (
            member_role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            membership_id UUID NOT NULL REFERENCES workspace_memberships(membership_id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
            granted_at TIMESTAMPTZ DEFAULT NOW(),
            granted_by_user_id UUID REFERENCES users(user_id),
            UNIQUE(membership_id, role_id)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS platform_roles (
            role_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL UNIQUE,
            permissions TEXT[] NOT NULL DEFAULT '{}',
            is_system BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_platform_roles (
            assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            role_id UUID NOT NULL REFERENCES platform_roles(role_id) ON DELETE CASCADE,
            granted_by_user_id UUID REFERENCES users(user_id),
            granted_reason TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            revoked_at TIMESTAMPTZ,
            UNIQUE(user_id, role_id)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS plans (
            plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            code VARCHAR(50) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            price_monthly DECIMAL(10,2) NOT NULL,
            price_annual DECIMAL(10,2),
            currency VARCHAR(3) DEFAULT 'INR',
            storage_bytes BIGINT NOT NULL,
            max_galleries INT NOT NULL,
            max_clients INT NOT NULL,
            max_team_members INT NOT NULL,
            ai_credits_monthly INT NOT NULL,
            features JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS workspace_subscriptions (
            subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE UNIQUE,
            plan_id UUID NOT NULL REFERENCES plans(plan_id),
            status VARCHAR(50) DEFAULT 'trialing',
            trial_started_at TIMESTAMPTZ,
            trial_expires_at TIMESTAMPTZ,
            current_period_start TIMESTAMPTZ,
            current_period_end TIMESTAMPTZ,
            billing_provider VARCHAR(50),
            billing_customer_id VARCHAR(255),
            billing_subscription_id VARCHAR(255),
            cancel_at_period_end BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID REFERENCES workspaces(workspace_id),
            actor_user_id UUID REFERENCES users(user_id),
            actor_type VARCHAR(50) NOT NULL,
            action VARCHAR(100) NOT NULL,
            target_type VARCHAR(100),
            target_id VARCHAR(255),
            ip_address INET,
            user_agent TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            workspace_id UUID REFERENCES workspaces(workspace_id),
            refresh_token_hash VARCHAR(255) NOT NULL,
            device_info JSONB,
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_used_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invitations (
            invitation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            email VARCHAR(255) NOT NULL,
            role_ids UUID[] NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            invited_by_user_id UUID NOT NULL REFERENCES users(user_id),
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            accepted_at TIMESTAMPTZ
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS embeddings (
            embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            entity_type VARCHAR(50) NOT NULL,
            entity_id UUID NOT NULL,
            model VARCHAR(100) NOT NULL,
            embedding vector(1536),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(workspace_id, entity_type, entity_id, model)
        );
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS support_access_sessions (
            session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID,
            platform_user_id UUID NOT NULL REFERENCES users(user_id),
            reason TEXT,
            approved_by_user_id UUID,
            approval_type VARCHAR(50),
            started_at TIMESTAMPTZ,
            expires_at TIMESTAMPTZ,
            ended_at TIMESTAMPTZ
        );
        """
    )

    # indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_identities_provider ON user_identities(provider, email);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_slug ON workspaces(slug);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace ON workspace_memberships(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_roles_workspace ON roles(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_time ON audit_logs(workspace_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_embeddings_vector_cosine ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_embeddings_vector_cosine;")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_action;")
    op.execute("DROP INDEX IF EXISTS idx_audit_logs_workspace_time;")
    op.execute("DROP INDEX IF EXISTS idx_roles_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_memberships_user;")
    op.execute("DROP INDEX IF EXISTS idx_workspace_memberships_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_workspaces_slug;")
    op.execute("DROP INDEX IF EXISTS idx_user_identities_provider;")
    op.execute("DROP INDEX IF EXISTS idx_user_identities_user;")
    op.execute("DROP INDEX IF EXISTS idx_users_email;")

    op.execute("DROP TABLE IF EXISTS support_access_sessions;")
    op.execute("DROP TABLE IF EXISTS embeddings;")
    op.execute("DROP TABLE IF EXISTS invitations;")
    op.execute("DROP TABLE IF EXISTS sessions;")
    op.execute("DROP TABLE IF EXISTS audit_logs;")
    op.execute("DROP TABLE IF EXISTS workspace_subscriptions;")
    op.execute("DROP TABLE IF EXISTS plans;")
    op.execute("DROP TABLE IF EXISTS user_platform_roles;")
    op.execute("DROP TABLE IF EXISTS platform_roles;")
    op.execute("DROP TABLE IF EXISTS member_roles;")
    op.execute("DROP TABLE IF EXISTS roles;")
    op.execute("DROP TABLE IF EXISTS workspace_memberships;")
    op.execute("DROP TABLE IF EXISTS workspaces;")
    op.execute("DROP TABLE IF EXISTS user_identities;")
    op.execute("DROP TABLE IF EXISTS users;")
    op.execute("DROP EXTENSION IF EXISTS vector;")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto;")
