"""
XMP Sync API Endpoints
Export and import XMP sidecar files for gallery assets
Feature: 029-pro-review-xmp-sync
Tasks: T035, T036
"""

import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
import io

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse

from src.schemas.xmp_sync import (
    XmpExportRequest,
    XmpExportPreview,
    XmpExportResult,
    XmpImportRequest,
    XmpImportPreview,
    XmpImportResult,
    XmpSyncStatus,
)
from src.services.xmp_service import get_xmp_service
from src.services.gallery_service import get_gallery_service
from src.services.audit_service import get_audit_service, AuditAction
from src.middleware.sync_auth import verify_sync_api_key, SyncKeyPayload
from src.middleware.auth import get_current_user, verify_jwt_token, JWTPayload
from src.config import get_settings
from src.database import get_database

settings = get_settings()
router = APIRouter(tags=["xmp-sync"])


async def get_gallery_assets_for_export(
    db,
    gallery_id: str,
    workspace_id: str,
    request: XmpExportRequest,
) -> List[dict]:
    """
    Fetch gallery assets matching export criteria.

    Args:
        db: Database connection
        gallery_id: Gallery UUID
        workspace_id: Workspace UUID
        request: Export request with filters

    Returns:
        List of asset dictionaries
    """
    # Build query
    query = """
        SELECT
            ga.asset_id,
            a.filename,
            a.file_type,
            ga.rating,
            ga.flag,
            ga.color_label,
            ga.sort_order,
            ga.sub_gallery_id,
            a.captured_at,
            a.created_at,
            a.width,
            a.height
        FROM gallery_assets ga
        JOIN assets a ON ga.asset_id = a.id
        JOIN galleries g ON ga.gallery_id = g.id
        WHERE ga.gallery_id = $1
          AND g.workspace_id = $2
          AND ga.deleted_at IS NULL
          AND a.deleted_at IS NULL
    """
    params = [gallery_id, workspace_id]
    param_idx = 3

    # Apply filters
    if request.asset_ids:
        query += f" AND ga.asset_id = ANY(${param_idx}::uuid[])"
        params.append(request.asset_ids)
        param_idx += 1

    if request.sub_gallery_id:
        query += f" AND ga.sub_gallery_id = ${param_idx}"
        params.append(request.sub_gallery_id)
        param_idx += 1

    if request.include_picks_only:
        query += " AND ga.flag = 'pick'"

    if request.include_rated_only:
        query += " AND ga.rating >= 1"

    if request.min_rating is not None:
        query += f" AND ga.rating >= ${param_idx}"
        params.append(request.min_rating)
        param_idx += 1

    # Order by sort_order
    query += " ORDER BY ga.sort_order ASC"

    # Execute query
    rows = await db.fetch(query, *params)

    # Convert to list of dicts
    return [dict(row) for row in rows]


@router.post(
    "/galleries/{gallery_id}/xmp/export/preview",
    response_model=XmpExportPreview,
    summary="Preview XMP export",
    description="Get a preview of what will be exported without generating files",
)
async def preview_xmp_export(
    gallery_id: UUID,
    request: XmpExportRequest = None,
    current_user: JWTPayload = Depends(verify_jwt_token),
):
    """
    Preview XMP export operation.

    Returns count, sample filenames, and estimated size.
    """
    if request is None:
        request = XmpExportRequest()

    async with get_database() as db:
        # Fetch assets
        assets = await get_gallery_assets_for_export(
            db,
            str(gallery_id),
            str(current_user.workspace_id),
            request,
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="No assets found matching criteria",
            )

        # Calculate estimated size (roughly 2KB per XMP file)
        estimated_size = len(assets) * 2048

        # Get sample filenames (up to 10)
        sample_files = [
            get_xmp_service().get_xmp_filename(a["filename"])
            for a in assets[:10]
        ]

        return XmpExportPreview(
            total_assets=len(assets),
            sample_files=sample_files,
            estimated_size_bytes=estimated_size,
        )


