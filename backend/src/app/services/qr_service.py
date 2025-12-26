"""QR Code Generation Service.

Generates QR codes for Magic Links and public profile URLs in multiple formats:
- PNG: Raster format for web display and email
- SVG: Vector format for scalable print materials
- PDF: Professional print format with optional branding

Uses high error correction (H level - ~30% recovery) for reliability.
"""

from __future__ import annotations

import io
import logging
from typing import Optional

import qrcode
import qrcode.image.svg
from PIL import Image

logger = logging.getLogger(__name__)

# Default QR code settings
DEFAULT_BOX_SIZE = 15  # Larger box size for minimum 512x512 output
DEFAULT_BORDER = 4  # Standard border width in boxes
DEFAULT_ERROR_CORRECTION = qrcode.constants.ERROR_CORRECT_H  # High (~30% recovery)
MIN_OUTPUT_SIZE = 512  # Minimum output size in pixels


class QRCodeService:
    """Service for generating QR codes in multiple formats.

    Supports PNG, SVG, and PDF output formats with customization options
    including logo overlay, custom colors, and branding.
    """

    @staticmethod
    def generate_qr_code(
        data: str,
        box_size: int = DEFAULT_BOX_SIZE,
        border: int = DEFAULT_BORDER,
        min_size: int = MIN_OUTPUT_SIZE,
        fill_color: str = "black",
        back_color: str = "white",
    ) -> bytes:
        """Generate a QR code image as PNG.

        Uses ERROR_CORRECT_H (high) error correction level for ~30% data recovery,
        ensuring the QR code remains scannable even if partially damaged.

        Args:
            data: The content to encode (e.g. URL).
            box_size: Size of each box in pixels (default 15).
            border: Border width in boxes.
            min_size: Minimum output size in pixels (default 512x512).
            fill_color: Color of the QR code modules (default black).
            back_color: Background color (default white).

        Returns:
            Bytes of the PNG image (minimum 512x512 pixels).
        """
        qr = qrcode.QRCode(
            version=None,  # Auto-determine version based on data length
            error_correction=DEFAULT_ERROR_CORRECTION,
            box_size=box_size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)

        img = qr.make_image(fill_color=fill_color, back_color=back_color)

        # Ensure minimum size
        pil_img = img.get_image()
        width, height = pil_img.size
        if width < min_size or height < min_size:
            # Scale up to minimum size while maintaining aspect ratio
            scale = max(min_size / width, min_size / height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            pil_img = pil_img.resize((new_width, new_height), Image.Resampling.NEAREST)

        # Save to bytes
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format="PNG", optimize=True)
        return img_byte_arr.getvalue()

    @staticmethod
    def generate_qr_svg(
        data: str,
        size: int = MIN_OUTPUT_SIZE,
        fill_color: str = "#000000",
        back_color: str = "#FFFFFF",
    ) -> bytes:
        """Generate a QR code as SVG vector graphics.

        SVG format is ideal for:
        - Print materials (business cards, posters)
        - High-resolution displays
        - Web embedding where scaling is needed

        Args:
            data: The content to encode (e.g. URL).
            size: Desired size (used for viewBox, actual rendering scales infinitely).
            fill_color: Color of the QR code modules (hex format).
            back_color: Background color (hex format).

        Returns:
            SVG document as UTF-8 encoded bytes.
        """
        # Use svg.SvgPathImage for clean SVG output
        factory = qrcode.image.svg.SvgPathImage

        qr = qrcode.QRCode(
            version=None,
            error_correction=DEFAULT_ERROR_CORRECTION,
            box_size=10,  # Will be scaled by viewBox
            border=DEFAULT_BORDER,
        )
        qr.add_data(data)
        qr.make(fit=True)

        # Generate SVG
        img = qr.make_image(image_factory=factory)

        # Get SVG bytes
        svg_bytes = io.BytesIO()
        img.save(svg_bytes)
        svg_content = svg_bytes.getvalue().decode("utf-8")

        # Customize colors if not default
        if fill_color != "#000000":
            svg_content = svg_content.replace('fill="#000000"', f'fill="{fill_color}"')
            svg_content = svg_content.replace("fill:black", f"fill:{fill_color}")

        if back_color != "#FFFFFF":
            # Add background rect if custom background color
            svg_content = svg_content.replace(
                "<path",
                f'<rect width="100%" height="100%" fill="{back_color}"/><path',
                1,
            )

        return svg_content.encode("utf-8")

    @staticmethod
    def generate_qr_pdf(
        data: str,
        size: int = MIN_OUTPUT_SIZE,
        fill_color: str = "#000000",
        logo_bytes: Optional[bytes] = None,
        logo_size_percent: float = 0.2,
        title: Optional[str] = None,
        subtitle: Optional[str] = None,
    ) -> bytes:
        """Generate a QR code as a PDF document.

        PDF format is ideal for:
        - Professional print output
        - Branded QR codes with logo overlay
        - Documents with metadata

        The QR code uses high error correction (H level) to remain
        scannable even with a logo overlay covering up to 20% of the code.

        Args:
            data: The content to encode (e.g. URL).
            size: QR code size in points (72 points = 1 inch).
            fill_color: Color of the QR code modules (hex format).
            logo_bytes: Optional logo image bytes to overlay in center.
            logo_size_percent: Logo size as percentage of QR code (default 20%).
            title: Optional title text above QR code.
            subtitle: Optional subtitle text below QR code.

        Returns:
            PDF document as bytes.
        """
        try:
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.units import inch
            from reportlab.lib.colors import HexColor
            from reportlab.pdfgen import canvas
            from reportlab.lib.utils import ImageReader
        except ImportError:
            logger.error("reportlab is required for PDF generation")
            raise ImportError("reportlab is required for PDF generation. Install with: pip install reportlab")

        # Generate base PNG QR code
        qr_png = QRCodeService.generate_qr_code(
            data=data,
            min_size=size,
            fill_color=fill_color,
            back_color="white",
        )

        # Create PDF
        pdf_buffer = io.BytesIO()
        page_width, page_height = letter

        c = canvas.Canvas(pdf_buffer, pagesize=letter)
        c.setTitle(f"QR Code - {title or 'RawDrive'}")
        c.setAuthor("RawDrive")

        # Calculate positions
        qr_size_in_points = min(size, 4 * inch)  # Max 4 inches
        x_center = page_width / 2
        y_center = page_height / 2

        # Draw title if provided
        if title:
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(x_center, y_center + qr_size_in_points / 2 + 40, title)

        # Draw QR code
        qr_image = ImageReader(io.BytesIO(qr_png))
        qr_x = x_center - qr_size_in_points / 2
        qr_y = y_center - qr_size_in_points / 2
        c.drawImage(qr_image, qr_x, qr_y, width=qr_size_in_points, height=qr_size_in_points)

        # Draw logo overlay if provided
        if logo_bytes:
            try:
                logo_image = ImageReader(io.BytesIO(logo_bytes))
                logo_size = qr_size_in_points * logo_size_percent
                logo_x = x_center - logo_size / 2
                logo_y = y_center - logo_size / 2

                # Draw white background for logo
                c.setFillColor(HexColor("#FFFFFF"))
                padding = logo_size * 0.1
                c.rect(
                    logo_x - padding,
                    logo_y - padding,
                    logo_size + 2 * padding,
                    logo_size + 2 * padding,
                    fill=True,
                    stroke=False,
                )

                # Draw logo
                c.drawImage(logo_image, logo_x, logo_y, width=logo_size, height=logo_size)
            except Exception as e:
                logger.warning(f"Failed to embed logo in PDF: {e}")

        # Draw subtitle if provided
        if subtitle:
            c.setFont("Helvetica", 12)
            c.setFillColor(HexColor("#666666"))
            c.drawCentredString(x_center, qr_y - 30, subtitle)

        # Draw URL at bottom
        c.setFont("Helvetica", 10)
        c.setFillColor(HexColor("#999999"))
        # Truncate long URLs
        display_url = data if len(data) <= 60 else data[:57] + "..."
        c.drawCentredString(x_center, qr_y - 50, display_url)

        c.save()
        return pdf_buffer.getvalue()

    @staticmethod
    def generate_qr_with_logo(
        data: str,
        logo_bytes: bytes,
        size: int = MIN_OUTPUT_SIZE,
        logo_size_percent: float = 0.2,
        fill_color: str = "black",
        back_color: str = "white",
    ) -> bytes:
        """Generate a PNG QR code with a logo overlaid in the center.

        The QR code uses high error correction (H level) which allows
        up to ~30% of the code to be covered while remaining scannable.
        The logo should cover no more than 20% of the QR code area.

        Args:
            data: The content to encode (e.g. URL).
            logo_bytes: Logo image bytes (PNG, JPG, or similar).
            size: Output size in pixels.
            logo_size_percent: Logo size as percentage of QR code (default 20%).
            fill_color: QR code module color.
            back_color: Background color.

        Returns:
            PNG image bytes with logo overlay.
        """
        # Generate base QR code
        qr = qrcode.QRCode(
            version=None,
            error_correction=DEFAULT_ERROR_CORRECTION,
            box_size=10,
            border=DEFAULT_BORDER,
        )
        qr.add_data(data)
        qr.make(fit=True)

        qr_img = qr.make_image(fill_color=fill_color, back_color=back_color).convert("RGBA")

        # Resize QR to target size
        qr_img = qr_img.resize((size, size), Image.Resampling.LANCZOS)

        # Load and process logo
        try:
            logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")

            # Calculate logo size
            logo_max_size = int(size * logo_size_percent)
            logo.thumbnail((logo_max_size, logo_max_size), Image.Resampling.LANCZOS)

            # Calculate position (center)
            logo_x = (size - logo.width) // 2
            logo_y = (size - logo.height) // 2

            # Create white background for logo
            padding = int(logo.width * 0.1)
            bg_size = (logo.width + 2 * padding, logo.height + 2 * padding)
            logo_bg = Image.new("RGBA", bg_size, back_color)

            # Paste logo onto background
            logo_bg.paste(logo, (padding, padding), logo if logo.mode == "RGBA" else None)

            # Paste background+logo onto QR code
            bg_x = logo_x - padding
            bg_y = logo_y - padding
            qr_img.paste(logo_bg, (bg_x, bg_y))
        except Exception as e:
            logger.warning(f"Failed to overlay logo on QR code: {e}")
            # Continue without logo

        # Save to bytes
        output = io.BytesIO()
        qr_img.save(output, format="PNG", optimize=True)
        return output.getvalue()

    @staticmethod
    def get_error_correction_level() -> str:
        """Get the current error correction level description."""
        return "H (High - ~30% data recovery)"

    @staticmethod
    def get_supported_formats() -> list[str]:
        """Get list of supported output formats."""
        return ["png", "svg", "pdf"]
