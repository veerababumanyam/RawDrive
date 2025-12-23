import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import os

async def verify_db():
    url = "postgresql+asyncpg://rawdrive:rawdrive@127.0.0.1:5432/rawdrive"
    engine = create_async_engine(url)
    
    async with engine.connect() as conn:
        print("Checking tables...")
        result = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
        tables = [row[0] for row in result.fetchall()]
        
        if "visitors" in tables and "gallery_visitors" in tables:
            print("✅ Tables 'visitors' and 'gallery_visitors' exist.")
        else:
            print(f"❌ Missing tables. Found: {tables}")
            
        print("Checking columns in 'visitors'...")
        result = await conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='visitors'"))
        columns = [row[0] for row in result.fetchall()]
        required_cols = ['email', 'first_name', 'metadata']
        missing = [c for c in required_cols if c not in columns]
        
        if not missing:
            print("✅ 'visitors' table has strict schema columns.")
        else:
            print(f"❌ Missing columns in visitors: {missing}")

if __name__ == "__main__":
    asyncio.run(verify_db())
