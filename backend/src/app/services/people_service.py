"""PeopleService: CRUD operations for people and face detections.

Implements people/face tagging within workspace scope.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class PeopleError(Exception):
    """Base people error."""

    def __init__(self, message: str, code: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class PersonNotFoundError(PeopleError):
    """Person not found."""

    def __init__(self, person_id: UUID) -> None:
        super().__init__(
            f"Person {person_id} not found",
            "PERSON_NOT_FOUND",
            404,
        )


class FaceNotFoundError(PeopleError):
    """Face detection not found."""

    def __init__(self, face_id: UUID) -> None:
        super().__init__(
            f"Face {face_id} not found",
            "FACE_NOT_FOUND",
            404,
        )


# ---------------------------------------------------------------------------
# People Service
# ---------------------------------------------------------------------------


class PeopleService:
    """Service for people and face detection operations."""

    # -------------------------------------------------------------------------
    # Person Operations
    # -------------------------------------------------------------------------

    async def create_person(
        self,
        workspace_id: UUID,
        display_name: Optional[str] = None,
    ) -> dict:
        """Create a new person."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            person_id = await conn.fetchval(
                """
                INSERT INTO people (workspace_id, display_name, status)
                VALUES ($1, $2, 'active')
                RETURNING person_id
                """,
                workspace_id,
                display_name,
            )

            return await self.get_person(workspace_id, person_id)

    async def get_person(self, workspace_id: UUID, person_id: UUID) -> dict:
        """Get a specific person."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    p.person_id, p.workspace_id, p.display_name,
                    p.cover_face_id, p.status, p.created_at, p.updated_at
                FROM people p
                WHERE p.workspace_id = $1 AND p.person_id = $2 AND p.status != 'deleted'
                """,
                workspace_id,
                person_id,
            )
            if not row:
                raise PersonNotFoundError(person_id)

            # Get face count
            face_count = await conn.fetchval(
                "SELECT COUNT(*) FROM face_detections WHERE workspace_id = $1 AND person_id = $2",
                workspace_id,
                person_id,
            )

            # Get cover face asset info if exists
            cover_asset_id = None
            if row["cover_face_id"]:
                cover_asset_id = await conn.fetchval(
                    "SELECT asset_id FROM face_detections WHERE face_id = $1",
                    row["cover_face_id"],
                )

            return {
                "person_id": str(row["person_id"]),
                "workspace_id": str(row["workspace_id"]),
                "display_name": row["display_name"],
                "cover_face_id": str(row["cover_face_id"]) if row["cover_face_id"] else None,
                "cover_asset_id": str(cover_asset_id) if cover_asset_id else None,
                "status": row["status"],
                "face_count": face_count or 0,
                "created_at": row["created_at"].isoformat(),
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
            }

    async def list_people(
        self,
        workspace_id: UUID,
        search: Optional[str] = None,
        status: str = "active",
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """List people in a workspace."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            # Build WHERE clause
            where_clauses = ["p.workspace_id = $1", "p.status = $2"]
            params = [workspace_id, status]
            param_idx = 3

            if search:
                where_clauses.append(f"p.display_name ILIKE ${param_idx}")
                params.append(f"%{search}%")
                param_idx += 1

            where_sql = " AND ".join(where_clauses)

            # Get total count
            total = await conn.fetchval(
                f"SELECT COUNT(*) FROM people p WHERE {where_sql}",
                *params,
            )

            # Get people with face count
            people = await conn.fetch(
                f"""
                SELECT
                    p.person_id, p.display_name, p.cover_face_id, p.status, p.created_at,
                    (SELECT COUNT(*) FROM face_detections fd WHERE fd.person_id = p.person_id) as face_count,
                    (SELECT fd.asset_id FROM face_detections fd WHERE fd.face_id = p.cover_face_id) as cover_asset_id
                FROM people p
                WHERE {where_sql}
                ORDER BY p.display_name ASC NULLS LAST, p.created_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
                limit,
                offset,
            )

            return {
                "data": [
                    {
                        "person_id": str(p["person_id"]),
                        "display_name": p["display_name"],
                        "cover_face_id": str(p["cover_face_id"]) if p["cover_face_id"] else None,
                        "cover_asset_id": str(p["cover_asset_id"]) if p["cover_asset_id"] else None,
                        "status": p["status"],
                        "face_count": p["face_count"] or 0,
                        "created_at": p["created_at"].isoformat(),
                    }
                    for p in people
                ],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit if total else 0,
                },
            }

    async def update_person(
        self,
        workspace_id: UUID,
        person_id: UUID,
        display_name: Optional[str] = None,
        cover_face_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> dict:
        """Update a person."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Check person exists
            exists = await conn.fetchval(
                "SELECT 1 FROM people WHERE workspace_id = $1 AND person_id = $2 AND status != 'deleted'",
                workspace_id,
                person_id,
            )
            if not exists:
                raise PersonNotFoundError(person_id)

            # Build update query
            set_clauses = ["updated_at = NOW()"]
            params = []
            param_idx = 1

            if display_name is not None:
                set_clauses.append(f"display_name = ${param_idx}")
                params.append(display_name)
                param_idx += 1

            if cover_face_id is not None:
                # Verify face belongs to this person
                face_person = await conn.fetchval(
                    "SELECT person_id FROM face_detections WHERE face_id = $1",
                    cover_face_id,
                )
                if str(face_person) != str(person_id):
                    raise PeopleError(
                        "Cover face must belong to this person",
                        "INVALID_COVER_FACE",
                        400,
                    )
                set_clauses.append(f"cover_face_id = ${param_idx}")
                params.append(cover_face_id)
                param_idx += 1

            if status is not None:
                set_clauses.append(f"status = ${param_idx}")
                params.append(status)
                param_idx += 1

            params.extend([workspace_id, person_id])

            await conn.execute(
                f"""
                UPDATE people
                SET {', '.join(set_clauses)}
                WHERE workspace_id = ${param_idx} AND person_id = ${param_idx + 1}
                """,
                *params,
            )

            return await self.get_person(workspace_id, person_id)

    async def delete_person(self, workspace_id: UUID, person_id: UUID) -> None:
        """Soft delete a person. Unlinks all faces."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Unlink all faces from this person
                await conn.execute(
                    "UPDATE face_detections SET person_id = NULL WHERE workspace_id = $1 AND person_id = $2",
                    workspace_id,
                    person_id,
                )

                # Soft delete person
                result = await conn.execute(
                    """
                    UPDATE people
                    SET status = 'deleted', updated_at = NOW(), cover_face_id = NULL
                    WHERE workspace_id = $1 AND person_id = $2
                    """,
                    workspace_id,
                    person_id,
                )
                if result == "UPDATE 0":
                    raise PersonNotFoundError(person_id)

    async def merge_people(
        self,
        workspace_id: UUID,
        source_person_id: UUID,
        target_person_id: UUID,
    ) -> dict:
        """Merge source person into target person. Source is deleted."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # Verify both exist
                source_exists = await conn.fetchval(
                    "SELECT 1 FROM people WHERE workspace_id = $1 AND person_id = $2 AND status != 'deleted'",
                    workspace_id,
                    source_person_id,
                )
                target_exists = await conn.fetchval(
                    "SELECT 1 FROM people WHERE workspace_id = $1 AND person_id = $2 AND status != 'deleted'",
                    workspace_id,
                    target_person_id,
                )

                if not source_exists:
                    raise PersonNotFoundError(source_person_id)
                if not target_exists:
                    raise PersonNotFoundError(target_person_id)

                # Move all faces from source to target
                await conn.execute(
                    """
                    UPDATE face_detections
                    SET person_id = $3
                    WHERE workspace_id = $1 AND person_id = $2
                    """,
                    workspace_id,
                    source_person_id,
                    target_person_id,
                )

                # Delete source person
                await conn.execute(
                    """
                    UPDATE people
                    SET status = 'deleted', updated_at = NOW(), cover_face_id = NULL
                    WHERE workspace_id = $1 AND person_id = $2
                    """,
                    workspace_id,
                    source_person_id,
                )

        return await self.get_person(workspace_id, target_person_id)

    # -------------------------------------------------------------------------
    # Face Detection Operations
    # -------------------------------------------------------------------------

    async def create_face_detection(
        self,
        workspace_id: UUID,
        asset_id: UUID,
        bbox: dict,
        user_id: Optional[UUID] = None,
        person_id: Optional[UUID] = None,
        confidence: Optional[float] = None,
    ) -> dict:
        """Create a face detection (manual or auto-detected)."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            import json
            bbox_json = json.dumps(bbox)

            face_id = await conn.fetchval(
                """
                INSERT INTO face_detections (
                    workspace_id, asset_id, bbox, person_id, confidence, tagged_by_user_id, tagged_at
                )
                VALUES ($1, $2, $3::jsonb, $4, $5, $6, CASE WHEN $6 IS NOT NULL THEN NOW() ELSE NULL END)
                ON CONFLICT (workspace_id, asset_id, bbox) DO UPDATE
                SET person_id = EXCLUDED.person_id, tagged_by_user_id = EXCLUDED.tagged_by_user_id, tagged_at = NOW()
                RETURNING face_id
                """,
                workspace_id,
                asset_id,
                bbox_json,
                person_id,
                confidence,
                user_id,
            )

            return await self.get_face_detection(workspace_id, face_id)

    async def get_face_detection(self, workspace_id: UUID, face_id: UUID) -> dict:
        """Get a specific face detection."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    fd.face_id, fd.workspace_id, fd.asset_id, fd.bbox,
                    fd.person_id, fd.confidence, fd.tagged_by_user_id, fd.detected_at, fd.tagged_at,
                    p.display_name as person_name
                FROM face_detections fd
                LEFT JOIN people p ON fd.person_id = p.person_id
                WHERE fd.workspace_id = $1 AND fd.face_id = $2
                """,
                workspace_id,
                face_id,
            )
            if not row:
                raise FaceNotFoundError(face_id)

            return {
                "face_id": str(row["face_id"]),
                "workspace_id": str(row["workspace_id"]),
                "asset_id": str(row["asset_id"]),
                "bbox": row["bbox"],
                "person_id": str(row["person_id"]) if row["person_id"] else None,
                "person_name": row["person_name"],
                "confidence": float(row["confidence"]) if row["confidence"] else None,
                "tagged_by_user_id": str(row["tagged_by_user_id"]) if row["tagged_by_user_id"] else None,
                "detected_at": row["detected_at"].isoformat(),
                "tagged_at": row["tagged_at"].isoformat() if row["tagged_at"] else None,
            }

    async def list_faces_for_asset(
        self,
        workspace_id: UUID,
        asset_id: UUID,
    ) -> list[dict]:
        """List all face detections for an asset."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            faces = await conn.fetch(
                """
                SELECT
                    fd.face_id, fd.asset_id, fd.bbox, fd.person_id, fd.confidence,
                    fd.tagged_by_user_id, fd.detected_at, fd.tagged_at,
                    p.display_name as person_name
                FROM face_detections fd
                LEFT JOIN people p ON fd.person_id = p.person_id
                WHERE fd.workspace_id = $1 AND fd.asset_id = $2
                ORDER BY fd.detected_at ASC
                """,
                workspace_id,
                asset_id,
            )

            return [
                {
                    "face_id": str(f["face_id"]),
                    "asset_id": str(f["asset_id"]),
                    "bbox": f["bbox"],
                    "person_id": str(f["person_id"]) if f["person_id"] else None,
                    "person_name": f["person_name"],
                    "confidence": float(f["confidence"]) if f["confidence"] else None,
                    "tagged_by_user_id": str(f["tagged_by_user_id"]) if f["tagged_by_user_id"] else None,
                    "detected_at": f["detected_at"].isoformat(),
                    "tagged_at": f["tagged_at"].isoformat() if f["tagged_at"] else None,
                }
                for f in faces
            ]

    async def tag_face(
        self,
        workspace_id: UUID,
        face_id: UUID,
        person_id: UUID,
        user_id: UUID,
    ) -> dict:
        """Assign a face detection to a person."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify face exists
            face_exists = await conn.fetchval(
                "SELECT 1 FROM face_detections WHERE workspace_id = $1 AND face_id = $2",
                workspace_id,
                face_id,
            )
            if not face_exists:
                raise FaceNotFoundError(face_id)

            # Verify person exists
            person_exists = await conn.fetchval(
                "SELECT 1 FROM people WHERE workspace_id = $1 AND person_id = $2 AND status != 'deleted'",
                workspace_id,
                person_id,
            )
            if not person_exists:
                raise PersonNotFoundError(person_id)

            await conn.execute(
                """
                UPDATE face_detections
                SET person_id = $3, tagged_by_user_id = $4, tagged_at = NOW()
                WHERE workspace_id = $1 AND face_id = $2
                """,
                workspace_id,
                face_id,
                person_id,
                user_id,
            )

            return await self.get_face_detection(workspace_id, face_id)

    async def untag_face(
        self,
        workspace_id: UUID,
        face_id: UUID,
    ) -> dict:
        """Remove person assignment from a face detection."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            # Verify face exists
            face_exists = await conn.fetchval(
                "SELECT 1 FROM face_detections WHERE workspace_id = $1 AND face_id = $2",
                workspace_id,
                face_id,
            )
            if not face_exists:
                raise FaceNotFoundError(face_id)

            await conn.execute(
                """
                UPDATE face_detections
                SET person_id = NULL
                WHERE workspace_id = $1 AND face_id = $2
                """,
                workspace_id,
                face_id,
            )

            return await self.get_face_detection(workspace_id, face_id)

    async def delete_face_detection(
        self,
        workspace_id: UUID,
        face_id: UUID,
    ) -> None:
        """Delete a face detection."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM face_detections WHERE workspace_id = $1 AND face_id = $2",
                workspace_id,
                face_id,
            )
            if result == "DELETE 0":
                raise FaceNotFoundError(face_id)

    async def get_assets_for_person(
        self,
        workspace_id: UUID,
        person_id: UUID,
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """Get all assets containing a specific person."""
        pool = await get_postgres_pool()
        async with pool.acquire() as conn:
            offset = (page - 1) * limit

            # Get total count
            total = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT asset_id)
                FROM face_detections
                WHERE workspace_id = $1 AND person_id = $2
                """,
                workspace_id,
                person_id,
            )

            # Get asset IDs
            assets = await conn.fetch(
                """
                SELECT DISTINCT fd.asset_id, MIN(fd.detected_at) as first_detected
                FROM face_detections fd
                WHERE fd.workspace_id = $1 AND fd.person_id = $2
                GROUP BY fd.asset_id
                ORDER BY first_detected DESC
                LIMIT $3 OFFSET $4
                """,
                workspace_id,
                person_id,
                limit,
                offset,
            )

            return {
                "data": [{"asset_id": str(a["asset_id"])} for a in assets],
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "totalPages": (total + limit - 1) // limit if total else 0,
                },
            }


# Export singleton instance
_people_service: Optional[PeopleService] = None


def get_people_service() -> PeopleService:
    """Get singleton people service instance."""
    global _people_service
    if _people_service is None:
        _people_service = PeopleService()
    return _people_service
