"""Seed subscription plans into the database."""
import asyncio
import asyncpg
from uuid import UUID

DATABASE_URL = "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"

PLANS = [
    {
        "plan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001",
        "code": "free",
        "name": "Free",
        "price_monthly": 0.0,
        "price_annual": 0.0,
        "storage_bytes": 1_000_000_000,  # 1GB
        "max_galleries": 3,
        "max_clients": 5,
        "max_team_members": 3,
        "ai_credits_monthly": 50,
    },
    {
        "plan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002",
        "code": "starter",
        "name": "Starter",
        "price_monthly": 999.0,
        "price_annual": 9990.0,
        "storage_bytes": 10_000_000_000,  # 10GB
        "max_galleries": 10,
        "max_clients": 20,
        "max_team_members": 10,
        "ai_credits_monthly": 200,
    },
    {
        "plan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003",
        "code": "professional",
        "name": "Professional",
        "price_monthly": 2499.0,
        "price_annual": 24990.0,
        "storage_bytes": 100_000_000_000,  # 100GB
        "max_galleries": 50,
        "max_clients": 100,
        "max_team_members": 50,
        "ai_credits_monthly": 1000,
    },
    {
        "plan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa004",
        "code": "business",
        "name": "Business",
        "price_monthly": 4999.0,
        "price_annual": 49990.0,
        "storage_bytes": 1_000_000_000_000,  # 1TB
        "max_galleries": 200,
        "max_clients": 500,
        "max_team_members": 200,
        "ai_credits_monthly": 2500,
    },
    {
        "plan_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa005",
        "code": "enterprise",
        "name": "Enterprise",
        "price_monthly": 0.0,  # Custom pricing
        "price_annual": 0.0,
        "storage_bytes": 9_000_000_000_000_000_000,  # ~8 exabytes
        "max_galleries": 10_000,
        "max_clients": 10_000,
        "max_team_members": 10_000,
        "ai_credits_monthly": 10_000,
    },
]


async def seed_plans():
    """Seed subscription plans."""
    print("=" * 70)
    print("Seeding Subscription Plans")
    print("=" * 70)
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        for plan in PLANS:
            await conn.execute(
                """
                INSERT INTO plans (
                    plan_id, code, name, price_monthly, price_annual, currency,
                    storage_bytes, max_galleries, max_clients, max_team_members,
                    ai_credits_monthly, features, created_at
                )
                VALUES ($1, $2, $3, $4, $5, 'INR', $6, $7, $8, $9, $10, '{}'::jsonb, NOW())
                ON CONFLICT (code) DO UPDATE SET
                    name = $3,
                    price_monthly = $4,
                    price_annual = $5,
                    storage_bytes = $6,
                    max_galleries = $7,
                    max_clients = $8,
                    max_team_members = $9,
                    ai_credits_monthly = $10
                """,
                UUID(plan["plan_id"]),
                plan["code"],
                plan["name"],
                plan["price_monthly"],
                plan["price_annual"],
                plan["storage_bytes"],
                plan["max_galleries"],
                plan["max_clients"],
                plan["max_team_members"],
                plan["ai_credits_monthly"],
            )
            print(f"  ✓ {plan['name']} ({plan['code']})")
        
        print("\n" + "=" * 70)
        print(f"✅ Successfully seeded {len(PLANS)} plans")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(seed_plans())
