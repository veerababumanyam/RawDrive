#!/usr/bin/env python3
"""
Seed Test Users with Complete Workspace Setup
Creates test users with workspaces, subscriptions, memberships, and roles.

This script ensures ALL required records are created:
1. Workspaces
2. Users
3. Workspace Subscriptions (with appropriate plans)
4. Workspace Memberships
5. Roles and Permissions

Usage:
    python scripts/seed_test_users_with_subscriptions.py [--force]

Options:
    --force    Delete and recreate existing test users
"""

import asyncio
import sys
import os
import uuid
import argparse
from datetime import datetime, timedelta
from typing import Dict, List

# Add backend src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from app.core.database import get_postgres_pool


# Default workspace roles
DEFAULT_WS_ROLES = [
    ("owner", ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"], True),
    ("admin", ["workspace:write", "members:write", "roles:write", "galleries:*", "assets:*", "billing:read", "audit:read"], True),
    ("editor", ["galleries:write", "galleries:read", "assets:write", "assets:read"], True),
    ("viewer", ["galleries:read", "assets:read"], True),
]


# Test user definitions
TEST_USERS = [
    # Tier users (deterministic UUIDs)
    {
        "user_id": "11111111-1111-1111-1111-111111111001",
        "email": "free@test.rawdrive.in",
        "display_name": "Test Free User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$somehashherefortest",
        "workspace_name": "free",
        "workspace_slug": "free",
        "plan_code": "starter",
        "is_email_verified": True,
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111002",
        "email": "starter@test.rawdrive.in",
        "display_name": "Test Starter User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$somehashherefortest",
        "workspace_name": "starter",
        "workspace_slug": "starter",
        "plan_code": "starter",
        "is_email_verified": True,
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111003",
        "email": "professional@test.rawdrive.in",
        "display_name": "Test Professional User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$somehashherefortest",
        "workspace_name": "professional",
        "workspace_slug": "professional",
        "plan_code": "professional",
        "is_email_verified": True,
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111004",
        "email": "business@test.rawdrive.in",
        "display_name": "Test Business User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$somehashherefortest",
        "workspace_name": "business",
        "workspace_slug": "business",
        "plan_code": "studio",
        "is_email_verified": True,
    },
    {
        "user_id": "11111111-1111-1111-1111-111111111005",
        "email": "enterprise@test.rawdrive.in",
        "display_name": "Test Enterprise User",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$somehashherefortest",
        "workspace_name": "enterprise",
        "workspace_slug": "enterprise",
        "plan_code": "enterprise",
        "is_email_verified": True,
    },
]


async def seed_test_users(force: bool = False):
    """Seed test users with complete workspace setup."""
    pool = await get_postgres_pool()

    print("🌱 Starting test user seeding with subscriptions...\n")

    # Check if plans exist
    plans = await pool.fetch("SELECT plan_id, code, name FROM plans")
    plan_map = {row['code']: row['plan_id'] for row in plans}

    print(f"📋 Found {len(plans)} plans:")
    for plan in plans:
        print(f"  - {plan['code']}: {plan['name']}")
    print()

    # Required plans
    required_plans = ['starter', 'professional', 'enterprise', 'studio']
    missing_plans = [p for p in required_plans if p not in plan_map]

    if missing_plans:
        print(f"❌ Error: Required plans missing: {', '.join(missing_plans)}")
        print("   Please run migrations to create plans first.")
        return False

    # Process each test user
    success_count = 0
    error_count = 0

    for user_data in TEST_USERS:
        email = user_data['email']
        workspace_name = user_data['workspace_name']

        print(f"👤 Processing user: {email}")
        print(f"   Workspace: {workspace_name}")

        try:
            # Calculate deterministic workspace_id
            user_id = uuid.UUID(user_data['user_id'])
            workspace_id = uuid.uuid5(user_id, "workspace")

            print(f"   User ID: {user_id}")
            print(f"   Workspace ID: {workspace_id}")

            # Check if user exists
            existing_user = await pool.fetchrow(
                "SELECT user_id FROM users WHERE email = $1",
                email
            )

            if existing_user and not force:
                print(f"   ⚠️  User already exists (use --force to recreate)")
                continue

            if existing_user and force:
                print(f"   🗑️  Deleting existing user...")
                # Delete in correct order to respect foreign keys
                await pool.execute("DELETE FROM member_roles WHERE membership_id IN (SELECT membership_id FROM workspace_memberships WHERE user_id = $1)", user_id)
                await pool.execute("DELETE FROM workspace_memberships WHERE user_id = $1", user_id)
                await pool.execute("DELETE FROM workspace_subscriptions WHERE workspace_id = $1", workspace_id)
                await pool.execute("DELETE FROM roles WHERE workspace_id = $1", workspace_id)
                await pool.execute("DELETE FROM workspaces WHERE workspace_id = $1", workspace_id)
                await pool.execute("DELETE FROM sessions WHERE user_id = $1", user_id)
                await pool.execute("DELETE FROM users WHERE user_id = $1", user_id)

            # 1. Create Workspace
            print(f"   ✅ Creating workspace...")
            await pool.execute("""
                INSERT INTO workspaces (
                    workspace_id,
                    name,
                    slug,
                    status,
                    default_language,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, 'active', 'en-IN', NOW(), NOW())
            """, workspace_id, workspace_name, user_data['workspace_slug'])

            # 2. Create User
            print(f"   ✅ Creating user...")
            await pool.execute("""
                INSERT INTO users (
                    user_id,
                    email,
                    display_name,
                    password_hash,
                    workspace_id,
                    is_email_verified,
                    platform_role,
                    created_at,
                    updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, 'user', NOW(), NOW())
            """, user_id, email, user_data['display_name'], user_data['password_hash'],
                workspace_id, user_data['is_email_verified'])

            # 3. Create Workspace Subscription (CRITICAL!)
            plan_code = user_data['plan_code']
            plan_id = plan_map.get(plan_code)

            if not plan_id:
                print(f"   ❌ Error: Plan '{plan_code}' not found")
                error_count += 1
                continue

            print(f"   ✅ Creating subscription (plan: {plan_code})...")
            trial_end = datetime.utcnow() + timedelta(days=30)
            await pool.execute("""
                INSERT INTO workspace_subscriptions (
                    subscription_id,
                    workspace_id,
                    plan_id,
                    status,
                    trial_started_at,
                    trial_expires_at,
                    current_period_start,
                    current_period_end,
                    billing_interval,
                    currency,
                    payment_status,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    $1,
                    $2,
                    'active',
                    NOW(),
                    $3,
                    NOW(),
                    $3,
                    'monthly',
                    'INR',
                    'none',
                    NOW(),
                    NOW()
                )
            """, workspace_id, plan_id, trial_end)

            # 4. Create Workspace Roles
            print(f"   ✅ Creating workspace roles...")
            created_roles = {}
            for role_name, permissions, is_system in DEFAULT_WS_ROLES:
                role_id = uuid.uuid4()
                await pool.execute("""
                    INSERT INTO roles (
                        role_id,
                        workspace_id,
                        name,
                        permissions,
                        is_system,
                        created_at
                    ) VALUES ($1, $2, $3, $4, $5, NOW())
                """, role_id, workspace_id, role_name, permissions, is_system)
                created_roles[role_name] = role_id

            # 5. Create Workspace Membership
            print(f"   ✅ Creating workspace membership...")
            membership_id = uuid.uuid4()
            await pool.execute("""
                INSERT INTO workspace_memberships (
                    membership_id,
                    workspace_id,
                    user_id,
                    status,
                    joined_at
                ) VALUES ($1, $2, $3, 'active', NOW())
            """, membership_id, workspace_id, user_id)

            # 6. Assign Owner Role
            print(f"   ✅ Assigning owner role...")
            owner_role_id = created_roles['owner']
            await pool.execute("""
                INSERT INTO member_roles (
                    member_role_id,
                    membership_id,
                    role_id,
                    granted_at
                ) VALUES (gen_random_uuid(), $1, $2, NOW())
            """, membership_id, owner_role_id)

            print(f"   ✅ User '{email}' created successfully!\n")
            success_count += 1

        except Exception as e:
            print(f"   ❌ Error creating user '{email}': {e}\n")
            error_count += 1

    # Print summary
    print("=" * 60)
    print("📊 SEEDING SUMMARY")
    print("=" * 60)
    print(f"✅ Successfully created: {success_count} users")
    print(f"❌ Errors: {error_count}")
    print(f"📝 Total processed: {len(TEST_USERS)}")

    if success_count == len(TEST_USERS):
        print("\n✅ All test users seeded successfully!")
        return True
    else:
        print(f"\n⚠️  Seeding completed with {error_count} errors")
        return False


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description='Seed test users with subscriptions')
    parser.add_argument('--force', action='store_true', help='Delete and recreate existing test users')
    args = parser.parse_args()

    success = await seed_test_users(force=args.force)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    asyncio.run(main())
