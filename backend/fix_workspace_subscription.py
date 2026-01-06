import asyncio
import asyncpg
import os
from uuid import UUID

# Use the same connection string as seed_all_test_users.py
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")

async def fix_subscription():
    print(f"Connecting to {DATABASE_URL}...")
    try:
        conn = await asyncpg.connect(DATABASE_URL)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    try:
        print("Connected. Fetching Business plan...")
        # Get plan ID for business
        plan_id = await conn.fetchval("SELECT plan_id FROM plans WHERE code = 'business'")
        if not plan_id:
            print("Business plan not found! Falling back to 'free' plan.")
            plan_id = await conn.fetchval("SELECT plan_id FROM plans WHERE code = 'free'")
            if not plan_id:
                print("No plans found at all!")
                return

        workspace_id = UUID('11111111-1111-1111-1111-111111111004')

        print(f"Fixing subscription for workspace {workspace_id} with plan {plan_id}...")

        # Insert subscription
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
            VALUES (
                gen_random_uuid(),
                $1,
                $2,
                'active',
                NOW(),
                NOW() + INTERVAL '30 days',
                NOW(),
                NOW()
            )
            ON CONFLICT (workspace_id) DO UPDATE SET 
                plan_id = $2,
                status = 'active',
                updated_at = NOW()
        """, workspace_id, plan_id)
        print("Subscription fixed successfully!")

    except Exception as e:
        print(f"Error executing fix: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(fix_subscription())