@router.post(
    "/galleries/{gallery_id}/xmp/export",
    response_class=StreamingResponse,
    summary="Export XMP files",
    description="Generate and download XMP sidecar files as a ZIP archive",
)
async def export_xmp(
    gallery_id: UUID,
    request: XmpExportRequest = None,
    current_user: JWTPayload = Depends(verify_jwt_token),
):
    """
    Export XMP sidecar files for gallery assets.

    Returns a ZIP file containing .xmp files for each asset.
    """
    if request is None:
        request = XmpExportRequest()

    xmp_service = get_xmp_service()
    audit_service = get_audit_service()

    async with get_database() as db:
        # Fetch assets
        assets = await get_gallery_assets_for_export(
            db,
            str(gallery_id),
            str(current_user.workspace_id),
            request,
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="No assets found matching criteria",
            )

        # Generate ZIP file
        zip_bytes, zip_filename = xmp_service.create_xmp_zip(
            assets,
            str(gallery_id),
            include_rawdrive_metadata=request.include_rawdrive_metadata,
        )

        # Log audit event (T038)
        await audit_service.log_action(
            db=db,
            workspace_id=str(current_user.workspace_id),
            user_id=str(current_user.user_id),
            action=AuditAction.XMP_EXPORT,
            resource_type="gallery",
            resource_id=str(gallery_id),
            details={
                "total_exported": len(assets),
                "filters": request.model_dump(),
                "zip_filename": zip_filename,
                "zip_size_bytes": len(zip_bytes),
            },
        )

        # Return ZIP file as streaming response
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
                "Content-Length": str(len(zip_bytes)),
            },
        )


@router.get(
    "/galleries/{gallery_id}/xmp/status",
    response_model=XmpSyncStatus,
    summary="Get XMP sync status",
    description="Get the current XMP sync status for a gallery",
)
async def get_xmp_sync_status(
    gallery_id: UUID,
    current_user: JWTPayload = Depends(verify_jwt_token),
):
    """
    Get XMP sync status for a gallery.

    Returns information about last export/import and pending changes.
    """
    async with get_database() as db:
        # Count total assets
        total_query = """
            SELECT COUNT(*)
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.id
            WHERE ga.gallery_id = $1
              AND g.workspace_id = $2
              AND ga.deleted_at IS NULL
        """
        total_count = await db.fetchval(
            total_query,
            str(gallery_id),
            str(current_user.workspace_id),
        )

        if total_count is None:
            raise HTTPException(status_code=404, detail="Gallery not found")

        # Get last export/import from audit log
        last_export_query = """
            SELECT created_at
            FROM sync_audit_log
            WHERE workspace_id = $1
              AND action = 'xmp_export'
              AND resource_type = 'gallery'
              AND resource_id = $2
            ORDER BY created_at DESC
            LIMIT 1
        """
        last_export_row = await db.fetchrow(
            last_export_query,
            str(current_user.workspace_id),
            str(gallery_id),
        )

        last_import_query = """
            SELECT created_at
            FROM sync_audit_log
            WHERE workspace_id = $1
              AND action = 'xmp_import'
              AND resource_type = 'gallery'
              AND resource_id = $2
            ORDER BY created_at DESC
            LIMIT 1
        """
        last_import_row = await db.fetchrow(
            last_import_query,
            str(current_user.workspace_id),
            str(gallery_id),
        )

        # Count assets that have metadata (considered as "having XMP")
        with_xmp_query = """
            SELECT COUNT(*)
            FROM gallery_assets ga
            JOIN galleries g ON ga.gallery_id = g.id
            WHERE ga.gallery_id = $1
              AND g.workspace_id = $2
              AND ga.deleted_at IS NULL
              AND (ga.rating IS NOT NULL OR ga.flag != 'unflagged' OR ga.color_label != 'none')
        """
        with_xmp_count = await db.fetchval(
            with_xmp_query,
            str(gallery_id),
            str(current_user.workspace_id),
        )

        # Count pending changes (assets modified since last export)
        pending_changes = 0
        if last_export_row:
            pending_query = """
                SELECT COUNT(*)
                FROM gallery_assets ga
                JOIN galleries g ON ga.gallery_id = g.id
                WHERE ga.gallery_id = $1
                  AND g.workspace_id = $2
                  AND ga.deleted_at IS NULL
                  AND ga.updated_at > $3
            """
            pending_changes = await db.fetchval(
                pending_query,
                str(gallery_id),
                str(current_user.workspace_id),
                last_export_row["created_at"],
            )

        return XmpSyncStatus(
            gallery_id=str(gallery_id),
            last_export_at=last_export_row["created_at"] if last_export_row else None,
            last_import_at=last_import_row["created_at"] if last_import_row else None,
            total_assets=total_count,
            assets_with_xmp=with_xmp_count or 0,
            pending_changes=pending_changes or 0,
        )


