
import asyncio
import asyncpg
import os

async def main():
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    if database_url.startswith("postgresql+asyncpg://"):
        database_url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    
    print(f"Connecting to {database_url}")
    conn = await asyncpg.connect(database_url)
    try:
        print("Dropping schema public...")
        await conn.execute("DROP SCHEMA public CASCADE")
        print("Creating schema public...")
        await conn.execute("CREATE SCHEMA public")
        print("Granting permissions...")
        await conn.execute("GRANT ALL ON SCHEMA public TO rawdrive")
        await conn.execute("GRANT ALL ON SCHEMA public TO public")
        print("Database reset complete.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
