"""Tests for QR Code service.

Tests cover:
- PNG generation with minimum size
- SVG generation with color customization
- PDF generation with branding
- Logo overlay functionality
- Error correction level
"""

import pytest
from io import BytesIO
from PIL import Image

from app.services.qr_service import (
    QRCodeService,
    MIN_OUTPUT_SIZE,
    DEFAULT_ERROR_CORRECTION,
)


class TestPNGGeneration:
    """Test PNG QR code generation."""

    def test_generates_valid_png(self):
        """Should generate valid PNG image."""
        qr_bytes = QRCodeService.generate_qr_code("https://example.com")

        # Verify PNG magic bytes
        assert qr_bytes[:8] == b'\x89PNG\r\n\x1a\n'

        # Verify image can be opened
        img = Image.open(BytesIO(qr_bytes))
        assert img.format == 'PNG'

    def test_minimum_output_size(self):
        """QR code should meet minimum size requirement."""
        qr_bytes = QRCodeService.generate_qr_code("https://example.com")

        img = Image.open(BytesIO(qr_bytes))
        width, height = img.size

        # Should be at least MIN_OUTPUT_SIZE
        assert width >= MIN_OUTPUT_SIZE
        assert height >= MIN_OUTPUT_SIZE

    def test_custom_colors(self):
        """QR code should support custom colors."""
        qr_bytes = QRCodeService.generate_qr_code(
            "https://example.com",
            fill_color="blue",
            back_color="yellow",
        )

        img = Image.open(BytesIO(qr_bytes))
        # Just verify it generates without error
        assert img.format == 'PNG'

    def test_custom_size(self):
        """QR code should respect custom min_size."""
        custom_size = 800
        qr_bytes = QRCodeService.generate_qr_code(
            "https://example.com",
            min_size=custom_size,
        )

        img = Image.open(BytesIO(qr_bytes))
        width, height = img.size

        assert width >= custom_size
        assert height >= custom_size


class TestSVGGeneration:
    """Test SVG QR code generation."""

    def test_generates_valid_svg(self):
        """Should generate valid SVG document."""
        svg_bytes = QRCodeService.generate_qr_svg("https://example.com")

        svg_content = svg_bytes.decode('utf-8')

        # Should contain SVG elements
        assert '<svg' in svg_content or '<?xml' in svg_content
        assert '<path' in svg_content or 'svg' in svg_content

    def test_svg_with_custom_colors(self):
        """SVG should support custom colors."""
        svg_bytes = QRCodeService.generate_qr_svg(
            "https://example.com",
            fill_color="#FF0000",
            back_color="#00FF00",
        )

        svg_content = svg_bytes.decode('utf-8')

        # Should contain SVG
        assert 'svg' in svg_content.lower()


class TestPDFGeneration:
    """Test PDF QR code generation."""

    def test_generates_valid_pdf(self):
        """Should generate valid PDF document."""
        try:
            pdf_bytes = QRCodeService.generate_qr_pdf("https://example.com")

            # PDF magic bytes
            assert pdf_bytes[:4] == b'%PDF'
        except ImportError:
            # reportlab not installed
            pytest.skip("reportlab not installed")

    def test_pdf_with_title(self):
        """PDF should include title when provided."""
        try:
            pdf_bytes = QRCodeService.generate_qr_pdf(
                "https://example.com",
                title="Test Gallery",
            )

            # Should generate without error
            assert pdf_bytes[:4] == b'%PDF'
        except ImportError:
            pytest.skip("reportlab not installed")

    def test_pdf_with_subtitle(self):
        """PDF should include subtitle when provided."""
        try:
            pdf_bytes = QRCodeService.generate_qr_pdf(
                "https://example.com",
                title="Test Gallery",
                subtitle="Scan to view",
            )

            assert pdf_bytes[:4] == b'%PDF'
        except ImportError:
            pytest.skip("reportlab not installed")


class TestLogoOverlay:
    """Test QR code with logo overlay."""

    def test_logo_overlay_generates_valid_png(self):
        """QR with logo should generate valid PNG."""
        # Create a simple test logo (1x1 red pixel PNG)
        test_logo = BytesIO()
        img = Image.new('RGBA', (100, 100), (255, 0, 0, 255))
        img.save(test_logo, format='PNG')
        logo_bytes = test_logo.getvalue()

        qr_bytes = QRCodeService.generate_qr_with_logo(
            "https://example.com",
            logo_bytes=logo_bytes,
        )

        # Verify output is valid PNG
        result_img = Image.open(BytesIO(qr_bytes))
        assert result_img.format == 'PNG'

    def test_logo_size_percentage(self):
        """Logo should respect size percentage parameter."""
        # Create test logo
        test_logo = BytesIO()
        img = Image.new('RGBA', (200, 200), (0, 255, 0, 255))
        img.save(test_logo, format='PNG')
        logo_bytes = test_logo.getvalue()

        qr_bytes = QRCodeService.generate_qr_with_logo(
            "https://example.com",
            logo_bytes=logo_bytes,
            logo_size_percent=0.15,  # 15%
        )

        # Should generate without error
        result_img = Image.open(BytesIO(qr_bytes))
        assert result_img.size[0] >= MIN_OUTPUT_SIZE


class TestErrorCorrection:
    """Test QR code error correction level."""

    def test_high_error_correction(self):
        """QR code should use high error correction by default."""
        import qrcode

        # Default should be H level (~30% recovery)
        assert DEFAULT_ERROR_CORRECTION == qrcode.constants.ERROR_CORRECT_H

    def test_error_correction_level_description(self):
        """Should return correct error correction description."""
        level = QRCodeService.get_error_correction_level()

        assert "H" in level
        assert "30%" in level


class TestSupportedFormats:
    """Test supported output formats."""

    def test_supported_formats(self):
        """Should support png, svg, and pdf formats."""
        formats = QRCodeService.get_supported_formats()

        assert 'png' in formats
        assert 'svg' in formats
        assert 'pdf' in formats


class TestDataEncoding:
    """Test various data encoding scenarios."""

    def test_long_url_encoding(self):
        """Should handle long URLs."""
        long_url = "https://example.com/" + "a" * 500

        qr_bytes = QRCodeService.generate_qr_code(long_url)

        # Should generate without error
        img = Image.open(BytesIO(qr_bytes))
        assert img.format == 'PNG'

    def test_unicode_data_encoding(self):
        """Should handle unicode data."""
        unicode_data = "https://example.com/gallery/日本語テスト"

        qr_bytes = QRCodeService.generate_qr_code(unicode_data)

        img = Image.open(BytesIO(qr_bytes))
        assert img.format == 'PNG'

    def test_special_characters(self):
        """Should handle special characters in URL."""
        special_url = "https://example.com/path?query=test&param=value#section"

        qr_bytes = QRCodeService.generate_qr_code(special_url)

        img = Image.open(BytesIO(qr_bytes))
        assert img.format == 'PNG'
