from __future__ import annotations

import asyncio
import os
import uuid
from dataclasses import dataclass
from typing import Iterable

import asyncpg
from argon2 import PasswordHasher

from app.config.test_constants import (
    TEST_PASSWORD,
    AdminUsers,
    TierUsers,
    WorkspaceUsers,
)

# Use centralized password constant
PASSWORD = TEST_PASSWORD

ph = PasswordHasher(memory_cost=65536, time_cost=3, parallelism=4)


@dataclass(frozen=True)
class Plan:
    plan_id: uuid.UUID
    code: str
    name: str
    price_monthly: float
    price_annual: float
    storage_bytes: int
    max_galleries: int
    max_clients: int
    max_team_members: int
    ai_credits_monthly: int


PLANS: list[Plan] = [
    Plan(uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001"), "free", "Free", 0.0, 0.0, 1_000_000_000, 3, 5, 3, 50),
    Plan(uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002"), "starter", "Starter", 999.0, 9990.0, 10_000_000_000, 10, 20, 10, 200),
    Plan(uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003"), "professional", "Professional", 2499.0, 24990.0, 100_000_000_000, 50, 100, 50, 1000),
    Plan(uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa004"), "business", "Business", 4999.0, 49990.0, 1_000_000_000_000, 200, 500, 200, 2500),
    Plan(uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa005"), "enterprise", "Enterprise", 0.0, 0.0, 9_000_000_000_000_000_000, 10_000, 10_000, 10_000, 10_000),
]

PLATFORM_ROLES = [
    ("super_admin", ["platform:admins:write", "platform:admins:read", "platform:workspaces:read", "platform:config:write", "platform:audit:read"]),
    ("platform_admin", ["platform:admins:read", "platform:workspaces:read", "platform:billing:read", "platform:feature_flags:write"]),
    ("support_admin", ["platform:support_access:start", "platform:support_access:stop", "platform:workspaces:read"]),
    ("billing_admin", ["platform:billing:read", "platform:billing:write"]),
    ("finance_admin", ["platform:billing:read", "platform:billing:write", "platform:finance:read", "platform:finance:write", "platform:invoices:read", "platform:invoices:write", "platform:refunds:write"]),
    ("content_moderator", ["platform:moderation:read", "platform:moderation:write"]),
    ("security_admin", ["platform:observability:read", "platform:config:write", "platform:audit:read"]),
    ("observability_admin", ["platform:observability:read"]),
    ("auditor_readonly", ["platform:audit:read"]),
    ("product_admin", ["platform:feature_flags:write", "platform:feature_flags:read"]),
]

# Use centralized test user definitions (converted to tuple format for seeding)
TIER_USERS = [user.as_tuple() for user in TierUsers.all()]

ADMIN_USERS = [user.as_tuple() for user in AdminUsers.all()]

WORKSPACE_ROLE_USERS = [user.as_tuple() for user in WorkspaceUsers.all()]

DEFAULT_WS_ROLES = [
    ("owner", ["workspace:*", "members:*", "roles:*", "galleries:*", "assets:*", "billing:*", "audit:read"], True),
    ("admin", ["workspace:write", "members:write", "roles:write", "galleries:*", "assets:*", "billing:read", "audit:read"], True),
    ("editor", ["galleries:write", "galleries:read", "assets:write", "assets:read"], True),
    ("viewer", ["galleries:read", "assets:read"], True),
]


def chunks(iterable: Iterable, size: int):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) == size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def hash_password(password: str) -> str:
    return ph.hash(password)


async def seed_plans(conn: asyncpg.Connection):
    for plan in PLANS:
        await conn.execute(
            """
            INSERT INTO plans (
                plan_id, code, name, price_monthly, price_annual, currency, storage_bytes,
                max_galleries, max_clients, max_team_members, ai_credits_monthly, features
            ) VALUES ($1,$2,$3,$4,$5,'INR',$6,$7,$8,$9,$10,'{}')
            ON CONFLICT (code) DO NOTHING;
            """,
            plan.plan_id,
            plan.code,
            plan.name,
            plan.price_monthly,
            plan.price_annual,
            plan.storage_bytes,
            plan.max_galleries,
            plan.max_clients,
            plan.max_team_members,
            plan.ai_credits_monthly,
        )


aSYNC_ROLES_INSERT = """
INSERT INTO platform_roles (role_id, name, permissions, is_system)
VALUES ($1, $2, $3, TRUE)
ON CONFLICT (name) DO NOTHING;
"""


async def seed_platform_roles(conn: asyncpg.Connection):
    for name, perms in PLATFORM_ROLES:
        await conn.execute(aSYNC_ROLES_INSERT, uuid.uuid4(), name, perms)


async def seed_user(conn: asyncpg.Connection, user_id: uuid.UUID, email: str, display: str) -> uuid.UUID:
    # Try to insert
    await conn.execute(
        """
        INSERT INTO users (user_id, email, display_name, email_verified, email_verified_at)
        VALUES ($1, $2, $3, TRUE, NOW())
        ON CONFLICT (email) DO NOTHING;
        """,
        user_id,
        email,
        display,
    )
    
    # Fetch the actual user_id (whether it was just inserted or already existed)
    actual_user_id = await conn.fetchval("SELECT user_id FROM users WHERE email = $1", email)
    
    # Ensure identity exists
    await conn.execute(
        """
        INSERT INTO user_identities (identity_id, user_id, provider, email, email_verified, password_hash)
        VALUES (gen_random_uuid(), $1, 'local', $2, TRUE, $3)
        ON CONFLICT (provider, email) DO NOTHING;
        """,
        actual_user_id,
        email,
        hash_password(PASSWORD),
    )
    
    return actual_user_id


async def seed_workspace_with_roles(conn: asyncpg.Connection, workspace_id: uuid.UUID, name: str, slug: str, owner_user_id: uuid.UUID, plan_code: str):
    await conn.execute(
        """
        INSERT INTO workspaces (workspace_id, name, slug, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (slug) DO NOTHING;
        """,
        workspace_id,
        name,
        slug,
    )
    
    # Fetch actual workspace_id
    actual_workspace_id = await conn.fetchval("SELECT workspace_id FROM workspaces WHERE slug = $1", slug)
    
    # Create membership (or skip) using actual_workspace_id
    await conn.execute(
        """
        INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status)
        VALUES (gen_random_uuid(), $1, $2, 'active')
        ON CONFLICT (workspace_id, user_id) DO NOTHING;
        """,
        actual_workspace_id,
        owner_user_id,
    )
    
    # Fetch actual membership ID
    membership_id = await conn.fetchval(
        "SELECT membership_id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
        actual_workspace_id,
        owner_user_id,
    )

    role_ids = {}
    for role_name, perms, is_system in DEFAULT_WS_ROLES:
        role_id = uuid.uuid4()
        role_ids[role_name] = role_id
        await conn.execute(
            """
            INSERT INTO roles (role_id, workspace_id, name, permissions, is_system)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (workspace_id, name) DO NOTHING;
            """,
            role_id,
            actual_workspace_id,
            role_name,
            perms,
            is_system,
        )

    owner_role_id = role_ids.get("owner")
    if owner_role_id and membership_id:
        # We need to fetch the actual role ID too as it might exist
        actual_owner_role_id = await conn.fetchval(
            "SELECT role_id FROM roles WHERE workspace_id = $1 AND name = 'owner'",
            actual_workspace_id,
        )
        
        if actual_owner_role_id:
            await conn.execute(
                """
                INSERT INTO member_roles (member_role_id, membership_id, role_id)
                VALUES (gen_random_uuid(), $1, $2)
                ON CONFLICT (membership_id, role_id) DO NOTHING;
                """,
                membership_id,
                actual_owner_role_id,
            )

    plan = next(p for p in PLANS if p.code == plan_code)
    await conn.execute(
        """
        INSERT INTO workspace_subscriptions (
            subscription_id, workspace_id, plan_id, status, trial_started_at, trial_expires_at
        ) VALUES (gen_random_uuid(), $1, $2, 'trialing', NOW(), NOW() + INTERVAL '30 days')
        ON CONFLICT (workspace_id) DO NOTHING;
        """,
        actual_workspace_id,
        plan.plan_id,
    )


async def seed_tier_users(conn: asyncpg.Connection):
    for user_id, email, name, plan_code in TIER_USERS:
        actual_user_id = await seed_user(conn, user_id, email, name)
        workspace_id = uuid.uuid5(actual_user_id, "workspace")
        slug = email.split("@")[0]
        await seed_workspace_with_roles(conn, workspace_id, f"{name} Workspace", slug, actual_user_id, plan_code)


async def seed_admin_users(conn: asyncpg.Connection):
    for user_id, email, name, role_name in ADMIN_USERS:
        actual_user_id = await seed_user(conn, user_id, email, name)
        await conn.execute(
            """
            INSERT INTO user_platform_roles (assignment_id, user_id, role_id)
            SELECT gen_random_uuid(), $1, pr.role_id FROM platform_roles pr WHERE pr.name = $2
            ON CONFLICT (user_id, role_id) DO NOTHING;
            """,
            actual_user_id,
            role_name,
        )


async def seed_workspace_role_users(conn: asyncpg.Connection):
    # create a shared workspace for role testing
    ws_id = uuid.UUID("44444444-4444-4444-4444-444444444000")
    owner_user_id_static = WORKSPACE_ROLE_USERS[0][0]
    owner_user_id = await seed_user(conn, owner_user_id_static, WORKSPACE_ROLE_USERS[0][1], WORKSPACE_ROLE_USERS[0][2])
    await seed_workspace_with_roles(conn, ws_id, "Test Roles Workspace", "test-roles-workspace", owner_user_id, "starter")

    # map role names
    role_lookup = {"owner": "owner", "admin": "admin", "editor": "editor", "viewer": "viewer"}

    for user_id_static, email, name, role_key in WORKSPACE_ROLE_USERS[1:]:
        actual_user_id = await seed_user(conn, user_id_static, email, name)
        # ensure membership exists
        await conn.execute(
            """
            INSERT INTO workspace_memberships (membership_id, workspace_id, user_id, status)
            VALUES (gen_random_uuid(), $1, $2, 'active')
            ON CONFLICT (workspace_id, user_id) DO NOTHING;
            """,
            ws_id,
            actual_user_id,
        )
        
        membership_id = await conn.fetchval(
            "SELECT membership_id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2",
            ws_id,
            actual_user_id
        )

        # assign role if membership exists
        if membership_id:
            await conn.execute(
                """
                INSERT INTO member_roles (member_role_id, membership_id, role_id)
                SELECT gen_random_uuid(), $1, r.role_id FROM roles r
                WHERE r.workspace_id = $2 AND r.name = $3
                ON CONFLICT (membership_id, role_id) DO NOTHING;
                """,
                membership_id,
                ws_id,
                role_lookup.get(role_key, role_key),
            )


async def main():
    database_url = os.getenv("DATABASE_URL", "postgresql+asyncpg://rawdrive:rawdrive@localhost:5432/rawdrive")
    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    conn = await asyncpg.connect(database_url)
    try:
        await seed_plans(conn)
        await seed_platform_roles(conn)
        await seed_tier_users(conn)
        await seed_admin_users(conn)
        await seed_workspace_role_users(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
