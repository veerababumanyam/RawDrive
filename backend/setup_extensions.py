import asyncio
import asyncpg
import os

async def main():
    print("Setting up extensions...")
    user = os.environ.get("USER", "postgres")
    try:
        print(f"Connecting to rawdrive as {user}...")
        # We assume 'rawdrive' db exists now
        conn = await asyncpg.connect(user=user, database="rawdrive", host="localhost")
        
        print("Creating extension 'vector'...")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        print("Extension 'vector' created.")
        
    except Exception as e:
        print(f"Failed to create extension: {e}")
        # Try as 'postgres' user
        if user != 'postgres':
             try:
                print("Retrying as 'postgres' user...")
                conn = await asyncpg.connect(user="postgres", database="rawdrive", host="localhost")
                await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                print("Extension 'vector' created.")
             except Exception as e2:
                 print(f"Failed again: {e2}")

    finally:
        if 'conn' in locals():
            await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