# Desktop sync endpoints (using sync API key authentication)

@router.post(
    "/sync/galleries/{gallery_id}/xmp/export",
    response_class=StreamingResponse,
    summary="Export XMP files (Desktop Sync)",
    description="Export XMP files using sync API key authentication",
)
async def sync_export_xmp(
    gallery_id: UUID,
    request: XmpExportRequest = None,
    sync_key: SyncKeyPayload = Depends(verify_sync_api_key),
):
    """
    Export XMP files for desktop sync application.

    Uses sync API key authentication instead of JWT.
    """
    if request is None:
        request = XmpExportRequest()

    xmp_service = get_xmp_service()
    audit_service = get_audit_service()

    async with get_database() as db:
        # Verify gallery belongs to workspace
        gallery_check = await db.fetchrow(
            "SELECT id FROM galleries WHERE id = $1 AND workspace_id = $2",
            str(gallery_id),
            str(sync_key.workspace_id),
        )
        if not gallery_check:
            raise HTTPException(status_code=404, detail="Gallery not found")

        # Fetch assets
        assets = await get_gallery_assets_for_export(
            db,
            str(gallery_id),
            str(sync_key.workspace_id),
            request,
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="No assets found matching criteria",
            )

        # Generate ZIP file
        zip_bytes, zip_filename = xmp_service.create_xmp_zip(
            assets,
            str(gallery_id),
            include_rawdrive_metadata=request.include_rawdrive_metadata,
        )

        # Log audit event
        await audit_service.log_action(
            db=db,
            workspace_id=str(sync_key.workspace_id),
            user_id=str(sync_key.user_id),
            action=AuditAction.XMP_EXPORT,
            resource_type="gallery",
            resource_id=str(gallery_id),
            details={
                "total_exported": len(assets),
                "sync_key_id": str(sync_key.key_id),
                "client": "desktop_sync",
                "zip_filename": zip_filename,
            },
        )

        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{zip_filename}"',
                "Content-Length": str(len(zip_bytes)),
            },
        )


# =============================================================================
# XMP Import Endpoints (T044, T045, T046, T047)
# =============================================================================

async def get_gallery_assets_for_import(
    db,
    gallery_id: str,
    workspace_id: str,
) -> List[dict]:
    """
    Fetch all gallery assets for import matching.

    Args:
        db: Database connection
        gallery_id: Gallery UUID
        workspace_id: Workspace UUID

    Returns:
        List of asset dictionaries with id, filename
    """
    query = """
        SELECT
            ga.asset_id,
            a.filename,
            a.id as rawdrive_id
        FROM gallery_assets ga
        JOIN assets a ON ga.asset_id = a.id
        JOIN galleries g ON ga.gallery_id = g.id
        WHERE ga.gallery_id = $1
          AND g.workspace_id = $2
          AND ga.deleted_at IS NULL
          AND a.deleted_at IS NULL
    """
    rows = await db.fetch(query, gallery_id, workspace_id)
    return [dict(row) for row in rows]


def match_xmp_to_assets(
    xmp_files: List[dict],
    assets: List[dict],
    match_by_rawdrive_id: bool = True,
) -> dict:
    """
    Match XMP files to gallery assets (T046).

    Matching strategy:
    1. If match_by_rawdrive_id and XMP contains rawdrive:assetId, use that
    2. Otherwise, match by filename (base name without extension)

    Args:
        xmp_files: List of parsed XMP data with filename and metadata
        assets: List of gallery assets
        match_by_rawdrive_id: Whether to use RawDrive asset IDs if available

    Returns:
        Dictionary with matched, unmatched_xmp, and unmatched_assets lists
    """
    import os

    # Build lookup tables
    asset_by_id = {str(a["asset_id"]): a for a in assets}
    asset_by_basename = {}
    for a in assets:
        basename = os.path.splitext(a["filename"])[0].lower()
        asset_by_basename[basename] = a

    matched = []
    unmatched_xmp = []

    for xmp in xmp_files:
        xmp_filename = xmp.get("filename", "")
        xmp_basename = os.path.splitext(xmp_filename)[0].lower()
        # Remove .xmp extension if present
        if xmp_basename.endswith(".xmp"):
            xmp_basename = xmp_basename[:-4]

        asset = None

        # Strategy 1: Match by RawDrive asset ID
        if match_by_rawdrive_id:
            rawdrive_id = xmp.get("metadata", {}).get("rawdrive_asset_id")
            if rawdrive_id and rawdrive_id in asset_by_id:
                asset = asset_by_id[rawdrive_id]

        # Strategy 2: Match by filename
        if asset is None and xmp_basename in asset_by_basename:
            asset = asset_by_basename[xmp_basename]

        if asset:
            matched.append({
                "xmp_filename": xmp_filename,
                "asset_id": str(asset["asset_id"]),
                "asset_filename": asset["filename"],
                "metadata": xmp.get("metadata", {}),
            })
        else:
            unmatched_xmp.append(xmp_filename)

    # Find unmatched assets
    matched_asset_ids = {m["asset_id"] for m in matched}
    unmatched_assets = [
        a["filename"]
        for a in assets
        if str(a["asset_id"]) not in matched_asset_ids
    ]

    return {
        "matched": matched,
        "unmatched_xmp": unmatched_xmp,
        "unmatched_assets": unmatched_assets,
    }


