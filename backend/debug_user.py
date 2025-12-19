
import asyncio
import asyncpg
import os

async def main():
    conn = await asyncpg.connect("postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    try:
        rows = await conn.fetch("SELECT user_id, email FROM users WHERE email = 'professional@test.rawdrive.in'")
        for row in rows:
            print(f"User: {row['user_id']} - {row['email']}")
        if not rows:
            print("No user found with that email.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
