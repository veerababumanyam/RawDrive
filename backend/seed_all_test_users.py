"""Seed all test users from TEST_USERS.md with deterministic UUIDs."""
import asyncio
import asyncpg
from uuid import UUID
from datetime import datetime, timedelta
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from app.utils.security import hash_password

DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"

# Test user definitions with deterministic UUIDs
SUBSCRIPTION_TIER_USERS = [
    {
        "user_id": "11111111-1111-1111-1111-111111111001",
        "email": "free@test.rawdrive.in",
        "display_name": "Test Free User",
        "workspace_name": "free",
        "workspace_id": "11111111-1111-1111-1111-000000000001",
        "plan": "free",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111002",
        "email": "starter@test.rawdrive.in",
        "display_name": "Test Starter User",
        "workspace_name": "starter",
        "workspace_id": "11111111-1111-1111-1111-000000000002",
        "plan": "starter",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111003",
        "email": "professional@test.rawdrive.in",
        "display_name": "Test Professional",
        "workspace_name": "professional",
        "workspace_id": "11111111-1111-1111-1111-000000000003",
        "plan": "professional",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111004",
        "email": "business@test.rawdrive.in",
        "display_name": "Test Business User",
        "workspace_name": "business",
        "workspace_id": "11111111-1111-1111-1111-000000000004",
        "plan": "business",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111005",
        "email": "enterprise@test.rawdrive.in",
        "display_name": "Test Enterprise User",
        "workspace_name": "enterprise",
        "workspace_id": "11111111-1111-1111-1111-000000000005",
        "plan": "enterprise",
    },
]

PLATFORM_ADMIN_USERS = [
    {
        "user_id": "22222222-2222-2222-2222-222222222001",
        "email": "superadmin@test.rawdrive.in",
        "display_name": "Super Admin",
        "workspace_name": "superadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000001",
        "platform_role": "super_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222002",
        "email": "platformadmin@test.rawdrive.in",
        "display_name": "Platform Admin",
        "workspace_name": "platformadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000002",
        "platform_role": "platform_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222003",
        "email": "supportadmin@test.rawdrive.in",
        "display_name": "Support Admin",
        "workspace_name": "supportadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000003",
        "platform_role": "support_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222004",
        "email": "billingadmin@test.rawdrive.in",
        "display_name": "Billing Admin",
        "workspace_name": "billingadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000004",
        "platform_role": "billing_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222005",
        "email": "contentmod@test.rawdrive.in",
        "display_name": "Content Moderator",
        "workspace_name": "contentmod-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000005",
        "platform_role": "content_moderator",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222006",
        "email": "securityadmin@test.rawdrive.in",
        "display_name": "Security Admin",
        "workspace_name": "securityadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000006",
        "platform_role": "security_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222007",
        "email": "observabilityadmin@test.rawdrive.in",
        "display_name": "Observability Admin",
        "workspace_name": "observabilityadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000007",
        "platform_role": "observability_admin",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222008",
        "email": "auditor@test.rawdrive.in",
        "display_name": "Auditor",
        "workspace_name": "auditor-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000008",
        "platform_role": "auditor",
    },
    {
        "user_id": "22222222-2222-2222-2222-222222222009",
        "email": "productadmin@test.rawdrive.in",
        "display_name": "Product Admin",
        "workspace_name": "productadmin-workspace",
        "workspace_id": "22222222-2222-2222-2222-000000000009",
        "platform_role": "product_admin",
    },
]

WORKSPACE_ROLE_USERS = [
    {
        "user_id": "33333333-3333-3333-3333-333333333001",
        "email": "workspaceowner@test.rawdrive.in",
        "display_name": "Workspace Owner",
        "workspace_id": "44444444-4444-4444-4444-444444444000",
        "workspace_role": "owner",
        "existing_workspace": True,
    },
    {
        "user_id": "33333333-3333-3333-3333-333333333002",
        "email": "workspaceadmin@test.rawdrive.in",
        "display_name": "Workspace Admin",
        "workspace_id": "44444444-4444-4444-4444-444444444000",
        "workspace_role": "admin",
        "existing_workspace": True,
    },
    {
        "user_id": "33333333-3333-3333-3333-333333333003",
        "email": "staffuser@test.rawdrive.in",
        "display_name": "Staff User",
        "workspace_id": "44444444-4444-4444-4444-444444444000",
        "workspace_role": "editor",
        "existing_workspace": True,
    },
    {
        "user_id": "33333333-3333-3333-3333-333333333004",
        "email": "clientviewer@test.rawdrive.in",
        "display_name": "Client Viewer",
        "workspace_id": "44444444-4444-4444-4444-444444444000",
        "workspace_role": "viewer",
        "existing_workspace": True,
    },
]


