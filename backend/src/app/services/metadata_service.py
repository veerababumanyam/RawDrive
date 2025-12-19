"""MetadataService: Extract EXIF metadata from images using exifread (open-source).

Supports GPS privacy settings and comprehensive metadata extraction.
"""

from __future__ import annotations

import io
import logging
from typing import Optional
from uuid import UUID

import exifread

logger = logging.getLogger(__name__)


class MetadataError(Exception):
    """Base metadata error."""

    def __init__(self, message: str, code: str = "METADATA_ERROR"):
        super().__init__(message)
        self.code = code


class MetadataService:
    """Service for extracting EXIF metadata from images."""

    def extract_metadata(
        self,
        image_data: bytes,
        workspace_id: UUID,
        strip_gps: bool = False,
    ) -> dict:
        """Extract EXIF metadata from image.

        Args:
            image_data: Image file bytes
            workspace_id: Workspace UUID (for privacy settings)
            strip_gps: Whether to strip GPS coordinates for privacy

        Returns:
            Dictionary with extracted metadata

        Raises:
            MetadataError: If extraction fails
        """
        try:
            # Parse EXIF data using exifread (requires file-like object)
            image_file = io.BytesIO(image_data)
            tags = exifread.process_file(
                image_file,
                details=True,
                strict=True,
            )

            metadata = {}

            # Extract camera information
            if "Image Make" in tags:
                metadata["make"] = str(tags["Image Make"])
            if "Image Model" in tags:
                metadata["model"] = str(tags["Image Model"])

            # Extract lens information
            if "EXIF LensModel" in tags:
                metadata["lens"] = str(tags["EXIF LensModel"])
            elif "EXIF LensType" in tags:
                metadata["lens"] = str(tags["EXIF LensType"])

            # Extract exposure settings
            if "EXIF FNumber" in tags:
                fnumber = tags["EXIF FNumber"]
                metadata["aperture"] = float(fnumber.values[0].num) / float(
                    fnumber.values[0].den
                )
            if "EXIF ExposureTime" in tags:
                exposure = tags["EXIF ExposureTime"]
                metadata["shutter_speed"] = str(exposure.values[0])
            if "EXIF ISOSpeedRatings" in tags:
                metadata["iso"] = int(str(tags["EXIF ISOSpeedRatings"]))
            if "EXIF FocalLength" in tags:
                focal = tags["EXIF FocalLength"]
                metadata["focal_length"] = float(focal.values[0].num) / float(
                    focal.values[0].den
                )

            # Extract flash information
            if "EXIF Flash" in tags:
                flash_value = int(str(tags["EXIF Flash"]))
                metadata["flash"] = bool(flash_value & 0x1)

            # Extract image dimensions
            if "EXIF ExifImageWidth" in tags:
                metadata["width"] = int(str(tags["EXIF ExifImageWidth"]))
            if "EXIF ExifImageLength" in tags:
                metadata["height"] = int(str(tags["EXIF ExifImageLength"]))
            elif "Image ImageWidth" in tags:
                metadata["width"] = int(str(tags["Image ImageWidth"]))
            if "Image ImageLength" in tags:
                metadata["height"] = int(str(tags["Image ImageLength"]))

            # Extract orientation
            if "Image Orientation" in tags:
                metadata["orientation"] = int(str(tags["Image Orientation"]))

            # Extract date taken
            if "EXIF DateTimeOriginal" in tags:
                metadata["date_taken"] = str(tags["EXIF DateTimeOriginal"])
            elif "Image DateTime" in tags:
                metadata["date_taken"] = str(tags["Image DateTime"])

            # Extract GPS coordinates (if not stripped)
            if not strip_gps:
                gps_data = {}
                if "GPS GPSLatitude" in tags and "GPS GPSLatitudeRef" in tags:
                    lat = self._convert_to_degrees(tags["GPS GPSLatitude"])
                    lat_ref = str(tags["GPS GPSLatitudeRef"])
                    if lat_ref == "S":
                        lat = -lat
                    gps_data["latitude"] = lat

                if "GPS GPSLongitude" in tags and "GPS GPSLongitudeRef" in tags:
                    lon = self._convert_to_degrees(tags["GPS GPSLongitude"])
                    lon_ref = str(tags["GPS GPSLongitudeRef"])
                    if lon_ref == "W":
                        lon = -lon
                    gps_data["longitude"] = lon

                if "GPS GPSAltitude" in tags:
                    alt = tags["GPS GPSAltitude"]
                    gps_data["altitude"] = float(alt.values[0].num) / float(
                        alt.values[0].den
                    )

                if gps_data:
                    metadata["gps"] = gps_data
            else:
                # Log that GPS was stripped for privacy
                logger.debug(
                    f"GPS coordinates stripped for workspace {workspace_id} (privacy setting)"
                )

            return metadata

        except Exception as e:
            logger.error(f"Failed to extract metadata: {e}")
            raise MetadataError(f"Metadata extraction failed: {e}", "EXTRACTION_FAILED") from e

    def _convert_to_degrees(self, value) -> float:
        """Convert GPS coordinate to decimal degrees.

        Args:
            value: EXIF GPS coordinate value

        Returns:
            Decimal degrees
        """
        d = float(value.values[0].num) / float(value.values[0].den)
        m = float(value.values[1].num) / float(value.values[1].den)
        s = float(value.values[2].num) / float(value.values[2].den)
        return d + (m / 60.0) + (s / 3600.0)


# Export singleton instance
_metadata_service: Optional[MetadataService] = None


def get_metadata_service() -> MetadataService:
    """Get singleton metadata service instance."""
    global _metadata_service
    if _metadata_service is None:
        _metadata_service = MetadataService()
    return _metadata_service

