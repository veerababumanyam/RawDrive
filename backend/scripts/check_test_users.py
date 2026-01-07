"""Check test users and their workspace memberships."""
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


async def check_test_users():
    """Check test users and their workspace memberships."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

    # Remove asyncpg scheme if present
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        # Check test users with their memberships
        print("\n=== Test Users and Workspace Memberships ===")
        rows = await conn.fetch("""
            SELECT
                u.user_id,
                u.email,
                u.display_name,
                u.created_at,
                wm.workspace_id,
                wm.membership_id,
                wm.status as membership_status
            FROM users u
            LEFT JOIN workspace_memberships wm ON u.user_id = wm.user_id
            WHERE u.email LIKE '%test.rawdrive.in'
            ORDER BY u.created_at DESC;
        """)

        for row in rows:
            print(f"\nUser: {row['email']} ({row['display_name']})")
            print(f"  User ID: {row['user_id']}")
            print(f"  Created: {row['created_at']}")
            print(f"  Workspace ID: {row['workspace_id']}")
            print(f"  Membership ID: {row['membership_id']}")
            print(f"  Membership Status: {row['membership_status']}")

        if not rows:
            print("No test users found!")

        # Check workspaces for test users
        print("\n\n=== Workspaces for Test Users ===")
        workspace_rows = await conn.fetch("""
            SELECT DISTINCT
                w.workspace_id,
                w.name,
                w.slug,
                w.status,
                w.created_at
            FROM workspaces w
            JOIN workspace_memberships wm ON w.workspace_id = wm.workspace_id
            JOIN users u ON wm.user_id = u.user_id
            WHERE u.email LIKE '%test.rawdrive.in'
            ORDER BY w.created_at DESC;
        """)

        for row in workspace_rows:
            print(f"\nWorkspace: {row['name']}")
            print(f"  Workspace ID: {row['workspace_id']}")
            print(f"  Slug: {row['slug']}")
            print(f"  Status: {row['status']}")
            print(f"  Created: {row['created_at']}")

        if not workspace_rows:
            print("No workspaces found for test users!")

        # Count orphaned users (users without workspace memberships)
        orphaned = await conn.fetchval("""
            SELECT COUNT(*)
            FROM users u
            LEFT JOIN workspace_memberships wm ON u.user_id = wm.user_id
            WHERE u.email LIKE '%test.rawdrive.in'
            AND wm.membership_id IS NULL;
        """)

        print(f"\n\n=== Summary ===")
        print(f"Total test users: {len(rows) if rows else 0}")
        print(f"Orphaned test users (no workspace membership): {orphaned}")
        print(f"Workspaces owned by test users: {len(workspace_rows) if workspace_rows else 0}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check_test_users())