# Default workspace roles with permissions
DEFAULT_WS_ROLES = [
    ("owner", ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"], True),
    ("admin", ["workspace:write", "members:write", "roles:write", "galleries:*", "assets:*", "billing:read", "audit:read"], True),
    ("editor", ["galleries:write", "assets:write"], True),
    ("viewer", ["galleries:read", "assets:read"], True),
]


async def create_workspace(conn, workspace_id: str, workspace_name: str, owner_user_id: str):
    """Create a workspace with default roles."""
    ws_id = UUID(workspace_id)
    
    await conn.execute(
        """
        INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (workspace_id) DO NOTHING
        """,
        ws_id,
        workspace_name,
        workspace_name.lower().replace(" ", "-"),
    )
    
    # Create default roles for the workspace
    for role_name, perms, is_system in DEFAULT_WS_ROLES:
        await conn.execute(
            """
            INSERT INTO roles (role_id, workspace_id, name, permissions, is_system, created_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
            ON CONFLICT (workspace_id, name) DO NOTHING
            """,
            ws_id,
            role_name,
            perms,
            is_system,
        )
    
    print(f"  ✓ Created workspace: {workspace_name} ({workspace_id})")


async def create_user(conn, user_data: dict, password: str = "Test@123"):
    """Create a user with deterministic UUID."""
    user_id = UUID(user_data["user_id"])
    email = user_data["email"]
    display_name = user_data["display_name"]
    
    # Check if user exists
    existing = await conn.fetchrow("SELECT user_id FROM users WHERE user_id = $1 OR email = $2", user_id, email)
    if existing:
        print(f"  ⚠ User already exists: {email}")
        # Make sure the identity exists with password
        password_hash = hash_password(password)
        await conn.execute(
            """
            INSERT INTO user_identities (identity_id, user_id, provider, email, email_verified, password_hash, created_at)
            VALUES (gen_random_uuid(), $1, 'local', $2, $3, $4, NOW())
            ON CONFLICT (provider, email) DO UPDATE SET password_hash = $4
            """,
            existing["user_id"],
            email,
            True,
            password_hash,
        )
        return existing["user_id"]
    
    # Hash password
    password_hash = hash_password(password)
    
    # Create user (no password in users table)
    await conn.execute(
        """
        INSERT INTO users (user_id, email, display_name, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        """,
        user_id,
        email,
        display_name,
        True,  # Email verified by default for test users
    )
    
    # Create local identity with password
    await conn.execute(
        """
        INSERT INTO user_identities (identity_id, user_id, provider, email, email_verified, password_hash, created_at)
        VALUES (gen_random_uuid(), $1, 'local', $2, $3, $4, NOW())
        """,
        user_id,
        email,
        True,
        password_hash,
    )
    
    print(f"  ✓ Created user: {email} ({user_id})")
    return user_id


async def assign_workspace_role(conn, user_id: UUID, workspace_id: UUID, role_name: str):
    """Assign a workspace role to a user."""
    # Create membership first
    membership_result = await conn.execute(
        """
        INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, created_at)
        VALUES (gen_random_uuid(), $1, $2, 'active', NOW())
        ON CONFLICT (workspace_id, user_id) DO NOTHING
        """,
        workspace_id,
        user_id,
    )
    
    # Get membership_id
    membership_id = await conn.fetchval(
        "SELECT membership_id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
        workspace_id,
        user_id,
    )
    
    if not membership_id:
        print(f"  ⚠ Could not find membership")
        return
    
    # Get role_id from the workspace roles
    role_id = await conn.fetchval(
        "SELECT role_id FROM roles WHERE workspace_id = $1 AND name = $2 AND is_system = true",
        workspace_id,
        role_name
    )
    
    if not role_id:
        print(f"  ⚠ Role not found: {role_name}")
        return
    
    # Assign role to membership
    await conn.execute(
        """
        INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at)
        VALUES (gen_random_uuid(), $1, $2, NOW())
        ON CONFLICT (membership_id, role_id) DO NOTHING
        """,
        membership_id,
        role_id,
    )
    print(f"  ✓ Assigned workspace role: {role_name}")


async def assign_platform_role(conn, user_id: UUID, role_name: str):
    """Assign a platform role to a user."""
    # Map role names to platform role names in the database
    role_mapping = {
        "super_admin": "super_admin",
        "platform_admin": "platform_admin",
        "support_admin": "support_admin",
        "billing_admin": "billing_admin",
        "content_moderator": "content_moderator",
        "security_admin": "security_admin",
        "observability_admin": "observability_admin",
        "auditor": "auditor",
        "product_admin": "product_admin",
    }
    
    platform_role_name = role_mapping.get(role_name)
    if not platform_role_name:
        print(f"  ⚠ Unknown platform role: {role_name}")
        return
    
    # Get role_id from platform_roles
    role_id = await conn.fetchval(
        "SELECT role_id FROM platform_roles WHERE name = $1",
        platform_role_name
    )
    
    if not role_id:
        print(f"  ⚠ Platform role not found in database: {platform_role_name}")
        return
    
    # Assign role via user_platform_roles
    await conn.execute(
        """
        INSERT INTO user_platform_roles (assignment_id, user_id, role_id, created_at)
        VALUES (gen_random_uuid(), $1, $2, NOW())
        ON CONFLICT (user_id, role_id) DO NOTHING
        """,
        user_id,
        role_id,
    )
    print(f"  ✓ Assigned platform role: {platform_role_name}")


async def create_subscription(conn, workspace_id: UUID, plan_code: str):
    """Create a trial subscription for a workspace."""
    # Get plan_id by code
    plan_id = await conn.fetchval(
        "SELECT plan_id FROM plans WHERE code = $1",
        plan_code
    )
    
    if not plan_id:
        print(f"  ⚠ Plan not found, skipping subscription: {plan_code}")
        return
    
    trial_start = datetime.utcnow()
    trial_end = trial_start + timedelta(days=30)
    
    await conn.execute(
        """
        INSERT INTO workspace_subscriptions (
            subscription_id, workspace_id, plan_id, status, 
            trial_started_at, trial_expires_at,
            current_period_start, current_period_end, created_at, updated_at
        )
        VALUES (gen_random_uuid(), $1, $2, 'trialing', $3, $4, $3, $4, NOW(), NOW())
        ON CONFLICT (workspace_id) DO UPDATE 
        SET plan_id = $2, status = 'trialing', trial_expires_at = $4, updated_at = NOW()
        """,
        workspace_id,
        plan_id,
        trial_start,
        trial_end,
    )
    print(f"  ✓ Created trial subscription: {plan_code}")


async def seed_all_users():
    """Seed all test users."""
    print("=" * 70)
    print("Seeding all test users from TEST_USERS.md")
    print("=" * 70)
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # 1. Seed Subscription Tier Users
        print("\n1. Creating Subscription Tier Test Users...")
        print("-" * 70)
        
        for user_data in SUBSCRIPTION_TIER_USERS:
            print(f"\n{user_data['email']}:")
            user_id = await create_user(conn, user_data)
            
            if not user_data.get("existing_workspace"):
                await create_workspace(
                    conn,
                    user_data["workspace_id"],
                    user_data["workspace_name"],
                    user_data["user_id"],
                )
                await assign_workspace_role(
                    conn,
                    UUID(user_data["user_id"]),
                    UUID(user_data["workspace_id"]),
                    "owner",
                )
                
                if "plan" in user_data:
                    await create_subscription(
                        conn,
                        UUID(user_data["workspace_id"]),
                        user_data["plan"],
                    )
        
        # 2. Seed Platform Admin Users
        print("\n\n2. Creating Platform Admin Test Users...")
        print("-" * 70)
        
        for user_data in PLATFORM_ADMIN_USERS:
            print(f"\n{user_data['email']}:")
            user_id = await create_user(conn, user_data)
            
            # Create their personal workspace
            await create_workspace(
                conn,
                user_data["workspace_id"],
                user_data["workspace_name"],
                user_data["user_id"],
            )
            await assign_workspace_role(
                conn,
                UUID(user_data["user_id"]),
                UUID(user_data["workspace_id"]),
                "owner",
            )
            
            # Assign platform role
            await assign_platform_role(
                conn,
                UUID(user_data["user_id"]),
                user_data["platform_role"],
            )
        
        # 3. Create shared test-roles-workspace for workspace role users
        print("\n\n3. Creating Shared Test Workspace...")
        print("-" * 70)
        
        shared_workspace_id = "44444444-4444-4444-4444-444444444000"
        first_owner = WORKSPACE_ROLE_USERS[0]
        
        print(f"\ntest-roles-workspace:")
        await create_workspace(
            conn,
            shared_workspace_id,
            "test-roles-workspace",
            first_owner["user_id"],
        )
        
        # 4. Seed Workspace Role Users
        print("\n\n4. Creating Workspace Role Test Users...")
        print("-" * 70)
        
        for user_data in WORKSPACE_ROLE_USERS:
            print(f"\n{user_data['email']}:")
            user_id = await create_user(conn, user_data)
            
            await assign_workspace_role(
                conn,
                UUID(user_data["user_id"]),
                UUID(user_data["workspace_id"]),
                user_data["workspace_role"],
            )
        
        print("\n" + "=" * 70)
        print("✅ All test users created successfully!")
        print("=" * 70)
        print("\nTest User Summary:")
        print(f"  • Subscription Tier Users: {len(SUBSCRIPTION_TIER_USERS)}")
        print(f"  • Platform Admin Users: {len(PLATFORM_ADMIN_USERS)}")
        print(f"  • Workspace Role Users: {len(WORKSPACE_ROLE_USERS)}")
        print(f"  • Total: {len(SUBSCRIPTION_TIER_USERS) + len(PLATFORM_ADMIN_USERS) + len(WORKSPACE_ROLE_USERS)}")
        print("\nAll users can log in with password: Test@123")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed_all_users())
