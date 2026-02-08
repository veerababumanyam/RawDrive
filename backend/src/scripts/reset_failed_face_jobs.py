"""Reset failed face_detection_jobs to pending for a workspace (default: free test user).

Usage (from repo root, or inside backend container):
  python backend/src/scripts/reset_failed_face_jobs.py
  python backend/src/scripts/reset_failed_face_jobs.py --workspace 11111111-1111-1111-1111-000000000001

Requires: DATABASE_URL (backend env). Run in Docker: docker exec rawdrive-backend python src/scripts/reset_failed_face_jobs.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

backend_src = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_src))
backend_root = backend_src.parent
project_root = backend_root.parent
os.chdir(project_root)

from dotenv import load_dotenv
load_dotenv(backend_root / ".env")
load_dotenv(project_root / ".env")

from app.db.postgres import get_postgres_pool, init_postgres_pool, close_postgres_pool
from app.config.settings import get_settings

FREE_WORKSPACE_ID = "11111111-1111-1111-1111-000000000001"


async def main() -> None:
    workspace_id = FREE_WORKSPACE_ID
    if "--workspace" in sys.argv:
        i = sys.argv.index("--workspace")
        if i + 1 < len(sys.argv):
            workspace_id = sys.argv[i + 1]
    await init_postgres_pool(get_settings())
    pool = await get_postgres_pool()
    async with pool.acquire() as conn:
        r = await conn.execute(
            """
            UPDATE face_detection_jobs
            SET status = 'pending', error_message = NULL, retry_count = 0
            WHERE workspace_id = $1::uuid AND status = 'failed'
            """,
            workspace_id,
        )
        # "UPDATE N"
        count = int(r.split()[-1]) if r and "UPDATE" in r else 0
        print(f"Reset {count} failed job(s) to pending for workspace {workspace_id}")
    await close_postgres_pool()


if __name__ == "__main__":
    asyncio.run(main())
