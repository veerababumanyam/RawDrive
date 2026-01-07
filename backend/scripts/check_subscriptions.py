"""Check workspace subscriptions for test users."""
import asyncio
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import asyncpg


async def check_subscriptions():
    """Check workspace subscriptions."""
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

    # Remove asyncpg scheme if present
    database_url = database_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(database_url)

    try:
        # Check test users' workspace subscriptions
        print("\n=== Workspace Subscriptions for Test Users ===")
        rows = await conn.fetch("""
            SELECT
                u.email,
                w.workspace_id,
                w.name as workspace_name,
                ws.subscription_id,
                ws.status as subscription_status,
                p.code as plan_code,
                p.name as plan_name,
                ws.trial_expires_at,
                ws.current_period_end
            FROM users u
            JOIN workspace_memberships wm ON u.user_id = wm.user_id
            JOIN workspaces w ON wm.workspace_id = w.workspace_id
            LEFT JOIN workspace_subscriptions ws ON w.workspace_id = ws.workspace_id
            LEFT JOIN plans p ON ws.plan_id = p.plan_id
            WHERE u.email LIKE '%test.rawdrive.in'
            ORDER BY u.email;
        """)

        for row in rows:
            print(f"\nUser: {row['email']}")
            print(f"  Workspace: {row['workspace_name']} ({row['workspace_id']})")
            print(f"  Subscription ID: {row['subscription_id']}")
            print(f"  Subscription Status: {row['subscription_status']}")
            print(f"  Plan: {row['plan_name']} ({row['plan_code']})")
            print(f"  Trial Expires: {row['trial_expires_at']}")
            print(f"  Period End: {row['current_period_end']}")

        # Check if plans table has data
        print("\n\n=== Available Plans ===")
        plans = await conn.fetch("SELECT plan_id, code, name FROM plans ORDER BY code;")
        for plan in plans:
            print(f"  {plan['code']}: {plan['name']} (plan_id: {plan['plan_id']})")

        if not plans:
            print("  No plans found!")

        # Summary
        missing_subscriptions = sum(1 for row in rows if row['subscription_id'] is None)
        print(f"\n\n=== Summary ===")
        print(f"Workspaces checked: {len(rows)}")
        print(f"Missing subscriptions: {missing_subscriptions}")
        print(f"Available plans: {len(plans)}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(check_subscriptions())
