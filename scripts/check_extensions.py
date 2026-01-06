#!/usr/bin/env python3
"""Check available PostgreSQL extensions."""
import asyncio
import asyncpg
import os

async def main():
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
    ).replace("postgresql+asyncpg://", "postgresql://")
    
    print(f"Connecting to: {url}")
    conn = await asyncpg.connect(url)
    
    # Check available extensions
    rows = await conn.fetch("""
        SELECT name, default_version 
        FROM pg_available_extensions 
        WHERE name IN ('vector', 'vectorscale', 'timescaledb')
        ORDER BY name
    """)
    
    print("\n=== Available Extensions ===")
    for r in rows:
        print(f"  {r['name']}: {r['default_version']}")
    
    if not any(r['name'] == 'vectorscale' for r in rows):
        print("\n⚠️  pgvectorscale is NOT available!")
        print("   You need to use timescale/timescaledb-ha Docker image")
    
    # Check enabled extensions
    rows = await conn.fetch("""
        SELECT extname, extversion 
        FROM pg_extension 
        WHERE extname IN ('vector', 'vectorscale', 'timescaledb')
        ORDER BY extname
    """)
    
    print("\n=== Enabled Extensions ===")
    for r in rows:
        print(f"  {r['extname']}: {r['extversion']}")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
