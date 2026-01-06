#!/usr/bin/env python3
"""
Install pgvectorscale on Windows PostgreSQL.

pgvectorscale requires:
- PostgreSQL 15 or 16
- pgvector extension (already installed)
- Windows x64

Installation steps:
1. Download pgvectorscale Windows binary from GitHub releases
2. Copy DLL to PostgreSQL lib folder
3. Copy SQL files to PostgreSQL share/extension folder
4. Run CREATE EXTENSION vectorscale;
"""
import asyncio
import asyncpg
import os
import sys
import urllib.request
import zipfile
import shutil
from pathlib import Path

PGVECTORSCALE_VERSION = "0.4.0"
GITHUB_RELEASE_URL = f"https://github.com/timescale/pgvectorscale/releases/download/{PGVECTORSCALE_VERSION}"

async def get_pg_info():
    """Get PostgreSQL installation info."""
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
    ).replace("postgresql+asyncpg://", "postgresql://")
    
    conn = await asyncpg.connect(url)
    
    # Get version
    version = await conn.fetchval("SHOW server_version;")
    major_version = int(version.split('.')[0])
    
    # Get lib dir
    lib_dir = await conn.fetchval("SHOW dynamic_library_path;")
    
    # Get share dir
    share_dir = await conn.fetchval("SELECT pg_config('sharedir');")
    
    await conn.close()
    
    return {
        "version": version,
        "major_version": major_version,
        "lib_dir": lib_dir,
        "share_dir": share_dir
    }

async def enable_extension():
    """Enable pgvectorscale extension."""
    url = os.environ.get(
        "DATABASE_URL",
        "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
    ).replace("postgresql+asyncpg://", "postgresql://")
    
    conn = await asyncpg.connect(url)
    
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;")
        print("✅ pgvectorscale extension enabled!")
    except Exception as e:
        print(f"❌ Failed to enable extension: {e}")
    
    await conn.close()

async def main():
    print("=" * 60)
    print("pgvectorscale Installation Helper")
    print("=" * 60)
    
    info = await get_pg_info()
    print(f"\nPostgreSQL Version: {info['version']}")
    print(f"Major Version: {info['major_version']}")
    print(f"Library Path: {info['lib_dir']}")
    print(f"Share Dir: {info['share_dir']}")
    
    if info['major_version'] < 15:
        print("\n❌ pgvectorscale requires PostgreSQL 15+")
        sys.exit(1)
    
    print("\n" + "=" * 60)
    print("Installation Instructions")
    print("=" * 60)
    
    print(f"""
pgvectorscale is not available as a pre-built Windows binary.

RECOMMENDED: Use Docker with timescale/timescaledb-ha:pg16

Steps:
1. Install Docker Desktop for Windows
2. Run: docker compose -f infrastructure/docker/docker-compose.yml up -d postgres
3. Update .env to use Docker PostgreSQL:
   DATABASE_URL=postgresql://rawdrive:rawdrive@localhost:5432/rawdrive
4. Run migrations: cd backend && alembic upgrade head

The Docker image timescale/timescaledb-ha:pg16 includes:
- PostgreSQL 16
- pgvector (vector similarity search)
- pgvectorscale (DiskANN indexes)
- TimescaleDB (time-series)
""")

if __name__ == "__main__":
    asyncio.run(main())
