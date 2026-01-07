"""Fix test user workspaces by creating subscriptions."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


async def fix_subscriptions():
    """Create workspace subscriptions for test users."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

    # Remove asyncpg scheme if present
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        # Get test users and their workspaces
        print("\n=== Fixing Test User Subscriptions ===")
        rows = await conn.fetch("""
            SELECT
                u.user_id,
                u.email,
                w.workspace_id,
                w.name as workspace_name
            FROM users u
            JOIN workspace_memberships wm ON u.user_id = wm.user_id
            JOIN workspaces w ON wm.workspace_id = w.workspace_id
            WHERE u.email LIKE '%test.rawdrive.in'
            ORDER BY u.email;
        """)

        # Get starter plan ID
        starter_plan = await conn.fetchrow("SELECT plan_id, trial_days FROM plans WHERE code = 'starter';")

        if not starter_plan:
            print("ERROR: Starter plan not found!")
            return

        plan_id = starter_plan['plan_id']
        trial_days = starter_plan['trial_days'] or 14

        print(f"\nUsing plan: starter (plan_id: {plan_id}, trial_days: {trial_days})")

        now = datetime.now(timezone.utc)
        trial_expires = now + timedelta(days=trial_days)

        for row in rows:
            user_id = row['user_id']
            workspace_id = row['workspace_id']
            email = row['email']
            workspace_name = row['workspace_name']

            # Check if subscription already exists
            existing = await conn.fetchval(
                "SELECT subscription_id FROM workspace_subscriptions WHERE workspace_id = $1",
                workspace_id
            )

            if existing:
                print(f"\n✓ {email}: Subscription already exists ({existing})")
                continue

            # Create subscription
            subscription_id = uuid4()

            await conn.execute("""
                INSERT INTO workspace_subscriptions (
                    subscription_id,
                    workspace_id,
                    plan_id,
                    status,
                    trial_started_at,
                    trial_expires_at,
                    created_at,
                    updated_at
                )
                VALUES ($1, $2, $3, 'trialing', $4, $5, $6, $6)
            """,
                subscription_id,
                workspace_id,
                plan_id,
                now,
                trial_expires,
                now
            )

            print(f"\n✓ {email}: Created subscription")
            print(f"  Workspace: {workspace_name}")
            print(f"  Subscription ID: {subscription_id}")
            print(f"  Status: trialing")
            print(f"  Trial expires: {trial_expires.isoformat()}")

        print(f"\n\n=== Summary ===")
        print(f"Processed {len(rows)} workspaces")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(fix_subscriptions())
