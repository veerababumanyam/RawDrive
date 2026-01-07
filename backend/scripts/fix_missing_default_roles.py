"""Fix workspaces missing default roles.

Adds missing default roles (owner, admin, editor, viewer) to workspaces
that don't have them. This can happen with workspaces created via signup
API instead of workspace_service.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


async def fix_missing_roles():
    """Add missing default roles to workspaces."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

    # Remove asyncpg scheme if present
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        print("\n=== Fixing Missing Default Roles ===\n")

        # Find workspaces missing default roles
        workspaces = await conn.fetch("""
            SELECT w.workspace_id, w.name,
                   ARRAY_AGG(r.name) as existing_roles
            FROM workspaces w
            LEFT JOIN roles r ON r.workspace_id = w.workspace_id AND r.is_system = TRUE
            GROUP BY w.workspace_id, w.name
            HAVING COUNT(DISTINCT r.name) < 4
        """)

        if not workspaces:
            print("✅ All workspaces have complete default roles!")
            return

        print(f"Found {len(workspaces)} workspaces with missing roles\n")

        now = datetime.now(timezone.utc)
        required_roles = {
            'owner': [
                "workspace:*", "galleries:*", "assets:*",
                "members:*", "roles:*", "billing:*", "audit:read"
            ],
            'admin': [
                "workspace:write", "galleries:*", "assets:*",
                "members:write", "members:invite", "roles:write", "billing:read", "audit:read"
            ],
            'editor': [
                "galleries:read", "galleries:write", "assets:read", "assets:write"
            ],
            'viewer': [
                "galleries:read", "assets:read"
            ],
        }

        for ws in workspaces:
            workspace_id = ws['workspace_id']
            workspace_name = ws['name']
            existing_roles = set(ws['existing_roles'] or [])
            missing_roles = set(required_roles.keys()) - existing_roles

            if not missing_roles:
                continue

            print(f"Workspace: {workspace_name}")
            print(f"  Missing roles: {', '.join(missing_roles)}")

            for role_name in missing_roles:
                role_id = uuid4()
                permissions = required_roles[role_name]

                await conn.execute("""
                    INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
                    VALUES ($1, $2, $3, $4, TRUE, $5)
                """,
                    role_id,
                    workspace_id,
                    role_name,
                    permissions,
                    now
                )

                print(f"  ✅ Created '{role_name}' role")

            print()

        print(f"\n✅ Fixed {len(workspaces)} workspaces")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix_missing_roles())
