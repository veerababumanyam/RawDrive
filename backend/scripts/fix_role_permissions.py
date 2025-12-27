#!/usr/bin/env python3
"""
Migration script to fix role permissions in existing workspaces.

This script updates all owner roles to have the correct permissions that match
the WORKSPACE_PERMISSIONS list in rbac_service.py.

Run with: python scripts/fix_role_permissions.py
"""

import asyncio
import sys
import os

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))


# Correct permissions that match WORKSPACE_PERMISSIONS
CORRECT_OWNER_PERMISSIONS = [
    "workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"
]

CORRECT_ADMIN_PERMISSIONS = [
    "workspace:write", "members:write", "members:invite", "roles:write", 
    "galleries:*", "assets:*", "billing:read", "audit:read"
]

CORRECT_EDITOR_PERMISSIONS = [
    "galleries:read", "galleries:write", "assets:read", "assets:write"
]

CORRECT_VIEWER_PERMISSIONS = [
    "galleries:read", "assets:read"
]


async def fix_permissions():
    """Fix role permissions for all workspaces."""
    from app.db.postgres import get_postgres_pool
    
    pool = await get_postgres_pool()
    
    print("\n" + "="*60)
    print("FIXING ROLE PERMISSIONS")
    print("="*60)
    
    # Get all workspaces
    workspaces = await pool.fetch("SELECT workspace_id, name FROM workspaces")
    print(f"\nFound {len(workspaces)} workspaces to process")
    
    fixed_count = 0
    
    for ws in workspaces:
        workspace_id = ws['workspace_id']
        print(f"\n  Processing: {ws['name']} ({workspace_id})")
        
        # Fix owner role
        result = await pool.execute(
            """
            UPDATE roles SET permissions = $1
            WHERE workspace_id = $2 AND name = 'owner' AND is_system = TRUE
            """,
            CORRECT_OWNER_PERMISSIONS,
            workspace_id
        )
        if result != "UPDATE 0":
            print(f"    ✅ Fixed owner role")
            fixed_count += 1
        
        # Fix admin role
        result = await pool.execute(
            """
            UPDATE roles SET permissions = $1
            WHERE workspace_id = $2 AND name = 'admin' AND is_system = TRUE
            """,
            CORRECT_ADMIN_PERMISSIONS,
            workspace_id
        )
        if result != "UPDATE 0":
            print(f"    ✅ Fixed admin role")
        
        # Fix editor role
        result = await pool.execute(
            """
            UPDATE roles SET permissions = $1
            WHERE workspace_id = $2 AND name = 'editor' AND is_system = TRUE
            """,
            CORRECT_EDITOR_PERMISSIONS,
            workspace_id
        )
        if result != "UPDATE 0":
            print(f"    ✅ Fixed editor role")
        
        # Fix viewer role
        result = await pool.execute(
            """
            UPDATE roles SET permissions = $1
            WHERE workspace_id = $2 AND name = 'viewer' AND is_system = TRUE
            """,
            CORRECT_VIEWER_PERMISSIONS,
            workspace_id
        )
        if result != "UPDATE 0":
            print(f"    ✅ Fixed viewer role")
    
    # Also clear the Redis permission cache to force re-fetch
    try:
        from app.db.redis import get_redis_client
        redis = await get_redis_client()
        
        # Find and delete all permission cache keys
        cursor = 0
        deleted = 0
        while True:
            cursor, keys = await redis.scan(cursor, match="perms:*", count=100)
            if keys:
                await redis.delete(*keys)
                deleted += len(keys)
            if cursor == 0:
                break
        
        print(f"\n  🗑️  Cleared {deleted} cached permission entries from Redis")
    except Exception as e:
        print(f"\n  ⚠️  Could not clear Redis cache: {e}")
    
    print("\n" + "="*60)
    print(f"COMPLETED: Fixed {fixed_count} workspace(s)")
    print("="*60)
    print("\n⚠️  Users may need to log out and log back in for")
    print("   permission changes to take effect.")


if __name__ == "__main__":
    asyncio.run(fix_permissions())
