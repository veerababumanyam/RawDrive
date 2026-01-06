import asyncio
import os
import sys
import uuid
import uuid as uuid_lib

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

DEFAULT_WS_ROLES = [
    ("owner", ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"], True),
    ("admin", ["workspace:write", "members:write", "roles:write", "galleries:*", "assets:*", "billing:read", "audit:read"], True),
    ("editor", ["galleries:write", "galleries:read", "assets:write", "assets:read"], True),
    ("viewer", ["galleries:read", "assets:read"], True),
]

async def repair():
    from app.db.postgres import get_postgres_pool, init_postgres_pool
    from app.services.rbac_service import RBACService
    
    await init_postgres_pool()
    pool = await get_postgres_pool()
    
    ws_id = uuid.UUID("11111111-1111-1111-1111-111111111004")
    user_id = ws_id # For Business user, user_id matches workspace_id

    print(f"Repairing workspace: {ws_id}")
    
    # Check if workspace exists
    ws = await pool.fetchrow("SELECT * FROM workspaces WHERE workspace_id = $1", ws_id)
    if not ws:
        print("Workspace NOT FOUND! Cannot repair.")
        return

    # Create roles
    created_roles = {}
    for name, permissions, is_system in DEFAULT_WS_ROLES:
        # Check if role exists
        existing = await pool.fetchrow(
            "SELECT role_id FROM roles WHERE workspace_id = $1 AND name = $2",
            ws_id, name
        )
        
        if existing:
            print(f"Role '{name}' already exists.")
            created_roles[name] = existing['role_id']
            # Update permissions just in case
            await pool.execute(
                "UPDATE roles SET permissions = $1, is_system = $2 WHERE role_id = $3",
                permissions, is_system, existing['role_id']
            )
            print(f"  Updated permissions for '{name}'")
        else:
            role_id = uuid.uuid4()
            await pool.execute(
                """
                INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                """,
                role_id, ws_id, name, permissions, is_system
            )
            print(f"Role '{name}' created.")
            created_roles[name] = role_id

    # Assign owner role
    membership = await pool.fetchrow(
        "SELECT membership_id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
        ws_id, user_id
    )
    
    if not membership:
        print("Membership NOT FOUND! Creating membership...")
        # Create membership
        await pool.execute(
            """
            INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status)
            VALUES (gen_random_uuid(), $1, $2, 'active')
            """,
            ws_id, user_id
        )
        membership = await pool.fetchrow(
            "SELECT membership_id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
            ws_id, user_id
        )
        print("Membership created.")

    owner_role_id = created_roles.get("owner")
    if owner_role_id:
        # Check if assigned
        assigned = await pool.fetchval(
            "SELECT 1 FROM member_roles WHERE membership_id = $1 AND role_id = $2",
            membership['membership_id'], owner_role_id
        )
        
        if not assigned:
            await pool.execute(
                """
                INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at)
                VALUES (gen_random_uuid(), $1, $2, NOW())
                """,
                membership['membership_id'], owner_role_id
            )
            print("assigned 'owner' role to user.")
        else:
            print("'owner' role already assigned.")

    # Clear redis cache
    try:
        from app.db.redis import get_redis_client, init_redis_client
        await init_redis_client()
        redis = await get_redis_client()
        await redis.delete(f"perms:{user_id}:{ws_id}")
        print("Cleared permission cache.")
    except Exception as e:
        print(f"Failed to clear cache (non-critical): {e}")

if __name__ == "__main__":
    asyncio.run(repair())
