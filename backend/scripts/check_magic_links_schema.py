"""Check if magic_links table has all required columns.

This script verifies that all migrations have been run and the table
has the expected schema for magic link creation.
"""

import asyncio
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.postgres import init_postgres_pool, get_postgres_pool
from app.config.settings import get_settings


async def check_schema():
    """Check if magic_links table has all required columns."""
    settings = get_settings()
    await init_postgres_pool(settings)
    pool = await get_postgres_pool()
    
    async with pool.acquire() as conn:
        # Check if table exists
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'magic_links'
            );
        """)
        
        if not table_exists:
            print("❌ ERROR: magic_links table does not exist!")
            print("   Run migrations: alembic upgrade head")
            return False
        
        print("✅ magic_links table exists")
        
        # Get all columns
        columns = await conn.fetch("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' 
            AND table_name = 'magic_links'
            ORDER BY ordinal_position;
        """)
        
        print(f"\n📋 Current columns ({len(columns)}):")
        column_names = set()
        for col in columns:
            nullable = "NULL" if col['is_nullable'] == 'YES' else "NOT NULL"
            print(f"   - {col['column_name']}: {col['data_type']} ({nullable})")
            column_names.add(col['column_name'])
        
        # Required columns for the INSERT statement
        required_columns = {
            'link_id', 'workspace_id', 'gallery_id', 'token_hash',
            'target_type', 'target_id', 'album_title', 'label',
            'expires_at', 'max_accesses', 'qr_config', 'created_by_user_id',
            'public_url', 'invitation_id', 'status', 'access_count',
            'created_at', 'updated_at'
        }
        
        print(f"\n🔍 Checking required columns ({len(required_columns)}):")
        missing = required_columns - column_names
        extra = column_names - required_columns
        
        if missing:
            print(f"\n❌ MISSING COLUMNS ({len(missing)}):")
            for col in sorted(missing):
                print(f"   - {col}")
            print("\n💡 SOLUTION: Run missing migrations:")
            if 'album_title' in missing:
                print("   - Migration 0056: Add album_title column")
            if 'public_url' in missing:
                print("   - Migration 0053: Add public_url column")
            if 'invitation_id' in missing:
                print("   - Migration 0079: Add invitation_id column")
            print("\n   Run: alembic upgrade head")
            return False
        
        if extra:
            print(f"\n⚠️  EXTRA COLUMNS ({len(extra)}):")
            for col in sorted(extra):
                print(f"   - {col}")
        
        print("\n✅ All required columns exist!")
        return True


if __name__ == "__main__":
    try:
        result = asyncio.run(check_schema())
        sys.exit(0 if result else 1)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
