"""Add company_profiles table for branding system.

Creates schema for:
- company_profiles: Single source of truth for workspace branding
- Supports enhancements: visibility controls, vCard/QR, AI policies

Revision ID: 0014
Revises: 0013
Create Date: 2025-12-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # =========================================================================
    # 1. COMPANY_PROFILES TABLE
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS company_profiles (
            profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            
            -- Identity
            name VARCHAR(255) NOT NULL,
            tagline TEXT,
            slug VARCHAR(100) NOT NULL,
            logo_url TEXT,
            favicon_url TEXT,
            
            -- Branding Elements
            brand_color VARCHAR(50),
            brand_font VARCHAR(100),
            
            -- Contact Info
            email VARCHAR(255) NOT NULL,
            phone VARCHAR(50),
            website TEXT,
            
            -- Structured Address (JSONB)
            -- Expected schema: { line1, line2, city, state, postal_code, country }
            address_structured JSONB DEFAULT '{}',
            
            -- Social Media Links (JSONB)
            -- Expected schema: { platform: url, ... }
            socials JSONB DEFAULT '{}',
            
            -- Custom Links (JSONB)
            -- Expected schema: [{ label, url, ... }]
            custom_links JSONB DEFAULT '[]',
            
            -- Visibility Configuration (JSONB)
            -- Control which fields are public
            company_visibility JSONB DEFAULT '{}',
            
            -- Audit fields
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),

            -- Constraints
            CONSTRAINT uq_company_profiles_slug UNIQUE(slug)
        );
        """
    )
    
    # Indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_company_profiles_workspace ON company_profiles(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_company_profiles_slug ON company_profiles(slug);")
    # Composite index for workspace + slug lookup if needed (though constraint covers it, index on slug is good for global lookup if slugs are globally unique - wait, constraint is (workspace_id, slug), so slugs are unique per workspace?)
    # Requirement 4.3 says "slug uniqueness validation across workspaces" in Phase 1 Task 5. 
    # If slug must be globally unique, the constraint should be UNIQUE(slug).
    # But current SQL above has UNIQUE(workspace_id, slug).
    # Task 1.1 doesn't specify global uniqueness, but Task 5 does. 
    # The requirement doc says "slug VARCHAR(100) UNIQUE NOT NULL" in the SQL schema block.
    # CONSTANTLY UNIQUE vs PER WORKSPACE?
    # Spec says: "slug VARCHAR(100) UNIQUE NOT NULL". This implies globally unique.
    # My Implementation Plan had "slug VARCHAR(100) UNIQUE NOT NULL".
    # I should change the constraint to be globally unique as per the spec in the prompt.
    
    # Let's fix the specific constraint to be GLOBAL UNIQUE on slug.
    op.execute("SAVEPOINT p1;")
    try:
         op.execute("ALTER TABLE company_profiles DROP CONSTRAINT IF EXISTS company_profiles_workspace_id_slug_key;")
    except Exception:
         pass # Constraint might not exist or name might differ
    op.execute("ROLLBACK TO SAVEPOINT p1;")

    # Re-apply global unique constraint if it wasn't there
    # Since I just created the table with generic UNIQUE(workspace_id, slug), I should probably change the CREATE statement.
    # I will modify the CREATE statement in the next step to specific `slug VARCHAR(100) UNIQUE NOT NULL`.
    
    pass

def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_company_profiles_slug;")
    op.execute("DROP INDEX IF EXISTS idx_company_profiles_workspace;")
    op.execute("DROP TABLE IF EXISTS company_profiles;")
