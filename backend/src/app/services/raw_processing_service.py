"""RAW File Processing Service.

Supports RAW formats: CR2, CR3 (Canon), NEF (Nikon), ARW (Sony), RAF (Fuji),
ORF (Olympus), RW2 (Panasonic), DNG.

Extracts embedded JPEG previews for immediate display.
Generates high-quality JPEG/TIFF conversions in background.
"""

from __future__ import annotations

import io
import logging
from typing import Optional, Tuple, Dict, Any
from uuid import UUID
from enum import Enum

from PIL import Image

logger = logging.getLogger(__name__)

try:
    import rawpy
    RAWPY_AVAILABLE = True
except ImportError:
    RAWPY_AVAILABLE = False
    logger.warning(
        "rawpy not available - full RAW processing disabled. "
        "Install with: pip install rawpy (requires LibRaw system library)"
    )


class RawFormat(Enum):
    """Supported RAW file formats."""
    CR2 = "cr2"  # Canon CR2
    CR3 = "cr3"  # Canon CR3
    NEF = "nef"  # Nikon NEF
    ARW = "arw"  # Sony ARW
    RAF = "raf"  # Fujifilm RAF
    ORF = "orf"  # Olympus ORF
    RW2 = "rw2"  # Panasonic RW2
    DNG = "dng"  # Adobe DNG


class RawProcessingError(Exception):
    """Base RAW processing error."""

    def __init__(self, message: str, code: str = "RAW_PROCESSING_ERROR"):
        super().__init__(message)
        self.code = code


