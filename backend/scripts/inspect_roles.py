import asyncio
import os
import sys
import uuid

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

async def inspect():
    from app.db.postgres import get_postgres_pool, init_postgres_pool
    
    await init_postgres_pool()
    pool = await get_postgres_pool()
    
    # Free User Workspace ID
    ws_id = uuid.UUID("d049a58f-0a4f-5b35-95cb-99b572886b5f")
    with open("roles_output_utf8.txt", "w", encoding="utf-8") as f:
        f.write(f"Inspecting workspace: {ws_id}\n")
        
        # Check workspace
        ws = await pool.fetchrow("SELECT * FROM workspaces WHERE workspace_id = $1", ws_id)
        if ws:
            f.write(f"Workspace found: {ws['name']} ({ws['slug']})\n")
        else:
            f.write("Workspace NOT FOUND\n")
            return

        # Check roles
        rows = await pool.fetch("SELECT * FROM roles WHERE workspace_id = $1", ws_id)
        f.write(f"Roles count: {len(rows)}\n")
        for row in rows:
            f.write(f"  Role: {row['name']} (System: {row['is_system']}) - Permissions: {row['permissions']}\n")

        # Check memberships
        members = await pool.fetch("SELECT * FROM workspace_memberships WHERE workspace_id = $1", ws_id)
        f.write(f"Members count: {len(members)}\n")
        for m in members:
            f.write(f"  Member: {m['user_id']} (Status: {m['status']})\n")
            # Check member roles
            m_roles = await pool.fetch("""
                SELECT r.name, r.permissions 
                FROM member_roles mr 
                JOIN roles r ON r.role_id = mr.role_id 
                WHERE mr.membership_id = $1
            """, m['membership_id'])
            for mr in m_roles:
                f.write(f"    - Has Role: {mr['name']}\n")

if __name__ == "__main__":
    asyncio.run(inspect())
