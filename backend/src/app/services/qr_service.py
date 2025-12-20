"""QR Code Generation Service."""

import io
import qrcode
from qrcode.image.styledpil import StyledPilImage
# Note: Basic qrcode usage might not need styledpil unless we want fancy styles.
# Standard: qrcode.make(data)

class QRCodeService:
    """Service for generating QR codes."""

    @staticmethod
    def generate_qr_code(data: str, box_size: int = 10, border: int = 4) -> bytes:
        """
        Generate a QR code image for the given data string.
        
        Args:
            data: The content to encode (e.g. URL).
            box_size: Size of each box in pixels.
            border: Border width in boxes.
            
        Returns:
            Bytes of the PNG image.
        """
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=box_size,
            border=border,
        )
        qr.add_data(data)
        qr.make(fit=True)

        img = qr.make_image(fill_color="black", back_color="white")
        
        # Save to bytes
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        return img_byte_arr.getvalue()
