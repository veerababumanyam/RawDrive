"""Script to diagnose face avatar display issues.

This script checks:
1. Face groups without representative_face_id
2. Face groups with representative_face_id but missing thumbnail_urls
3. Face records without thumbnail_urls
"""

import asyncio
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from uuid import UUID
from app.db.postgres import get_postgres_pool


async def diagnose_face_avatars(workspace_id: str):
    """Diagnose face avatar issues."""
    workspace_uuid = UUID(workspace_id)

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        print("=" * 60)
        print("FACE AVATAR DIAGNOSTIC REPORT")
        print("=" * 60)
        print(f"Workspace ID: {workspace_id}\n")

        # 1. Check face groups without representative_face_id
        print("1. Face groups WITHOUT representative_face_id:")
        print("-" * 60)
        rows = await conn.fetch("""
            SELECT id, name, face_count, created_at
            FROM face_groups
            WHERE workspace_id = $1
              AND representative_face_id IS NULL
              AND face_count > 0
            ORDER BY face_count DESC
            LIMIT 10
        """, workspace_uuid)

        if rows:
            print(f"Found {len(rows)} face groups without representative face:")
            for row in rows:
                print(f"  - Group ID: {row['id']}, Name: {row['name'] or 'unnamed'}, Faces: {row['face_count']}")
            print("\n  ⚠️  These groups need a representative face set!")
        else:
            print("  ✅ All face groups have a representative_face_id")

        # 2. Check face groups with representative_face_id but face has no thumbnail_urls
        print("\n2. Face groups WITH representative_face_id but missing thumbnails:")
        print("-" * 60)
        rows = await conn.fetch("""
            SELECT fg.id as group_id, fg.name, fg.face_count,
                   fg.representative_face_id,
                   f.thumbnail_urls as rep_thumbnail_urls,
                   f.id as face_id
            FROM face_groups fg
            LEFT JOIN faces f ON fg.representative_face_id = f.id
            WHERE fg.workspace_id = $1
              AND fg.representative_face_id IS NOT NULL
              AND (f.thumbnail_urls IS NULL OR f.thumbnail_urls = '' OR f.thumbnail_urls::text = 'null'::jsonb)
            ORDER BY fg.face_count DESC
            LIMIT 10
        """, workspace_uuid)

        if rows:
            print(f"Found {len(rows)} face groups with missing thumbnails:")
            for row in rows:
                print(f"  - Group ID: {row['group_id']}, Name: {row['name'] or 'unnamed'}")
                print(f"    Representative Face ID: {row['representative_face_id']}")
                print(f"    Face thumbnail_urls: {row['rep_thumbnail_urls']}")
            print("\n  ⚠️  These representative faces need thumbnails generated!")
        else:
            print("  ✅ All representative faces have thumbnail_urls")

        # 3. Check total face counts
        print("\n3. Summary Statistics:")
        print("-" * 60)
        stats = await conn.fetchrow("""
            SELECT
                COUNT(*) as total_groups,
                COUNT(CASE WHEN representative_face_id IS NOT NULL THEN 1 END) as groups_with_rep,
                COUNT(CASE WHEN representative_face_id IS NULL THEN 1 END) as groups_without_rep
            FROM face_groups
            WHERE workspace_id = $1
        """, workspace_uuid)

        print(f"Total face groups: {stats['total_groups']}")
        print(f"Groups WITH representative_face_id: {stats['groups_with_rep']}")
        print(f"Groups WITHOUT representative_face_id: {stats['groups_without_rep']}")

        # 4. Check face records without thumbnails
        print("\n4. Face records WITHOUT thumbnail_urls:")
        print("-" * 60)
        rows = await conn.fetch("""
            SELECT COUNT(*) as total_faces,
                   COUNT(CASE WHEN thumbnail_urls IS NULL OR thumbnail_urls = '' OR thumbnail_urls::text = 'null'::jsonb THEN 1 END) as faces_without_thumbnails
            FROM faces f
            JOIN face_groups fg ON f.face_group_id = fg.id
            WHERE fg.workspace_id = $1
        """, workspace_uuid)

        print(f"Total faces in groups: {rows[0]['total_faces']}")
        print(f"Faces WITHOUT thumbnail_urls: {rows[0]['faces_without_thumbnails']}")

        if rows[0]['faces_without_thumbnails'] > 0:
            print("\n  ⚠️  Some faces don't have thumbnails - this may be due to:")
            print("     - Thumbnail generation failed during face detection")
            print("     - Old data before thumbnail generation was implemented")
            print("     - R2 storage issues")

        print("\n" + "=" * 60)
        print("DIAGNOSTIC COMPLETE")
        print("=" * 60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Diagnose face avatar issues")
    parser.add_argument("workspace_id", help="Workspace UUID to diagnose")
    args = parser.parse_args()

    asyncio.run(diagnose_face_avatars(args.workspace_id))
