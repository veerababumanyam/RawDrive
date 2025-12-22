"""QR Code Generation Service.

Generates QR codes for public profile URLs with high error correction
for reliability when scanned.
"""

import io
import qrcode
from PIL import Image

# Default QR code settings
DEFAULT_BOX_SIZE = 15  # Larger box size for minimum 512x512 output
DEFAULT_BORDER = 4     # Standard border width in boxes
DEFAULT_ERROR_CORRECTION = qrcode.constants.ERROR_CORRECT_H  # High (~30% recovery)
MIN_OUTPUT_SIZE = 512  # Minimum output size in pixels


class QRCodeService:
    """Service for generating QR codes with high error correction."""

    @staticmethod
    def generate_qr_code(
        data: str,
        box_size: int = DEFAULT_BOX_SIZE,
        border: int = DEFAULT_BORDER,
        min_size: int = MIN_OUTPUT_SIZE,
    ) -> bytes:
        """
        Generate a QR code image for the given data string.

        Uses ERROR_CORRECT_H (high) error correction level for ~30% data recovery,
        ensuring the QR code remains scannable even if partially damaged or
        obscured.

        Args:
            data: The content to encode (e.g. URL).
            box_size: Size of each box in pixels (default 15 for larger output).
            border: Border width in boxes.
            min_size: Minimum output size in pixels (default 512x512).

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

        img = qr.make_image(fill_color="black", back_color="white")

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
        pil_img.save(img_byte_arr, format='PNG', optimize=True)
        return img_byte_arr.getvalue()

    @staticmethod
    def get_error_correction_level() -> str:
        """Get the current error correction level description."""
        return "H (High - ~30% data recovery)"
