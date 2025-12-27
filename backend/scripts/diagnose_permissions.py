#!/usr/bin/env python3
"""
Diagnostic script to check user permissions and role assignments.

Run with: python scripts/diagnose_permissions.py <workspace_id>
"""

import asyncio
import sys
import os

# Add the src directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from uuid import UUID


async def diagnose_workspace(workspace_id: str):
    """Diagnose permission issues for a workspace."""
    from app.db.postgres import get_postgres_pool
    
    pool = await get_postgres_pool()
    
    workspace_uuid = UUID(workspace_id)
    
    print(f"\n{'='*60}")
    print(f"PERMISSION DIAGNOSTIC FOR WORKSPACE: {workspace_id}")
    print(f"{'='*60}")
    
    # 1. Check workspace exists
    workspace = await pool.fetchrow(
        "SELECT * FROM workspaces WHERE workspace_id = $1",
        workspace_uuid
    )
    
    if not workspace:
        print("\n❌ ERROR: Workspace not found!")
        return
    
    print(f"\n✅ Workspace: {workspace['name']} (status: {workspace['status']})")
    
    # 2. Get all roles in workspace
    print(f"\n{'='*60}")
    print("ROLES IN WORKSPACE:")
    print(f"{'='*60}")
    
    roles = await pool.fetch(
        """
        SELECT role_id, name, permissions, is_system, created_at
        FROM roles WHERE workspace_id = $1
        ORDER BY is_system DESC, name
        """,
        workspace_uuid
    )
    
    if not roles:
        print("\n⚠️  WARNING: No roles found in workspace!")
    else:
        for role in roles:
            print(f"\n  Role: {role['name']} {'(system)' if role['is_system'] else '(custom)'}")
            print(f"  Role ID: {role['role_id']}")
            print(f"  Permissions: {role['permissions']}")
            
            # Check if billing permissions are present
            has_billing = any('billing' in p for p in role['permissions'])
            if has_billing:
                print(f"  ✅ Has billing-related permissions")
            else:
                print(f"  ⚠️  No billing permissions")
    
    # 3. Get all members and their roles
    print(f"\n{'='*60}")
    print("WORKSPACE MEMBERS AND THEIR ROLES:")
    print(f"{'='*60}")
    
    members = await pool.fetch(
        """
        SELECT 
            wm.membership_id, wm.user_id, wm.status,
            u.email, u.display_name
        FROM workspace_memberships wm
        JOIN users u ON u.user_id = wm.user_id
        WHERE wm.workspace_id = $1
        """,
        workspace_uuid
    )
    
    for member in members:
        print(f"\n  User: {member['display_name']} ({member['email']})")
        print(f"  User ID: {member['user_id']}")
        print(f"  Membership ID: {member['membership_id']}")
        print(f"  Status: {member['status']}")
        
        # Get roles for this member
        member_roles = await pool.fetch(
            """
            SELECT r.role_id, r.name, r.permissions
            FROM member_roles mr
            JOIN roles r ON r.role_id = mr.role_id
            WHERE mr.membership_id = $1
            """,
            member['membership_id']
        )
        
        if not member_roles:
            print(f"  ❌ NO ROLES ASSIGNED!")
        else:
            for role in member_roles:
                print(f"  Assigned Role: {role['name']}")
                print(f"    Permissions: {role['permissions']}")
                
                # Check for billing:read specifically
                has_billing_read = 'billing:read' in role['permissions'] or 'billing:*' in role['permissions']
                if has_billing_read:
                    print(f"    ✅ Has billing:read (or billing:*)")
                else:
                    print(f"    ⚠️  Missing billing:read")
    
    # 4. Check subscription
    print(f"\n{'='*60}")
    print("SUBSCRIPTION STATUS:")
    print(f"{'='*60}")
    
    subscription = await pool.fetchrow(
        """
        SELECT ws.*, p.code as plan_code, p.name as plan_name
        FROM workspace_subscriptions ws
        JOIN plans p ON p.plan_id = ws.plan_id
        WHERE ws.workspace_id = $1
        """,
        workspace_uuid
    )
    
    if subscription:
        print(f"\n  Plan: {subscription['plan_name']} ({subscription['plan_code']})")
        print(f"  Status: {subscription['status']}")
        print(f"  Trial expires: {subscription['trial_expires_at']}")
    else:
        print("\n  ⚠️  No subscription found!")
    
    # 5. Check WORKSPACE_PERMISSIONS list
    print(f"\n{'='*60}")
    print("PERMISSION VALIDATION:")
    print(f"{'='*60}")
    
    from app.services.rbac_service import WORKSPACE_PERMISSIONS
    
    print(f"\n  Valid WORKSPACE_PERMISSIONS:")
    for p in WORKSPACE_PERMISSIONS:
        print(f"    - {p}")
    
    # Check if roles use valid permissions
    print(f"\n  Checking roles for invalid permissions:")
    for role in roles:
        for perm in role['permissions']:
            # Skip wildcards
            if perm.endswith(':*'):
                prefix = perm[:-2]
                valid_base = any(p.startswith(prefix) for p in WORKSPACE_PERMISSIONS)
                if not valid_base:
                    print(f"    ⚠️  Role '{role['name']}' has wildcard '{perm}' but no matching permissions in WORKSPACE_PERMISSIONS")
            elif perm not in WORKSPACE_PERMISSIONS:
                print(f"    ⚠️  Role '{role['name']}' has permission '{perm}' not in WORKSPACE_PERMISSIONS")
    
    print(f"\n{'='*60}")
    print("DIAGNOSIS COMPLETE")
    print(f"{'='*60}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python diagnose_permissions.py <workspace_id>")
        print("Example: python diagnose_permissions.py 34c96892-1c3b-50c5-9156-87dc4b0eba8a")
        sys.exit(1)
    
    workspace_id = sys.argv[1]
    asyncio.run(diagnose_workspace(workspace_id))