@router.post(
    "/galleries/{gallery_id}/xmp/import/preview",
    response_model=XmpImportPreview,
    summary="Preview XMP import (T044)",
    description="Validate and preview XMP import without applying changes",
)
async def preview_xmp_import(
    gallery_id: UUID,
    file: UploadFile = File(..., description="ZIP file containing XMP files"),
    match_by_rawdrive_id: bool = Query(True, description="Match using RawDrive asset IDs"),
    current_user: JWTPayload = Depends(verify_jwt_token),
):
    """
    Preview XMP import operation (T044).

    Validates the uploaded ZIP file and returns a preview of:
    - Files that can be matched to gallery assets
    - Files that cannot be matched
    - Assets that have no matching XMP file
    """
    import zipfile

    xmp_service = get_xmp_service()

    # Validate file type
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="File must be a ZIP archive",
        )

    # Read ZIP file
    try:
        contents = await file.read()
        zip_buffer = io.BytesIO(contents)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read uploaded file: {str(e)}",
        )

    # Parse XMP files from ZIP
    try:
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            xmp_files = []
            for name in zf.namelist():
                if name.lower().endswith(".xmp") and not name.startswith("__MACOSX"):
                    try:
                        xmp_content = zf.read(name).decode("utf-8")
                        parsed = xmp_service.parse_xmp_content(xmp_content)
                        xmp_files.append({
                            "filename": name.split("/")[-1],  # Get just filename
                            "metadata": parsed,
                        })
                    except Exception as e:
                        # Skip invalid XMP files
                        xmp_files.append({
                            "filename": name.split("/")[-1],
                            "metadata": {},
                            "error": str(e),
                        })
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid ZIP file",
        )

    if not xmp_files:
        raise HTTPException(
            status_code=400,
            detail="No XMP files found in ZIP archive",
        )

    async with get_database() as db:
        # Get gallery assets
        assets = await get_gallery_assets_for_import(
            db,
            str(gallery_id),
            str(current_user.workspace_id),
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="Gallery has no assets",
            )

        # Match XMP files to assets (T046)
        match_result = match_xmp_to_assets(
            xmp_files,
            assets,
            match_by_rawdrive_id=match_by_rawdrive_id,
        )

        # Build preview of changes
        changes_preview = []
        for match in match_result["matched"][:10]:  # Limit preview to 10
            metadata = match["metadata"]
            changes_preview.append({
                "filename": match["asset_filename"],
                "rating": metadata.get("rating"),
                "flag": metadata.get("flag"),
                "color_label": metadata.get("color_label"),
            })

        return XmpImportPreview(
            total_files=len(xmp_files),
            matched_count=len(match_result["matched"]),
            unmatched_count=len(match_result["unmatched_xmp"]),
            unmatched_files=match_result["unmatched_xmp"][:20],  # Limit to 20
            changes_preview=changes_preview,
        )


