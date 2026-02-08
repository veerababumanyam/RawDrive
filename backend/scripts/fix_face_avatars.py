"""Script to fix face avatar display issues.

This script:
1. Sets representative_face_id for face groups that don't have one
2. Generates thumbnail_urls for faces that are missing them
"""

import asyncio
import logging
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from uuid import UUID
from app.db.postgres import get_postgres_pool
from app.services.face_thumbnail_service import get_face_thumbnail_service
from app.services.r2_storage_service import get_r2_storage_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def set_representative_faces_for_workspace(workspace_id: str, dry_run: bool = False):
    """Set representative_face_id for face groups that don't have one.

    Strategy: Pick the first face in the group (with highest confidence if available)
    """
    workspace_uuid = UUID(workspace_id)

    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        # Get face groups without representative_face_id
        groups = await conn.fetch("""
            SELECT fg.id, fg.name, fg.face_count,
                   (SELECT f.id
                    FROM faces f
                    WHERE f.face_group_id = fg.id
                    ORDER BY f.confidence DESC, f.created_at ASC
                    LIMIT 1
                   ) as candidate_face_id
            FROM face_groups fg
            WHERE fg.workspace_id = $1
              AND fg.representative_face_id IS NULL
              AND fg.face_count > 0
        """, workspace_uuid)

        if not groups:
            print("No face groups need representative face set.")
            return 0

        print(f"Found {len(groups)} face groups without representative face")

        updated = 0
        for group in groups:
            group_id = group['id']
            candidate_face_id = group['candidate_face_id']

            if not candidate_face_id:
                print(f"  ⚠️  Group {group_id} ({group['name'] or 'unnamed'}) has no faces - skipping")
                continue

            if dry_run:
                print(f"  [DRY RUN] Would set face {candidate_face_id} as representative for group {group_id}")
            else:
                await conn.execute("""
                    UPDATE face_groups
                    SET representative_face_id = $2,
                        updated_at = NOW()
                    WHERE id = $1
                """, group_id, candidate_face_id)
                print(f"  ✓ Set face {candidate_face_id} as representative for group {group_id}")

            updated += 1

        print(f"\nUpdated {updated} face groups with representative faces")
        return updated


async def generate_missing_thumbnails(workspace_id: str, dry_run: bool = False):
    """Generate thumbnails for faces that don't have them."""
    workspace_uuid = UUID(workspace_id)

    pool = await get_postgres_pool()
    r2_service = get_r2_storage_service()
    thumbnail_service = get_face_thumbnail_service()

    async with pool.acquire() as conn:
        # Get faces without thumbnail_urls (limit to 100 to avoid overwhelming)
        faces = await conn.fetch("""
            SELECT f.id, f.photo_id, f.bounding_box,
                   a.storage_key, a.workspace_id
            FROM faces f
            JOIN assets a ON f.photo_id = a.id
            JOIN face_groups fg ON f.face_group_id = fg.id
            WHERE fg.workspace_id = $1
              AND (f.thumbnail_urls IS NULL
                   OR f.thumbnail_urls = ''
                   OR f.thumbnail_urls::text = 'null'::jsonb)
            LIMIT 100
        """, workspace_uuid)

        if not faces:
            print("No faces need thumbnails generated.")
            return 0

        print(f"Found {len(faces)} faces without thumbnails (limited to 100)")

        generated = 0
        failed = 0

        for face in faces:
            face_id = face['id']
            photo_id = face['photo_id']
            storage_key = face['storage_key']
            bounding_box = face['bounding_box']

            if dry_run:
                print(f"  [DRY RUN] Would generate thumbnails for face {face_id}")
                generated += 1
                continue

            try:
                # Download the original image
                image_buffer = await r2_storage_service.download_bytes(storage_key)

                if not image_buffer:
                    print(f"  ⚠️  Could not download image {storage_key} for face {face_id}")
                    failed += 1
                    continue

                # Generate and upload thumbnails
                thumbnail_urls = await thumbnail_service.create_and_upload_thumbnails(
                    face_id=face_id,
                    workspace_id=workspace_uuid,
                    image_buffer=image_buffer,
                    bounding_box=bounding_box,
                )

                if thumbnail_urls:
                    # Update face with thumbnail URLs
                    await conn.execute("""
                        UPDATE faces
                        SET thumbnail_urls = $2
                        WHERE id = $1
                    """, face_id, thumbnail_urls)
                    print(f"  ✓ Generated thumbnails for face {face_id}")
                    generated += 1
                else:
                    print(f"  ⚠️  Failed to generate thumbnails for face {face_id}")
                    failed += 1

            except Exception as e:
                print(f"  ✗ Error generating thumbnails for face {face_id}: {e}")
                failed += 1

        print(f"\nGenerated {generated} thumbnails, {failed} failed")
        return generated


async def fix_all_face_avatars(workspace_id: str, dry_run: bool = False):
    """Fix all face avatar issues for a workspace."""
    print("=" * 60)
    print("FACE AVATAR FIX")
    print("=" * 60)
    print(f"Workspace ID: {workspace_id}")
    print(f"Dry Run: {dry_run}")
    print("=" * 60)
    print()

    print("Step 1: Setting representative faces for groups...")
    print("-" * 60)
    await set_representative_faces_for_workspace(workspace_id, dry_run=dry_run)

    print()
    print("Step 2: Generating missing thumbnails...")
    print("-" * 60)
    await generate_missing_thumbnails(workspace_id, dry_run=dry_run)

    print()
    print("=" * 60)
    print("FIX COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fix face avatar display issues")
    parser.add_argument("workspace_id", help="Workspace UUID to fix")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    args = parser.parse_args()

    asyncio.run(fix_all_face_avatars(args.workspace_id, dry_run=args.dry_run))
