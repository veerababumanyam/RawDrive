"""Database integrity validation script.

Checks for common database integrity issues that can cause workspace loading failures:
- Workspaces without subscriptions
- Users without workspace memberships
- Memberships without roles
- Invalid subscription states

Run this after migrations or when debugging workspace access issues.
"""
import asyncio
import os
import sys
from pathlib import Path
from uuid import UUID

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


async def validate_integrity():
    """Validate database integrity and report issues."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

    # Remove asyncpg scheme if present
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        print("\n" + "="*80)
        print(" DATABASE INTEGRITY VALIDATION")
        print("="*80)

        issues_found = 0

        # ====================================================================
        # CHECK 1: Workspaces without subscriptions
        # ====================================================================
        print("\n[CHECK 1] Workspaces without subscriptions...")

        orphaned_workspaces = await conn.fetch("""
            SELECT w.workspace_id, w.name, w.slug, w.created_at
            FROM workspaces w
            LEFT JOIN workspace_subscriptions ws ON w.workspace_id = ws.workspace_id
            WHERE ws.subscription_id IS NULL
            ORDER BY w.created_at DESC
        """)

        if orphaned_workspaces:
            print(f"  ❌ CRITICAL: Found {len(orphaned_workspaces)} workspaces without subscriptions!")
            for ws in orphaned_workspaces[:5]:  # Show first 5
                print(f"     - {ws['name']} ({ws['workspace_id']}) created {ws['created_at']}")
            if len(orphaned_workspaces) > 5:
                print(f"     ... and {len(orphaned_workspaces) - 5} more")
            issues_found += len(orphaned_workspaces)
        else:
            print("  ✅ All workspaces have subscriptions")

        # ====================================================================
        # CHECK 2: Users without workspace memberships
        # ====================================================================
        print("\n[CHECK 2] Users without workspace memberships...")

        orphaned_users = await conn.fetch("""
            SELECT u.user_id, u.email, u.display_name, u.created_at
            FROM users u
            LEFT JOIN workspace_memberships wm ON u.user_id = wm.user_id
            WHERE wm.membership_id IS NULL
            ORDER BY u.created_at DESC
        """)

        if orphaned_users:
            print(f"  ⚠️  WARNING: Found {len(orphaned_users)} users without workspace memberships!")
            for user in orphaned_users[:5]:
                print(f"     - {user['email']} ({user['user_id']}) created {user['created_at']}")
            if len(orphaned_users) > 5:
                print(f"     ... and {len(orphaned_users) - 5} more")
            issues_found += len(orphaned_users)
        else:
            print("  ✅ All users have workspace memberships")

        # ====================================================================
        # CHECK 3: Workspace memberships without roles
        # ====================================================================
        print("\n[CHECK 3] Workspace memberships without roles...")

        memberships_without_roles = await conn.fetch("""
            SELECT wm.membership_id, u.email, w.name as workspace_name
            FROM workspace_memberships wm
            JOIN users u ON u.user_id = wm.user_id
            JOIN workspaces w ON w.workspace_id = wm.workspace_id
            LEFT JOIN member_roles mr ON mr.membership_id = wm.membership_id
            WHERE mr.member_role_id IS NULL
            ORDER BY wm.created_at DESC
        """)

        if memberships_without_roles:
            print(f"  ⚠️  WARNING: Found {len(memberships_without_roles)} memberships without roles!")
            for mem in memberships_without_roles[:5]:
                print(f"     - {mem['email']} in {mem['workspace_name']}")
            if len(memberships_without_roles) > 5:
                print(f"     ... and {len(memberships_without_roles) - 5} more")
            issues_found += len(memberships_without_roles)
        else:
            print("  ✅ All memberships have roles assigned")

        # ====================================================================
        # CHECK 4: Missing default plans
        # ====================================================================
        print("\n[CHECK 4] Required subscription plans...")

        required_plans = ['free', 'starter', 'professional', 'studio', 'enterprise']
        plans = await conn.fetch("SELECT code FROM plans WHERE code = ANY($1)", required_plans)
        found_plans = {p['code'] for p in plans}
        missing_plans = set(required_plans) - found_plans

        if missing_plans:
            print(f"  ⚠️  WARNING: Missing required plans: {', '.join(missing_plans)}")
            print("     Run migration 0094 (subscription plans) and 0118 (free plan)")
            issues_found += len(missing_plans)
        else:
            print(f"  ✅ All required plans exist ({len(found_plans)} plans)")

        # ====================================================================
        # CHECK 5: Invalid subscription states
        # ====================================================================
        print("\n[CHECK 5] Invalid subscription states...")

        invalid_subs = await conn.fetch("""
            SELECT ws.subscription_id, w.name, ws.status, ws.trial_expires_at
            FROM workspace_subscriptions ws
            JOIN workspaces w ON w.workspace_id = ws.workspace_id
            WHERE ws.status = 'trialing' AND ws.trial_expires_at < NOW()
        """)

        if invalid_subs:
            print(f"  ⚠️  WARNING: Found {len(invalid_subs)} expired trials still marked as 'trialing'!")
            for sub in invalid_subs[:5]:
                print(f"     - {sub['name']} (expired {sub['trial_expires_at']})")
            issues_found += len(invalid_subs)
        else:
            print("  ✅ No expired trials in 'trialing' state")

        # ====================================================================
        # CHECK 6: Workspaces without default roles
        # ====================================================================
        print("\n[CHECK 6] Workspaces without default roles...")

        required_roles = ['owner', 'admin', 'editor', 'viewer']
        workspaces_with_missing_roles = await conn.fetch("""
            SELECT w.workspace_id, w.name,
                   ARRAY_AGG(r.name) as existing_roles
            FROM workspaces w
            LEFT JOIN roles r ON r.workspace_id = w.workspace_id AND r.is_system = TRUE
            GROUP BY w.workspace_id, w.name
            HAVING COUNT(DISTINCT r.name) < 4
        """)

        if workspaces_with_missing_roles:
            print(f"  ⚠️  WARNING: Found {len(workspaces_with_missing_roles)} workspaces with missing default roles!")
            for ws in workspaces_with_missing_roles[:5]:
                existing = ws['existing_roles'] or []
                missing = set(required_roles) - set(existing)
                print(f"     - {ws['name']}: missing {', '.join(missing)}")
            issues_found += len(workspaces_with_missing_roles)
        else:
            print("  ✅ All workspaces have complete default roles")

        # ====================================================================
        # SUMMARY
        # ====================================================================
        print("\n" + "="*80)
        print(" VALIDATION SUMMARY")
        print("="*80)

        if issues_found == 0:
            print("\n✅ DATABASE INTEGRITY: PASSED")
            print("   No issues found. All workspaces should be accessible.")
        else:
            print(f"\n❌ DATABASE INTEGRITY: FAILED")
            print(f"   Found {issues_found} total issues that need attention.")
            print("\n   RECOMMENDED ACTIONS:")
            if orphaned_workspaces:
                print("   1. Run backend/scripts/fix_orphaned_workspaces.py to create missing subscriptions")
            if orphaned_users:
                print("   2. Run backend/scripts/fix_orphaned_users.py to create workspaces for orphaned users")
            if memberships_without_roles:
                print("   3. Manually assign default roles to memberships without roles")
            if missing_plans:
                print("   4. Run alembic migrations to create missing plans")

        print("\n")
        return issues_found

    finally:
        await conn.close()


if __name__ == "__main__":
    exit_code = asyncio.run(validate_integrity())
    sys.exit(0 if exit_code == 0 else 1)
