
import asyncio
import os
import asyncpg

async def check_schema():
    database_url = os.getenv("DATABASE_URL", "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive")
    conn = await asyncpg.connect(database_url)
    try:
        # Check for asset_embeddings table
        tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_name = 'asset_embeddings'")
        has_embeddings = len(tables) > 0
        print(f"Has asset_embeddings table: {has_embeddings}")


        # List all columns for face_detection_results
        print("\nColumns in face_detection_results:")
        columns_fdr = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'face_detection_results'")
        for r in columns_fdr:
            print(f" - {r['column_name']}")

        # List all columns for asset_analysis
        print("\nColumns in asset_analysis:")
        columns_aa = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'asset_analysis'")
        for r in columns_aa:
            print(f" - {r['column_name']}")


    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_schema())
