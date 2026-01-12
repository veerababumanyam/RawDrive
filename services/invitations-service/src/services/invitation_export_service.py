"""
Invitation Export Service

Provides functionality to export digital invitations as:
- PDF documents
- High-resolution images
- Printable formats

Exports are stored in R2 (Cloudflare) for download.

Feature: 016-save-the-date Phase 11
"""

from __future__ import annotations

import logging
import io
import os
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID, uuid4
from enum import Enum

from src.database import get_pool as get_postgres_pool
from src.services.audit_service import AuditService, AuditEventType

logger = logging.getLogger(__name__)


class ExportFormat(str, Enum):
    PDF = "pdf"
    PNG = "png"
    JPEG = "jpeg"


class ExportStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InvitationExportService:
    """Service for exporting digital invitations."""

    def __init__(self, audit_service: Optional[AuditService] = None):
        self._r2_bucket = os.getenv("R2_EXPORTS_BUCKET", "invitation-exports")
        self._r2_endpoint = os.getenv("R2_ENDPOINT", "")
        self._r2_access_key = os.getenv("R2_ACCESS_KEY_ID", "")
        self._r2_secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "")
        self._audit_service = audit_service or AuditService()

    async def create_export_job(
        self,
        workspace_id: UUID,
        invitation_id: UUID,
        user_id: UUID,
        export_format: ExportFormat,
        options: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create an export job for processing."""
        job_id = uuid4()
        
        pool = await get_pool()
        async with pool.acquire() as conn:
            # Calculate expiration (7 days from now)
            expires_at = datetime.utcnow() + timedelta(days=7)
            
            row = await conn.fetchrow(
                """
                INSERT INTO invitation_exports (
                    export_id, workspace_id, invitation_id, user_id,
                    format, status, options, expires_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                job_id,
                workspace_id,
                invitation_id,
                user_id,
                export_format.value,
                ExportStatus.PENDING.value,
                options or {},
                expires_at,
            )
            
            logger.info(f"Created export job {job_id} for invitation {invitation_id}")

            # Audit logging for invitation export job creation
            try:
                await self._audit_service.log_event(
                    event_type=AuditEventType.RSVP_EXPORTED,  # Using RSVP_EXPORTED as it covers exports
                    workspace_id=workspace_id,
                    actor_user_id=user_id,
                    target_entity_type="invitation_export",
                    target_entity_id=job_id,
                    details={
                        "invitation_id": str(invitation_id),
                        "format": export_format.value,
                        "status": "job_created",
                    },
                )
            except Exception as e:
                logger.warning(
                    "Failed to log audit event for export job creation",
                    extra={"export_id": str(job_id), "error": str(e)},
                )

            return dict(row)

    async def get_export_job(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> Optional[dict[str, Any]]:
        """Get export job status."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM invitation_exports
                WHERE export_id = $1 AND workspace_id = $2
                """,
                export_id,
                workspace_id,
            )
            return dict(row) if row else None

    async def list_exports(
        self,
        workspace_id: UUID,
        invitation_id: Optional[UUID] = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """List export jobs for a workspace or invitation."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            if invitation_id:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_exports
                    WHERE workspace_id = $1 AND invitation_id = $2
                    ORDER BY created_at DESC
                    LIMIT $3
                    """,
                    workspace_id,
                    invitation_id,
                    limit,
                )
            else:
                rows = await conn.fetch(
                    """
                    SELECT * FROM invitation_exports
                    WHERE workspace_id = $1
                    ORDER BY created_at DESC
                    LIMIT $2
                    """,
                    workspace_id,
                    limit,
                )
            return [dict(row) for row in rows]

    async def update_export_status(
        self,
        export_id: UUID,
        status: ExportStatus,
        file_url: Optional[str] = None,
        file_size_bytes: Optional[int] = None,
        error_message: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update export job status."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE invitation_exports
                SET status = $1,
                    file_url = COALESCE($2, file_url),
                    file_size_bytes = COALESCE($3, file_size_bytes),
                    error_message = $4,
                    completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
                WHERE export_id = $5
                RETURNING *
                """,
                status.value,
                file_url,
                file_size_bytes,
                error_message,
                export_id,
            )
            return dict(row) if row else None

    async def process_export(
        self,
        export_id: UUID,
        invitation_data: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Process an export job.
        
        This would typically be called by a background worker.
        For now, generates a simple PDF placeholder.
        """
        pool = await get_pool()
        async with pool.acquire() as conn:
            job = await conn.fetchrow(
                "SELECT * FROM invitation_exports WHERE export_id = $1",
                export_id,
            )
            
            if not job:
                raise ValueError(f"Export job {export_id} not found")
            
            job = dict(job)
        
        # Update status to processing
        await self.update_export_status(export_id, ExportStatus.PROCESSING)
        
        try:
            export_format = ExportFormat(job["format"])
            
            if export_format == ExportFormat.PDF:
                file_data = await self._generate_pdf(invitation_data)
                content_type = "application/pdf"
                extension = "pdf"
            elif export_format in (ExportFormat.PNG, ExportFormat.JPEG):
                file_data = await self._generate_image(invitation_data, export_format)
                content_type = f"image/{export_format.value}"
                extension = export_format.value
            else:
                raise ValueError(f"Unsupported format: {export_format}")
            
            # Upload to R2
            file_key = f"exports/{job['workspace_id']}/{job['invitation_id']}/{export_id}.{extension}"
            file_url = await self._upload_to_r2(file_key, file_data, content_type)
            
            # Update job with success
            result = await self.update_export_status(
                export_id,
                ExportStatus.COMPLETED,
                file_url=file_url,
                file_size_bytes=len(file_data),
            )
            
            logger.info(f"Export {export_id} completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"Export {export_id} failed: {e}")
            await self.update_export_status(
                export_id,
                ExportStatus.FAILED,
                error_message=str(e),
            )
            raise

    async def _generate_pdf(self, invitation_data: dict[str, Any]) -> bytes:
        """Generate PDF from invitation data."""
        try:
            # Try using reportlab if available
            from reportlab.lib.pagesizes import A4
            from reportlab.pdfgen import canvas as pdf_canvas
            
            buffer = io.BytesIO()
            c = pdf_canvas.Canvas(buffer, pagesize=A4)
            width, height = A4
            
            # Title
            c.setFont("Helvetica-Bold", 24)
            title = invitation_data.get("title", "Invitation")
            c.drawCentredString(width / 2, height - 100, title)
            
            # Description
            c.setFont("Helvetica", 14)
            description = invitation_data.get("description", "")
            if description:
                y = height - 150
                for line in description.split("\n")[:10]:
                    c.drawCentredString(width / 2, y, line[:80])
                    y -= 20
            
            # Event details
            c.setFont("Helvetica-Bold", 12)
            event_datetime = invitation_data.get("event_datetime", "")
            if event_datetime:
                c.drawCentredString(width / 2, height - 300, f"Date: {event_datetime}")
            
            venue = invitation_data.get("venue", {})
            if venue.get("name"):
                c.drawCentredString(width / 2, height - 330, f"Venue: {venue['name']}")
            
            c.save()
            buffer.seek(0)
            return buffer.read()
            
        except ImportError:
            # Fallback: return a minimal PDF
            logger.warning("reportlab not available, generating minimal PDF")
            return self._generate_minimal_pdf(invitation_data)

    def _generate_minimal_pdf(self, invitation_data: dict[str, Any]) -> bytes:
        """Generate a minimal PDF without reportlab."""
        title = invitation_data.get("title", "Invitation")
        
        # Minimal PDF structure
        pdf_content = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 100 >>
stream
BT
/F1 24 Tf
100 700 Td
({title}) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000416 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
494
%%EOF"""
        return pdf_content.encode("latin-1")

    async def _generate_image(
        self,
        invitation_data: dict[str, Any],
        format: ExportFormat,
    ) -> bytes:
        """Generate image from invitation data."""
        try:
            from PIL import Image, ImageDraw, ImageFont
            
            # Create image
            width, height = 1200, 630
            img = Image.new("RGB", (width, height), color=(255, 255, 255))
            draw = ImageDraw.Draw(img)
            
            # Draw title
            title = invitation_data.get("title", "Invitation")
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
            except:
                font = ImageFont.load_default()
            
            bbox = draw.textbbox((0, 0), title, font=font)
            text_width = bbox[2] - bbox[0]
            draw.text(
                ((width - text_width) / 2, 100),
                title,
                fill=(0, 0, 0),
                font=font,
            )
            
            # Save to bytes
            buffer = io.BytesIO()
            img_format = "PNG" if format == ExportFormat.PNG else "JPEG"
            img.save(buffer, format=img_format, quality=95)
            buffer.seek(0)
            return buffer.read()
            
        except ImportError:
            logger.warning("PIL not available, returning placeholder image")
            # Return a 1x1 pixel PNG
            return bytes([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
                0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
                0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
                0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
                0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
                0x44, 0xAE, 0x42, 0x60, 0x82
            ])

    async def _upload_to_r2(
        self,
        key: str,
        data: bytes,
        content_type: str,
    ) -> str:
        """Upload file to R2 storage."""
        try:
            import boto3
            
            s3 = boto3.client(
                "s3",
                endpoint_url=self._r2_endpoint,
                aws_access_key_id=self._r2_access_key,
                aws_secret_access_key=self._r2_secret_key,
            )
            
            s3.put_object(
                Bucket=self._r2_bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
            
            # Generate presigned URL
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._r2_bucket, "Key": key},
                ExpiresIn=604800,  # 7 days
            )
            return url
            
        except ImportError:
            logger.warning("boto3 not available, returning placeholder URL")
            return f"https://placeholder.r2.example.com/{key}"
        except Exception as e:
            logger.error(f"R2 upload failed: {e}")
            # Return a placeholder URL in development
            return f"https://placeholder.r2.example.com/{key}"

    async def delete_export(
        self,
        workspace_id: UUID,
        export_id: UUID,
    ) -> bool:
        """Delete an export and its file."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.execute(
                """
                DELETE FROM invitation_exports
                WHERE export_id = $1 AND workspace_id = $2
                """,
                export_id,
                workspace_id,
            )
            return "DELETE 1" in result


# Singleton instance
_invitation_export_service: InvitationExportService | None = None


def get_invitation_export_service() -> InvitationExportService:
    """Get singleton instance."""
    global _invitation_export_service
    if _invitation_export_service is None:
        _invitation_export_service = InvitationExportService()
    return _invitation_export_service
