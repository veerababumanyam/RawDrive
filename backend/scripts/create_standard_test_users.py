"""Create standard test users with proper workspace setup.

Creates test users matching the expected schema in TEST_USERS_COMPLETE.md
with deterministic UUIDs, workspaces, subscriptions, and roles.

Usage:
    docker exec rawdrive-backend python scripts/create_standard_test_users.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4, uuid5

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg
from app.utils.security import hash_password
from app.config.settings import get_settings


# Test users with deterministic UUIDs
TEST_USERS = [
    {
        "user_id": "11111111-1111-1111-1111-111111111001",
        "email": "free@test.rawdrive.in",
        "display_name": "Test Free User",
        "plan_code": "free",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111002",
        "email": "starter@test.rawdrive.in",
        "display_name": "Test Starter User",
        "plan_code": "starter",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111003",
        "email": "professional@test.rawdrive.in",
        "display_name": "Test Professional User",
        "plan_code": "professional",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111004",
        "email": "business@test.rawdrive.in",
        "display_name": "Test Business User",
        "plan_code": "studio",
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111005",
        "email": "enterprise@test.rawdrive.in",
        "display_name": "Test Enterprise User",
        "plan_code": "enterprise",
    },
]

DEFAULT_ROLES = [
    ("owner", [
        "workspace:*", "galleries:*", "assets:*",
        "members:*", "roles:*", "billing:*", "audit:read"
    ]),
    ("admin", [
        "workspace:write", "galleries:*", "assets:*",
        "members:write", "members:invite", "roles:write", "billing:read", "audit:read"
    ]),
    ("editor", [
        "galleries:read", "galleries:write", "assets:read", "assets:write"
    ]),
    ("viewer", [
        "galleries:read", "assets:read"
    ]),
]


async def create_test_users():
    """Create test users with complete workspace setup."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        print("\n" + "="*80)
        print(" CREATING STANDARD TEST USERS")
        print("="*80 + "\n")

        # Hash password for all test users
        settings = get_settings()
        password_hash = hash_password("Test@123", settings)

        # Get available plans
        plans = await conn.fetch("SELECT plan_id, code FROM plans")
        plan_map = {p['code']: p['plan_id'] for p in plans}

        print(f"Available plans: {', '.join(plan_map.keys())}\n")

        for user_data in TEST_USERS:
            email = user_data['email']
            user_id = UUID(user_data['user_id'])
            workspace_id = uuid5(user_id, "workspace")
            plan_code = user_data['plan_code']

            print(f"Creating user: {email}")
            print(f"  User ID: {user_id}")
            print(f"  Workspace ID: {workspace_id}")
            print(f"  Plan: {plan_code}")

            # Check if plan exists
            plan_id = plan_map.get(plan_code)
            if not plan_id:
                print(f"  ❌ Plan '{plan_code}' not found, skipping")
                continue

            # Check if user exists
            existing = await conn.fetchrow("SELECT user_id FROM users WHERE email = $1", email)
            if existing:
                print(f"  ⚠️  User already exists, skipping")
                continue

            now = datetime.now(timezone.utc)
            trial_end = now + timedelta(days=30)

            async with conn.transaction():
                # 1. Create workspace
                await conn.execute("""
                    INSERT INTO workspaces (workspace_id, name, slug, status, created_at, updated_at)
                    VALUES ($1, $2, $3, 'active', $4, $4)
                """,
                    workspace_id,
                    f"{user_data['display_name']}'s Workspace",
                    email.split('@')[0],  # Use email prefix as slug
                    now
                )

                # 2. Create subscription
                await conn.execute("""
                    INSERT INTO workspace_subscriptions (
                        subscription_id, workspace_id, plan_id, status,
                        trial_started_at, trial_expires_at, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, 'trialing', $4, $5, $4, $4)
                """,
                    uuid4(),
                    workspace_id,
                    plan_id,
                    now,
                    trial_end
                )

                # 3. Create user
                await conn.execute("""
                    INSERT INTO users (user_id, email, display_name, email_verified, created_at, updated_at)
                    VALUES ($1, $2, $3, TRUE, $4, $4)
                """,
                    user_id,
                    email,
                    user_data['display_name'],
                    now
                )

                # 4. Create local identity
                await conn.execute("""
                    INSERT INTO user_identities (
                        identity_id, user_id, provider, email, password_hash, email_verified, created_at
                    )
                    VALUES ($1, $2, 'local', $3, $4, TRUE, $5)
                """,
                    uuid4(),
                    user_id,
                    email,
                    password_hash,
                    now
                )

                # 5. Create workspace membership
                membership_id = uuid4()
                await conn.execute("""
                    INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status, accepted_at, created_at)
                    VALUES ($1, $2, $3, 'active', $4, $4)
                """,
                    membership_id,
                    workspace_id,
                    user_id,
                    now
                )

                # 6. Create default roles
                created_roles = {}
                for role_name, permissions in DEFAULT_ROLES:
                    role_id = uuid4()
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
                    created_roles[role_name] = role_id

                # 7. Assign owner role to user
                await conn.execute("""
                    INSERT INTO member_roles (member_role_id, membership_id, role_id, granted_at)
                    VALUES ($1, $2, $3, $4)
                """,
                    uuid4(),
                    membership_id,
                    created_roles['owner'],
                    now
                )

            print(f"  ✅ Created successfully\n")

        print("="*80)
        print(" COMPLETED")
        print("="*80 + "\n")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(create_test_users())
