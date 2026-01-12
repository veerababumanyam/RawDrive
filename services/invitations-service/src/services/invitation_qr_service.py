"""Invitation QR Code Service.

Orchestrates QR code generation for digital invitations.

Feature: 016-save-the-date
Tasks: T061, T062
"""

from __future__ import annotations

import logging
from typing import Optional, Literal
from uuid import UUID

from src.services.qr_service import QRCodeService
from src.services.digital_invitation_service import (
    DigitalInvitationService,
    get_digital_invitation_service,
    InvitationNotFoundError,
)

logger = logging.getLogger(__name__)


# QR format type
QRFormat = Literal["png", "svg", "pdf"]


class InvitationQRService:
    """Service for generating QR codes for digital invitations.

    Wraps the base QRCodeService with invitation-specific features:
    - Auto-generates public URL from invitation
    - Supports logo overlay from cover image
    - Customizable colors to match invitation theme
    """

    def __init__(
        self,
        invitation_service: Optional[DigitalInvitationService] = None,
    ):
        self.invitation_service = invitation_service or get_digital_invitation_service()

    async def generate_invitation_qr(
        self,
        invitation_id: UUID,
        workspace_id: UUID,
        format: QRFormat = "png",
        size: int = 512,
        fill_color: str = "#000000",
        back_color: str = "#FFFFFF",
        include_logo: bool = False,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
    ) -> tuple[bytes, str, str]:
        """Generate a QR code for an invitation's public URL.

        Args:
            invitation_id: The invitation UUID
            workspace_id: The workspace UUID
            format: Output format (png, svg, pdf)
            size: Size in pixels (256-2048)
            fill_color: QR code module color (hex)
            back_color: Background color (hex)
            include_logo: Whether to overlay the cover image as logo
            title: Optional title for PDF format
            subtitle: Optional subtitle for PDF format

        Returns:
            Tuple of (qr_bytes, content_type, filename)

        Raises:
            InvitationNotFoundError: If invitation doesn't exist
            ValueError: If invitation is not published or has no public URL
        """
        # Validate size range
        size = max(256, min(size, 2048))

        # Get invitation details
        invitation = await self.invitation_service.get_invitation(
            invitation_id=invitation_id,
            workspace_id=workspace_id,
        )

        if not invitation:
            raise InvitationNotFoundError("Invitation not found")

        # Get public URL
        public_url = invitation.get("public_url")
        if not public_url:
            raise ValueError("Invitation must be published to generate QR code")

        # Get cover image for logo if requested
        logo_bytes = None
        if include_logo:
            logo_bytes = await self._get_cover_image_bytes(invitation)

        # Get invitation title for filename
        invitation_title = invitation.get("title", "invitation")
        safe_title = "".join(c for c in invitation_title if c.isalnum() or c in " -_").strip()
        safe_title = safe_title[:30] if safe_title else "invitation"

        # Generate QR code based on format
        if format == "svg":
            qr_bytes = QRCodeService.generate_qr_svg(
                data=public_url,
                size=size,
                fill_color=fill_color,
                back_color=back_color,
            )
            content_type = "image/svg+xml"
            filename = f"{safe_title}-qr.svg"

        elif format == "pdf":
            # Use invitation title if no custom title provided
            pdf_title = title or invitation_title
            pdf_subtitle = subtitle or f"Scan to view invitation"

            qr_bytes = QRCodeService.generate_qr_pdf(
                data=public_url,
                size=size,
                fill_color=fill_color,
                logo_bytes=logo_bytes,
                title=pdf_title,
                subtitle=pdf_subtitle,
            )
            content_type = "application/pdf"
            filename = f"{safe_title}-qr.pdf"

        else:  # png (default)
            if logo_bytes:
                qr_bytes = QRCodeService.generate_qr_with_logo(
                    data=public_url,
                    logo_bytes=logo_bytes,
                    size=size,
                    fill_color=fill_color,
                    back_color=back_color,
                )
            else:
                qr_bytes = QRCodeService.generate_qr_code(
                    data=public_url,
                    min_size=size,
                    fill_color=fill_color,
                    back_color=back_color,
                )
            content_type = "image/png"
            filename = f"{safe_title}-qr.png"

        logger.info(
            "Generated QR code for invitation",
            extra={
                "invitation_id": str(invitation_id),
                "format": format,
                "size": size,
                "include_logo": include_logo,
            },
        )

        return qr_bytes, content_type, filename

    async def _get_cover_image_bytes(self, invitation: dict) -> Optional[bytes]:
        """Fetch cover image bytes for logo overlay.

        Args:
            invitation: Invitation dict with optional cover_image_url

        Returns:
            Image bytes or None if unavailable
        """
        cover_url = invitation.get("cover_image_url")
        if not cover_url:
            return None

        try:
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.get(cover_url, timeout=10.0)
                if response.status_code == 200:
                    return response.content
        except Exception as e:
            logger.warning(f"Failed to fetch cover image for QR logo: {e}")

        return None

    @staticmethod
    def get_supported_formats() -> list[str]:
        """Get supported QR code formats."""
        return QRCodeService.get_supported_formats()

    @staticmethod
    def validate_size(size: int) -> int:
        """Validate and clamp QR code size."""
        return max(256, min(size, 2048))

    @staticmethod
    def validate_color(color: str) -> str:
        """Validate hex color format."""
        if not color.startswith("#"):
            color = f"#{color}"
        if len(color) not in (4, 7):  # #RGB or #RRGGBB
            return "#000000"
        return color


# Singleton instance
_qr_service: Optional[InvitationQRService] = None


def get_invitation_qr_service() -> InvitationQRService:
    """Get or create the invitation QR service singleton."""
    global _qr_service
    if _qr_service is None:
        _qr_service = InvitationQRService()
    return _qr_service
