import asyncio
import asyncpg
import os

async def main():
    print("Setting up database...")
    # Try connecting as current user to 'postgres' db
    # We might need to guess the superuser. On Mac it's often the output of `whoami` or 'postgres'
    user = os.environ.get("USER", "postgres")
    try:
        print(f"Connecting to postgres as {user}...")
        conn = await asyncpg.connect(user=user, database="postgres", host="localhost")
    except Exception:
        print("Failed to connect as current user, trying 'postgres'...")
        try:
             conn = await asyncpg.connect(user="postgres", database="postgres", host="localhost")
        except Exception as e:
            print(f"Could not connect to postgres: {e}")
            return

    try:
        # Check user
        exists = await conn.fetchval("SELECT 1 FROM pg_roles WHERE rolname='rawdrive'")
        if not exists:
            print("Creating user 'rawdrive'...")
            await conn.execute("CREATE USER rawdrive WITH PASSWORD 'rawdrive'")
            await conn.execute("ALTER USER rawdrive CREATEDB")
        else:
            print("User 'rawdrive' already exists.")

        # Check db
        # asyncpg cannot run CREATE DATABASE inside a transaction block, and by default it might behave oddly? 
        # actually asyncpg .execute is implicit transaction? No. But CREATE DATABASE cannot be run in transaction.
        # We need independent isolation level or plain execute?
        # asyncpg doesn't support autocommit directly for this?
        # We can check existence first.
        
        exists_db = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname='rawdrive'")
        if not exists_db:
            print("Creating database 'rawdrive'...")
            # We must close connection and re-connect with correct isolation or use a trick?
            # Actually asyncpg manual says:
            # CREATE DATABASE cannot be executed inside a transaction block.
            await conn.close()
            
            # Connect to template1 to create db?
            # Or use sys connection.
            # to run CREATE DATABASE we need autocommit.
            # In asyncpg, we just don't start transaction. explicit_transaction?
            # No, 'execute' is safe unless we are IN a transaction.
            # But asyncpg might wrap?
            
            # Let's try simpler:
            # We will use this script to just create the USER.
            # Then the USER can create the DB if we connect as him?
            
            # Let's re-connect
            conn = await asyncpg.connect(user=user, database="postgres", host="localhost")
            try:
                await conn.execute("CREATE DATABASE rawdrive OWNER rawdrive")
            except Exception as e:
                print(f"Error creating DB (might exist or permisssion): {e}")

        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
