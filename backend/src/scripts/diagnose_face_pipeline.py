"""Diagnostic script: run face detection pipeline on a local image (e.g. tests/reethu.jpg).

Uses the real FaceDetectionService path (detect -> store -> cluster) with DB and
prints step-by-step results so we can identify the root cause with evidence.

Usage (from repo root):
  python -m app.scripts.diagnose_face_pipeline [path/to/image.jpg]
  Default image: tests/reethu.jpg

Requires: DATABASE_URL and backend env; workspace 11111111-1111-1111-1111-000000000001
must exist and have biometric consent (migration 0194 or enable_consent.py).
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import sys
from pathlib import Path
from uuid import UUID, uuid4

# Add backend src to path and load env
backend_src = Path(__file__).resolve().parent.parent
backend_root = backend_src.parent
project_root = backend_root.parent
sys.path.insert(0, str(backend_src))
os.chdir(str(project_root))

from dotenv import load_dotenv
load_dotenv(backend_root / ".env")
load_dotenv(project_root / ".env")

from app.db.postgres import get_postgres_pool, init_postgres_pool, close_postgres_pool
from app.db.redis import init_redis_client, close_redis_client
from app.config.settings import get_settings
from app.services.face_detection_service import get_face_detection_service
from app.api.face_schemas import FaceDetectionJobStatus

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Test workspace (free tier) - must have consent via 0194 or enable_consent
TEST_WORKSPACE_ID = "11111111-1111-1111-1111-000000000001"


def _section(title: str) -> None:
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)


async def run() -> None:
    image_path = sys.argv[1] if len(sys.argv) > 1 else str(project_root / "tests" / "reethu.jpg")
    if not os.path.isfile(image_path):
        print(f"ERROR: Image not found: {image_path}")
        sys.exit(1)

    with open(image_path, "rb") as f:
        image_bytes = f.read()
    print(f"Loaded image: {image_path} ({len(image_bytes)} bytes)")

    settings = get_settings()
    await init_postgres_pool(settings)
    try:
        await init_redis_client(settings)
    except Exception as e:
        logger.warning("Redis init failed (consent cache will use DB only): %s", e)
    pool = await get_postgres_pool()

    photo_id = uuid4()
    job_id = uuid4()

    try:
        _section("1. DB state before")
        async with pool.acquire() as conn:
            consent = await conn.fetchrow(
                """
                SELECT workspace_id, face_detection_enabled, consent_status
                FROM workspace_biometric_settings
                WHERE workspace_id = $1
                """,
                TEST_WORKSPACE_ID,
            )
            print("workspace_biometric_settings:", dict(consent) if consent else "NO ROW (consent missing)")
            jobs_before = await conn.fetchval(
                "SELECT COUNT(*) FROM face_detection_jobs WHERE workspace_id = $1",
                TEST_WORKSPACE_ID,
            )
            faces_before = await conn.fetchval(
                "SELECT COUNT(*) FROM faces WHERE workspace_id = $1",
                TEST_WORKSPACE_ID,
            )
            groups_before = await conn.fetchval(
                "SELECT COUNT(*) FROM face_groups WHERE workspace_id = $1",
                TEST_WORKSPACE_ID,
            )
            print(f"face_detection_jobs: {jobs_before}, faces: {faces_before}, face_groups: {groups_before}")

        _section("2. Create minimal asset + job")
        # We need an asset (FK from faces and face_detection_jobs)
        user_id = None
        async with pool.acquire() as conn:
            user_id = await conn.fetchval(
                """
                SELECT user_id FROM workspace_memberships
                WHERE workspace_id = $1 LIMIT 1
                """,
                TEST_WORKSPACE_ID,
            )
        if not user_id:
            print("ERROR: No member in test workspace. Run seeds or use a workspace that has members.")
            return

        sha256 = hashlib.sha256(image_bytes).hexdigest()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO assets (
                    asset_id, workspace_id, library_id, type,
                    original_object_key, original_bytes, sha256, mime_type,
                    exif, status, created_by_user_id
                )
                VALUES ($1, $2, NULL, 'photo', $3, $4, $5, 'image/jpeg', '{}', 'available', $6)
                ON CONFLICT (asset_id) DO NOTHING
                """,
                photo_id,
                TEST_WORKSPACE_ID,
                f"diagnostic/{photo_id}/reethu.jpg",
                len(image_bytes),
                sha256,
                user_id,
            )
            await conn.execute(
                """
                INSERT INTO face_detection_jobs (id, workspace_id, photo_id, status, priority)
                VALUES ($1, $2, $3, 'pending', 10)
                ON CONFLICT (photo_id) DO UPDATE SET status = 'pending', error_message = NULL
                """,
                job_id,
                TEST_WORKSPACE_ID,
                photo_id,
            )
        print(f"Created asset {photo_id}, job {job_id}")

        _section("2b. Consent check (direct)")
        try:
            from app.services.biometric_consent_service import get_biometric_consent_service
            consent_svc = get_biometric_consent_service()
            allowed = await consent_svc.is_face_detection_allowed(UUID(TEST_WORKSPACE_ID))
            print(f"is_face_detection_allowed(workspace) = {allowed}")
        except Exception as e:
            print(f"is_face_detection_allowed FAILED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

        _section("3. Run process_photo (detect -> store -> cluster)")
        try:
            service = get_face_detection_service()
            stored_faces = await service.process_photo(
                photo_id=photo_id,
                workspace_id=TEST_WORKSPACE_ID,
                image_buffer=image_bytes,
                auto_cluster=True,
            )
            print(f"process_photo returned: {len(stored_faces)} face(s)")
            for i, f in enumerate(stored_faces):
                print(f"  face[{i}]: id={f.get('id')}, confidence={f.get('confidence')}, group_id={f.get('face_group_id')}")
        except Exception as e:
            print(f"process_photo FAILED: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()

        _section("4. DB state after")
        async with pool.acquire() as conn:
            job = await conn.fetchrow(
                """
                SELECT id, status, error_message, faces_detected, provider_used
                FROM face_detection_jobs WHERE photo_id = $1
                """,
                photo_id,
            )
            print("face_detection_jobs row:", dict(job) if job else "none")
            faces_after = await conn.fetch(
                "SELECT id, photo_id, confidence, face_group_id FROM faces WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20",
                TEST_WORKSPACE_ID,
            )
            print(f"faces (last 20): {len(faces_after)} rows")
            for r in faces_after:
                print(f"  {r['id']} photo={r['photo_id']} conf={r['confidence']} group_id={r['face_group_id']}")
            groups_after = await conn.fetch(
                "SELECT id, name, face_count FROM face_groups WHERE workspace_id = $1",
                TEST_WORKSPACE_ID,
            )
            print(f"face_groups: {len(groups_after)} rows")
            for r in groups_after:
                print(f"  {r['id']} name={r['name']} face_count={r['face_count']}")

        _section("5. Root cause summary")
        if job:
            if job["status"] == "completed" and (job["faces_detected"] or 0) > 0 and faces_after:
                print("OK: Detection and storage succeeded. Faces and groups populated.")
            elif job["status"] == "failed":
                print(f"ROOT CAUSE: Job failed. error_message = {job['error_message']}")
            elif job["status"] == "completed" and (job["faces_detected"] or 0) == 0:
                print("ROOT CAUSE: Detection returned 0 faces (provider found no face or all below confidence).")
            else:
                print(f"Check: job status={job['status']}, faces_detected={job['faces_detected']}, DB faces={len(faces_after)}")
        else:
            print("ROOT CAUSE: No job row after run (unexpected).")
        print("\n(Resolved root causes: 1) consent_ip_address INET->str in _map_settings; 2) get_face_detection_setting requires default_value in face_detection_service.)")
    finally:
        # Cleanup: delete job and diagnostic asset (and cascaded faces for this photo)
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM face_detection_jobs WHERE photo_id = $1", photo_id)
            await conn.execute("DELETE FROM faces WHERE photo_id = $1", photo_id)
            await conn.execute("DELETE FROM assets WHERE asset_id = $1", photo_id)
        await close_postgres_pool()
        try:
            await close_redis_client()
        except Exception:
            pass
        print("\nCleanup: removed diagnostic job, faces, and asset.")


if __name__ == "__main__":
    asyncio.run(run())