@router.post(
    "/galleries/{gallery_id}/xmp/import",
    response_model=XmpImportResult,
    summary="Import XMP files (T045)",
    description="Apply XMP metadata to gallery assets",
)
async def import_xmp(
    gallery_id: UUID,
    file: UploadFile = File(..., description="ZIP file containing XMP files"),
    match_by_rawdrive_id: bool = Query(True, description="Match using RawDrive asset IDs"),
    overwrite_existing: bool = Query(True, description="Overwrite existing metadata"),
    current_user: JWTPayload = Depends(verify_jwt_token),
):
    """
    Import XMP metadata to gallery assets (T045).

    Parses XMP files from uploaded ZIP and applies metadata to matched assets.
    Includes audit logging (T047).
    """
    import zipfile

    xmp_service = get_xmp_service()
    audit_service = get_audit_service()

    # Validate file type
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="File must be a ZIP archive",
        )

    # Read ZIP file
    try:
        contents = await file.read()
        zip_buffer = io.BytesIO(contents)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read uploaded file: {str(e)}",
        )

    # Parse XMP files from ZIP
    try:
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            xmp_files = []
            for name in zf.namelist():
                if name.lower().endswith(".xmp") and not name.startswith("__MACOSX"):
                    try:
                        xmp_content = zf.read(name).decode("utf-8")
                        parsed = xmp_service.parse_xmp_content(xmp_content)
                        xmp_files.append({
                            "filename": name.split("/")[-1],
                            "metadata": parsed,
                        })
                    except Exception:
                        # Skip invalid XMP files
                        pass
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid ZIP file",
        )

    if not xmp_files:
        raise HTTPException(
            status_code=400,
            detail="No valid XMP files found in ZIP archive",
        )

    async with get_database() as db:
        # Get gallery assets
        assets = await get_gallery_assets_for_import(
            db,
            str(gallery_id),
            str(current_user.workspace_id),
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="Gallery has no assets",
            )

        # Match XMP files to assets (T046)
        match_result = match_xmp_to_assets(
            xmp_files,
            assets,
            match_by_rawdrive_id=match_by_rawdrive_id,
        )

        # Apply metadata changes
        updated_count = 0
        skipped_count = 0
        errors = []

        for match in match_result["matched"]:
            asset_id = match["asset_id"]
            metadata = match["metadata"]

            try:
                # Build update query
                updates = []
                params = []
                param_idx = 3

                rating = metadata.get("rating")
                if rating is not None:
                    updates.append(f"rating = ${param_idx}")
                    params.append(rating)
                    param_idx += 1

                flag = metadata.get("flag")
                if flag:
                    updates.append(f"flag = ${param_idx}")
                    params.append(flag)
                    param_idx += 1

                color_label = metadata.get("color_label")
                if color_label:
                    updates.append(f"color_label = ${param_idx}")
                    params.append(color_label)
                    param_idx += 1

                if not updates:
                    skipped_count += 1
                    continue

                # Add updated_at
                updates.append(f"updated_at = ${param_idx}")
                params.append(datetime.now(timezone.utc))

                # Execute update
                update_query = f"""
                    UPDATE gallery_assets
                    SET {', '.join(updates)}
                    WHERE asset_id = $1
                      AND gallery_id = $2
                      AND deleted_at IS NULL
                """
                await db.execute(
                    update_query,
                    asset_id,
                    str(gallery_id),
                    *params,
                )
                updated_count += 1

            except Exception as e:
                errors.append({
                    "filename": match["asset_filename"],
                    "error": str(e),
                })

        # Log audit event (T047)
        await audit_service.log_action(
            db=db,
            workspace_id=str(current_user.workspace_id),
            user_id=str(current_user.user_id),
            action=AuditAction.XMP_IMPORT,
            resource_type="gallery",
            resource_id=str(gallery_id),
            details={
                "total_xmp_files": len(xmp_files),
                "matched_count": len(match_result["matched"]),
                "updated_count": updated_count,
                "skipped_count": skipped_count,
                "error_count": len(errors),
                "match_by_rawdrive_id": match_by_rawdrive_id,
                "overwrite_existing": overwrite_existing,
            },
        )

        return XmpImportResult(
            total_processed=len(xmp_files),
            successfully_imported=updated_count,
            skipped=skipped_count,
            failed=len(errors),
            errors=errors[:10] if errors else None,  # Limit errors in response
        )