class RawProcessingService:
    """Service for processing RAW image files."""

    # RAW file format signatures (magic bytes)
    RAW_SIGNATURES: Dict[bytes, RawFormat] = {
        b"II*\x00\x10\x00\x00\x00CR": RawFormat.CR2,  # Canon CR2
        b"ftypcrx": RawFormat.CR3,  # Canon CR3 (MP4 container)
        b"MM\x00\x2A": RawFormat.NEF,  # Nikon NEF (TIFF-based)
        b"II*\x00\x08\x00\x00\x00": RawFormat.ARW,  # Sony ARW (TIFF-based)
        b"FUJIFILM": RawFormat.RAF,  # Fujifilm RAF
        b"IIRO": RawFormat.ORF,  # Olympus ORF
        b"IIU\x00": RawFormat.RW2,  # Panasonic RW2
        b"DNG": RawFormat.DNG,  # Adobe DNG
    }

    def detect_raw_format(self, file_data: bytes, filename: str) -> Optional[RawFormat]:
        """Detect RAW file format from magic bytes or filename.

        Args:
            file_data: File bytes
            filename: Original filename

        Returns:
            RawFormat enum if detected, None otherwise
        """
        # Check magic bytes first
        for signature, format_type in self.RAW_SIGNATURES.items():
            if file_data.startswith(signature):
                return format_type

        # Fallback to filename extension
        ext = filename.lower().split(".")[-1] if "." in filename else ""
        try:
            return RawFormat(ext)
        except ValueError:
            return None

    def is_raw_file(self, file_data: bytes, filename: str) -> bool:
        """Check if file is a RAW format.

        Args:
            file_data: File bytes
            filename: Original filename

        Returns:
            True if RAW format detected
        """
        return self.detect_raw_format(file_data, filename) is not None

    def extract_embedded_preview(
        self,
        raw_data: bytes,
        workspace_id: UUID,
    ) -> Tuple[bytes, int, int]:
        """Extract embedded JPEG preview from RAW file for immediate display.

        Most RAW files contain a JPEG preview embedded in the file.
        This is much faster than full RAW processing and allows immediate display.

        Args:
            raw_data: RAW file bytes
            workspace_id: Workspace UUID (for logging)

        Returns:
            Tuple of (jpeg_bytes, width, height)

        Raises:
            RawProcessingError: If extraction fails
        """
        try:
            if not RAWPY_AVAILABLE:
                raise RawProcessingError(
                    "rawpy not available - cannot extract embedded preview",
                    "RAWPY_NOT_AVAILABLE",
                )

            # Use rawpy to extract embedded preview
            with rawpy.imread(io.BytesIO(raw_data)) as raw:
                # Extract the largest embedded preview
                try:
                    # Try to get the largest preview (usually full-size JPEG)
                    preview = raw.extract_thumb()
                    
                    if preview.format == rawpy.ThumbFormat.JPEG:
                        # Preview is already JPEG
                        preview_bytes = preview.data
                        width = preview.width
                        height = preview.height
                    elif preview.format == rawpy.ThumbFormat.BITMAP:
                        # Preview is bitmap - convert to JPEG
                        image = Image.fromarray(preview.data)
                        output = io.BytesIO()
                        image.convert("RGB").save(output, format="JPEG", quality=90)
                        preview_bytes = output.getvalue()
                        width, height = image.size
                    else:
                        raise RawProcessingError(
                            f"Unsupported preview format: {preview.format}",
                            "UNSUPPORTED_PREVIEW_FORMAT",
                        )

                    logger.info(
                        f"Extracted embedded preview: {width}x{height} for workspace {workspace_id}"
                    )
                    return preview_bytes, width, height

                except rawpy.LibRawNoThumbnailError:
                    # No embedded preview - need to process RAW
                    raise RawProcessingError(
                        "No embedded preview found - full RAW processing required",
                        "NO_PREVIEW",
                    )

        except rawpy.LibRawFileUnsupportedError as e:
            raise RawProcessingError(
                f"Unsupported RAW format: {e}",
                "UNSUPPORTED_FORMAT",
            ) from e
        except Exception as e:
            logger.error(f"Failed to extract embedded preview: {e}")
            raise RawProcessingError(
                f"Preview extraction failed: {e}",
                "EXTRACTION_FAILED",
            ) from e

    def process_raw_to_jpeg(
        self,
        raw_data: bytes,
        workspace_id: UUID,
        quality: int = 92,
        max_dimension: Optional[int] = None,
    ) -> Tuple[bytes, int, int]:
        """Process RAW file to high-quality JPEG.

        This performs full RAW processing including demosaicing, color correction,
        and tone mapping. Use this for high-quality conversions.

        Args:
            raw_data: RAW file bytes
            workspace_id: Workspace UUID (for logging)
            quality: JPEG quality (1-100, default 92)
            max_dimension: Maximum width or height (maintains aspect ratio)

        Returns:
            Tuple of (jpeg_bytes, width, height)

        Raises:
            RawProcessingError: If processing fails
        """
        try:
            if not RAWPY_AVAILABLE:
                raise RawProcessingError(
                    "rawpy not available - cannot process RAW files",
                    "RAWPY_NOT_AVAILABLE",
                )

            with rawpy.imread(io.BytesIO(raw_data)) as raw:
                # Process RAW with default settings
                # rawpy handles demosaicing, color correction automatically
                rgb = raw.postprocess(
                    use_camera_wb=True,  # Use camera white balance
                    half_size=False,  # Full resolution
                    no_auto_bright=False,  # Auto brightness adjustment
                    output_bps=8,  # 8-bit output
                )

                # Convert numpy array to PIL Image
                image = Image.fromarray(rgb)

                # Resize if max_dimension specified
                if max_dimension:
                    width, height = image.size
                    if width > max_dimension or height > max_dimension:
                        if width > height:
                            new_width = max_dimension
                            new_height = int(height * (max_dimension / width))
                        else:
                            new_height = max_dimension
                            new_width = int(width * (max_dimension / height))
                        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

                # Convert to JPEG
                output = io.BytesIO()
                image.convert("RGB").save(
                    output,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                )
                jpeg_bytes = output.getvalue()
                width, height = image.size

                logger.info(
                    f"Processed RAW to JPEG: {width}x{height}, {len(jpeg_bytes)} bytes "
                    f"for workspace {workspace_id}"
                )
                return jpeg_bytes, width, height

        except rawpy.LibRawFileUnsupportedError as e:
            raise RawProcessingError(
                f"Unsupported RAW format: {e}",
                "UNSUPPORTED_FORMAT",
            ) from e
        except Exception as e:
            logger.error(f"Failed to process RAW to JPEG: {e}")
            raise RawProcessingError(
                f"RAW processing failed: {e}",
                "PROCESSING_FAILED",
            ) from e

    def process_raw_to_tiff(
        self,
        raw_data: bytes,
        workspace_id: UUID,
        max_dimension: Optional[int] = None,
    ) -> Tuple[bytes, int, int]:
        """Process RAW file to high-quality TIFF (16-bit).

        TIFF preserves more color information than JPEG and is lossless.
        Use this for archival or high-quality exports.

        Args:
            raw_data: RAW file bytes
            workspace_id: Workspace UUID (for logging)
            max_dimension: Maximum width or height (maintains aspect ratio)

        Returns:
            Tuple of (tiff_bytes, width, height)

        Raises:
            RawProcessingError: If processing fails
        """
        try:
            if not RAWPY_AVAILABLE:
                raise RawProcessingError(
                    "rawpy not available - cannot process RAW files",
                    "RAWPY_NOT_AVAILABLE",
                )

            with rawpy.imread(io.BytesIO(raw_data)) as raw:
                # Process RAW with 16-bit output for TIFF
                rgb = raw.postprocess(
                    use_camera_wb=True,
                    half_size=False,
                    no_auto_bright=False,
                    output_bps=16,  # 16-bit output for TIFF
                )

                # Convert numpy array to PIL Image
                image = Image.fromarray(rgb)

                # Resize if max_dimension specified
                if max_dimension:
                    width, height = image.size
                    if width > max_dimension or height > max_dimension:
                        if width > height:
                            new_width = max_dimension
                            new_height = int(height * (max_dimension / width))
                        else:
                            new_height = max_dimension
                            new_width = int(width * (max_dimension / height))
                        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)

                # Convert to TIFF
                output = io.BytesIO()
                image.save(
                    output,
                    format="TIFF",
                    compression="lzw",  # Lossless compression
                )
                tiff_bytes = output.getvalue()
                width, height = image.size

                logger.info(
                    f"Processed RAW to TIFF: {width}x{height}, {len(tiff_bytes)} bytes "
                    f"for workspace {workspace_id}"
                )
                return tiff_bytes, width, height

        except rawpy.LibRawFileUnsupportedError as e:
            raise RawProcessingError(
                f"Unsupported RAW format: {e}",
                "UNSUPPORTED_FORMAT",
            ) from e
        except Exception as e:
            logger.error(f"Failed to process RAW to TIFF: {e}")
            raise RawProcessingError(
                f"RAW processing failed: {e}",
                "PROCESSING_FAILED",
            ) from e

    def get_raw_info(self, raw_data: bytes) -> Dict[str, Any]:
        """Get RAW file information without full processing.

        Args:
            raw_data: RAW file bytes

        Returns:
            Dictionary with RAW file information (dimensions, color space, etc.)

        Raises:
            RawProcessingError: If reading fails
        """
        try:
            if not RAWPY_AVAILABLE:
                raise RawProcessingError(
                    "rawpy not available - cannot read RAW info",
                    "RAWPY_NOT_AVAILABLE",
                )

            with rawpy.imread(io.BytesIO(raw_data)) as raw:
                info = {
                    "width": raw.sizes.width,
                    "height": raw.sizes.height,
                    "colors": raw.sizes.colors,
                    "pixel_aspect": raw.sizes.pixel_aspect,
                    "raw_type": raw.sizes.raw_type,
                    "camera_whitebalance": raw.camera_whitebalance,
                    "daylight_whitebalance": raw.daylight_whitebalance,
                }

                # Try to get camera make/model from metadata
                try:
                    if hasattr(raw, "color_desc"):
                        info["color_description"] = raw.color_desc.decode("utf-8", errors="ignore")
                except Exception:
                    pass

                return info

        except rawpy.LibRawFileUnsupportedError as e:
            raise RawProcessingError(
                f"Unsupported RAW format: {e}",
                "UNSUPPORTED_FORMAT",
            ) from e
        except Exception as e:
            logger.error(f"Failed to get RAW info: {e}")
            raise RawProcessingError(
                f"RAW info extraction failed: {e}",
                "INFO_EXTRACTION_FAILED",
            ) from e


# Export singleton instance
_raw_processing_service: Optional[RawProcessingService] = None


def get_raw_processing_service() -> RawProcessingService:
    """Get singleton RAW processing service instance."""
    global _raw_processing_service
    if _raw_processing_service is None:
        _raw_processing_service = RawProcessingService()
    return _raw_processing_service