# Desktop sync import endpoint
@router.post(
    "/sync/galleries/{gallery_id}/xmp/import",
    response_model=XmpImportResult,
    summary="Import XMP files (Desktop Sync)",
    description="Import XMP files using sync API key authentication",
)
async def sync_import_xmp(
    gallery_id: UUID,
    file: UploadFile = File(..., description="ZIP file containing XMP files"),
    match_by_rawdrive_id: bool = Query(True, description="Match using RawDrive asset IDs"),
    overwrite_existing: bool = Query(True, description="Overwrite existing metadata"),
    sync_key: SyncKeyPayload = Depends(verify_sync_api_key),
):
    """
    Import XMP files for desktop sync application.

    Uses sync API key authentication instead of JWT.
    """
    import zipfile

    xmp_service = get_xmp_service()
    audit_service = get_audit_service()

    # Validate file type
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="File must be a ZIP archive",
        )

    # Read ZIP file
    try:
        contents = await file.read()
        zip_buffer = io.BytesIO(contents)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read uploaded file: {str(e)}",
        )

    # Parse XMP files from ZIP
    try:
        with zipfile.ZipFile(zip_buffer, "r") as zf:
            xmp_files = []
            for name in zf.namelist():
                if name.lower().endswith(".xmp") and not name.startswith("__MACOSX"):
                    try:
                        xmp_content = zf.read(name).decode("utf-8")
                        parsed = xmp_service.parse_xmp_content(xmp_content)
                        xmp_files.append({
                            "filename": name.split("/")[-1],
                            "metadata": parsed,
                        })
                    except Exception:
                        pass
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=400,
            detail="Invalid ZIP file",
        )

    if not xmp_files:
        raise HTTPException(
            status_code=400,
            detail="No valid XMP files found in ZIP archive",
        )

    async with get_database() as db:
        # Verify gallery belongs to workspace
        gallery_check = await db.fetchrow(
            "SELECT id FROM galleries WHERE id = $1 AND workspace_id = $2",
            str(gallery_id),
            str(sync_key.workspace_id),
        )
        if not gallery_check:
            raise HTTPException(status_code=404, detail="Gallery not found")

        # Get gallery assets
        assets = await get_gallery_assets_for_import(
            db,
            str(gallery_id),
            str(sync_key.workspace_id),
        )

        if not assets:
            raise HTTPException(
                status_code=404,
                detail="Gallery has no assets",
            )

        # Match XMP files to assets
        match_result = match_xmp_to_assets(
            xmp_files,
            assets,
            match_by_rawdrive_id=match_by_rawdrive_id,
        )

        # Apply metadata changes
        updated_count = 0
        skipped_count = 0
        errors = []

        for match in match_result["matched"]:
            asset_id = match["asset_id"]
            metadata = match["metadata"]

            try:
                updates = []
                params = []
                param_idx = 3

                rating = metadata.get("rating")
                if rating is not None:
                    updates.append(f"rating = ${param_idx}")
                    params.append(rating)
                    param_idx += 1

                flag = metadata.get("flag")
                if flag:
                    updates.append(f"flag = ${param_idx}")
                    params.append(flag)
                    param_idx += 1

                color_label = metadata.get("color_label")
                if color_label:
                    updates.append(f"color_label = ${param_idx}")
                    params.append(color_label)
                    param_idx += 1

                if not updates:
                    skipped_count += 1
                    continue

                updates.append(f"updated_at = ${param_idx}")
                params.append(datetime.now(timezone.utc))

                update_query = f"""
                    UPDATE gallery_assets
                    SET {', '.join(updates)}
                    WHERE asset_id = $1
                      AND gallery_id = $2
                      AND deleted_at IS NULL
                """
                await db.execute(
                    update_query,
                    asset_id,
                    str(gallery_id),
                    *params,
                )
                updated_count += 1

            except Exception as e:
                errors.append({
                    "filename": match["asset_filename"],
                    "error": str(e),
                })

        # Log audit event
        await audit_service.log_action(
            db=db,
            workspace_id=str(sync_key.workspace_id),
            user_id=str(sync_key.user_id),
            action=AuditAction.XMP_IMPORT,
            resource_type="gallery",
            resource_id=str(gallery_id),
            details={
                "total_xmp_files": len(xmp_files),
                "matched_count": len(match_result["matched"]),
                "updated_count": updated_count,
                "skipped_count": skipped_count,
                "error_count": len(errors),
                "sync_key_id": str(sync_key.key_id),
                "client": "desktop_sync",
            },
        )

        return XmpImportResult(
            total_processed=len(xmp_files),
            successfully_imported=updated_count,
            skipped=skipped_count,
            failed=len(errors),
            errors=errors[:10] if errors else None,
        )
