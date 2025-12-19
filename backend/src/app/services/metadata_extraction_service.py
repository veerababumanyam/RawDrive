"""Comprehensive Metadata Extraction Service.

Extracts standard EXIF/XMP/IPTC metadata and camera-specific fields.
Supports Canon, Sony, Nikon, Fujifilm, Panasonic, Olympus, Leica, Hasselblad, Phase One.

Classifies metadata as MANDATORY vs OPTIONAL per design spec.
"""

from __future__ import annotations

import io
import logging
from typing import Optional, Dict, Any
from uuid import UUID
from enum import Enum

import exifread

logger = logging.getLogger(__name__)


class MetadataCategory(Enum):
    """Metadata classification categories."""
    MANDATORY = "mandatory"  # Core fields required for all photos
    OPTIONAL = "optional"    # Additional fields that enhance search/display


class MetadataError(Exception):
    """Base metadata error."""

    def __init__(self, message: str, code: str = "METADATA_ERROR"):
        super().__init__(message)
        self.code = code


class MetadataExtractionService:
    """Comprehensive service for extracting metadata from images."""

    # MANDATORY fields - core technical metadata required for all photos
    MANDATORY_FIELDS = {
        "make",           # Camera manufacturer
        "model",          # Camera model
        "width",          # Image width
        "height",         # Image height
        "date_taken",     # Date/time photo was taken
        "orientation",    # Image orientation
    }

    def extract_metadata(
        self,
        image_data: bytes,
        workspace_id: UUID,
        strip_gps: bool = False,
    ) -> Dict[str, Any]:
        """Extract comprehensive metadata from image.

        Args:
            image_data: Image file bytes
            workspace_id: Workspace UUID (for privacy settings)
            strip_gps: Whether to strip GPS coordinates for privacy

        Returns:
            Dictionary with extracted metadata, including:
            - Standard EXIF/XMP/IPTC fields
            - Camera-specific fields (Canon, Sony, Nikon, Fujifilm, etc.)
            - Classification (mandatory vs optional)

        Raises:
            MetadataError: If extraction fails
        """
        try:
            # Parse EXIF data using exifread
            image_file = io.BytesIO(image_data)
            tags = exifread.process_file(
                image_file,
                details=True,
                strict=True,
            )

            metadata: Dict[str, Any] = {
                "mandatory": {},
                "optional": {},
                "camera_specific": {},
            }

            # Extract camera make and model (MANDATORY)
            make = self._get_tag_value(tags, "Image Make")
            model = self._get_tag_value(tags, "Image Model")
            
            if make:
                metadata["mandatory"]["make"] = make
            if model:
                metadata["mandatory"]["model"] = model

            # Extract standard EXIF fields
            self._extract_standard_exif(tags, metadata, strip_gps, workspace_id)

            # Extract camera-specific metadata based on make
            if make:
                make_lower = make.lower()
                if "canon" in make_lower:
                    self._extract_canon_metadata(tags, metadata)
                elif "sony" in make_lower:
                    self._extract_sony_metadata(tags, metadata)
                elif "nikon" in make_lower:
                    self._extract_nikon_metadata(tags, metadata)
                elif "fujifilm" in make_lower or "fuji" in make_lower:
                    self._extract_fujifilm_metadata(tags, metadata)
                elif "panasonic" in make_lower:
                    self._extract_panasonic_metadata(tags, metadata)
                elif "olympus" in make_lower:
                    self._extract_olympus_metadata(tags, metadata)
                elif "leica" in make_lower:
                    self._extract_leica_metadata(tags, metadata)
                elif "hasselblad" in make_lower:
                    self._extract_hasselblad_metadata(tags, metadata)
                elif "phase one" in make_lower:
                    self._extract_phase_one_metadata(tags, metadata)

            return metadata

        except Exception as e:
            logger.error(f"Failed to extract metadata: {e}")
            raise MetadataError(f"Metadata extraction failed: {e}", "EXTRACTION_FAILED") from e

    def _get_tag_value(self, tags: Dict, tag_name: str) -> Optional[str]:
        """Safely get tag value as string."""
        if tag_name in tags:
            return str(tags[tag_name]).strip()
        return None

    def _get_tag_int(self, tags: Dict, tag_name: str) -> Optional[int]:
        """Safely get tag value as integer."""
        if tag_name in tags:
            try:
                return int(str(tags[tag_name]))
            except (ValueError, TypeError):
                return None
        return None

    def _get_tag_float(self, tags: Dict, tag_name: str) -> Optional[float]:
        """Safely get tag value as float."""
        if tag_name in tags:
            try:
                tag = tags[tag_name]
                if hasattr(tag, 'values') and len(tag.values) > 0:
                    return float(tag.values[0].num) / float(tag.values[0].den)
                return float(str(tag))
            except (ValueError, TypeError, ZeroDivisionError):
                return None
        return None

    def _extract_standard_exif(
        self,
        tags: Dict,
        metadata: Dict[str, Any],
        strip_gps: bool,
        workspace_id: UUID,
    ) -> None:
        """Extract standard EXIF/XMP/IPTC metadata fields."""
        # Lens information (OPTIONAL)
        lens = (
            self._get_tag_value(tags, "EXIF LensModel")
            or self._get_tag_value(tags, "EXIF LensType")
            or self._get_tag_value(tags, "EXIF LensMake")
        )
        if lens:
            metadata["optional"]["lens"] = lens

        # Exposure settings (OPTIONAL but important)
        if "EXIF FNumber" in tags:
            aperture = self._get_tag_float(tags, "EXIF FNumber")
            if aperture:
                metadata["optional"]["aperture"] = round(aperture, 1)

        if "EXIF ExposureTime" in tags:
            exposure = tags["EXIF ExposureTime"]
            metadata["optional"]["shutter_speed"] = str(exposure.values[0])

        if "EXIF ISOSpeedRatings" in tags:
            iso = self._get_tag_int(tags, "EXIF ISOSpeedRatings")
            if iso:
                metadata["optional"]["iso"] = iso

        if "EXIF FocalLength" in tags:
            focal_length = self._get_tag_float(tags, "EXIF FocalLength")
            if focal_length:
                metadata["optional"]["focal_length"] = round(focal_length, 1)

        # Flash information (OPTIONAL)
        if "EXIF Flash" in tags:
            flash_value = self._get_tag_int(tags, "EXIF Flash")
            if flash_value is not None:
                metadata["optional"]["flash"] = bool(flash_value & 0x1)

        # Image dimensions (MANDATORY)
        width = (
            self._get_tag_int(tags, "EXIF ExifImageWidth")
            or self._get_tag_int(tags, "Image ImageWidth")
        )
        height = (
            self._get_tag_int(tags, "EXIF ExifImageLength")
            or self._get_tag_int(tags, "Image ImageLength")
        )
        if width:
            metadata["mandatory"]["width"] = width
        if height:
            metadata["mandatory"]["height"] = height

        # Orientation (MANDATORY)
        orientation = self._get_tag_int(tags, "Image Orientation")
        if orientation:
            metadata["mandatory"]["orientation"] = orientation

        # Date taken (MANDATORY)
        date_taken = (
            self._get_tag_value(tags, "EXIF DateTimeOriginal")
            or self._get_tag_value(tags, "Image DateTime")
            or self._get_tag_value(tags, "EXIF DateTimeDigitized")
        )
        if date_taken:
            metadata["mandatory"]["date_taken"] = date_taken

        # GPS coordinates (OPTIONAL, privacy-sensitive)
        if not strip_gps:
            gps_data = {}
            if "GPS GPSLatitude" in tags and "GPS GPSLatitudeRef" in tags:
                lat = self._convert_to_degrees(tags["GPS GPSLatitude"])
                lat_ref = self._get_tag_value(tags, "GPS GPSLatitudeRef")
                if lat_ref == "S":
                    lat = -lat
                gps_data["latitude"] = round(lat, 6)

            if "GPS GPSLongitude" in tags and "GPS GPSLongitudeRef" in tags:
                lon = self._convert_to_degrees(tags["GPS GPSLongitude"])
                lon_ref = self._get_tag_value(tags, "GPS GPSLongitudeRef")
                if lon_ref == "W":
                    lon = -lon
                gps_data["longitude"] = round(lon, 6)

            if "GPS GPSAltitude" in tags:
                altitude = self._get_tag_float(tags, "GPS GPSAltitude")
                if altitude:
                    gps_data["altitude"] = round(altitude, 2)

            if gps_data:
                metadata["optional"]["gps"] = gps_data
        else:
            logger.debug(f"GPS coordinates stripped for workspace {workspace_id} (privacy setting)")

        # White balance (OPTIONAL)
        if "EXIF WhiteBalance" in tags:
            wb = self._get_tag_int(tags, "EXIF WhiteBalance")
            if wb is not None:
                metadata["optional"]["white_balance"] = "auto" if wb == 0 else "manual"

        # Metering mode (OPTIONAL)
        if "EXIF MeteringMode" in tags:
            metering = self._get_tag_int(tags, "EXIF MeteringMode")
            if metering is not None:
                metadata["optional"]["metering_mode"] = metering

        # Exposure mode (OPTIONAL)
        if "EXIF ExposureMode" in tags:
            exp_mode = self._get_tag_int(tags, "EXIF ExposureMode")
            if exp_mode is not None:
                metadata["optional"]["exposure_mode"] = exp_mode

    def _extract_canon_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Canon-specific metadata fields."""
        canon_fields = {}

        # Picture Style
        if "EXIF PictureStyle" in tags:
            canon_fields["picture_style"] = self._get_tag_value(tags, "EXIF PictureStyle")

        # Highlight Tone Priority
        if "EXIF HighlightTonePriority" in tags:
            canon_fields["highlight_tone_priority"] = self._get_tag_int(tags, "EXIF HighlightTonePriority")

        # Auto Lighting Optimizer
        if "EXIF AutoLightingOptimizer" in tags:
            canon_fields["auto_lighting_optimizer"] = self._get_tag_int(tags, "EXIF AutoLightingOptimizer")

        # Lens ID
        if "EXIF LensID" in tags:
            canon_fields["lens_id"] = self._get_tag_value(tags, "EXIF LensID")

        # AF Area Mode
        if "EXIF AFAreaMode" in tags:
            canon_fields["af_area_mode"] = self._get_tag_int(tags, "EXIF AFAreaMode")

        if canon_fields:
            metadata["camera_specific"]["canon"] = canon_fields

    def _extract_sony_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Sony-specific metadata fields."""
        sony_fields = {}

        # Creative Style
        if "EXIF CreativeStyle" in tags:
            sony_fields["creative_style"] = self._get_tag_value(tags, "EXIF CreativeStyle")

        # Dynamic Range Optimizer
        if "EXIF DynamicRangeOptimizer" in tags:
            sony_fields["dynamic_range_optimizer"] = self._get_tag_int(tags, "EXIF DynamicRangeOptimizer")

        # Focus Area
        if "EXIF FocusArea" in tags:
            sony_fields["focus_area"] = self._get_tag_value(tags, "EXIF FocusArea")

        # Face Detection Info
        if "EXIF FaceDetectionInfo" in tags:
            sony_fields["face_detection_info"] = self._get_tag_value(tags, "EXIF FaceDetectionInfo")

        if sony_fields:
            metadata["camera_specific"]["sony"] = sony_fields

    def _extract_nikon_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Nikon-specific metadata fields."""
        nikon_fields = {}

        # Picture Control
        if "EXIF PictureControl" in tags:
            nikon_fields["picture_control"] = self._get_tag_value(tags, "EXIF PictureControl")

        # Active D-Lighting
        if "EXIF ActiveDLighting" in tags:
            nikon_fields["active_d_lighting"] = self._get_tag_int(tags, "EXIF ActiveDLighting")

        # VR Mode (Vibration Reduction)
        if "EXIF VRMode" in tags:
            nikon_fields["vr_mode"] = self._get_tag_int(tags, "EXIF VRMode")

        # Focus Tracking
        if "EXIF FocusTracking" in tags:
            nikon_fields["focus_tracking"] = self._get_tag_value(tags, "EXIF FocusTracking")

        if nikon_fields:
            metadata["camera_specific"]["nikon"] = nikon_fields

    def _extract_fujifilm_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Fujifilm-specific metadata fields."""
        fuji_fields = {}

        # Film Simulation
        if "EXIF FilmSimulation" in tags:
            fuji_fields["film_simulation"] = self._get_tag_value(tags, "EXIF FilmSimulation")

        # Grain Effect
        if "EXIF GrainEffect" in tags:
            fuji_fields["grain_effect"] = self._get_tag_int(tags, "EXIF GrainEffect")

        # Color Chrome Effect
        if "EXIF ColorChromeEffect" in tags:
            fuji_fields["color_chrome_effect"] = self._get_tag_int(tags, "EXIF ColorChromeEffect")

        # Dynamic Range
        if "EXIF DynamicRange" in tags:
            fuji_fields["dynamic_range"] = self._get_tag_value(tags, "EXIF DynamicRange")

        if fuji_fields:
            metadata["camera_specific"]["fujifilm"] = fuji_fields

    def _extract_panasonic_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Panasonic-specific metadata fields."""
        panasonic_fields = {}

        # Film Mode
        if "EXIF FilmMode" in tags:
            panasonic_fields["film_mode"] = self._get_tag_value(tags, "EXIF FilmMode")

        # Intelligent Resolution
        if "EXIF IntelligentResolution" in tags:
            panasonic_fields["intelligent_resolution"] = self._get_tag_int(tags, "EXIF IntelligentResolution")

        if panasonic_fields:
            metadata["camera_specific"]["panasonic"] = panasonic_fields

    def _extract_olympus_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Olympus-specific metadata fields."""
        olympus_fields = {}

        # Art Filter
        if "EXIF ArtFilter" in tags:
            olympus_fields["art_filter"] = self._get_tag_value(tags, "EXIF ArtFilter")

        # Gradation
        if "EXIF Gradation" in tags:
            olympus_fields["gradation"] = self._get_tag_value(tags, "EXIF Gradation")

        if olympus_fields:
            metadata["camera_specific"]["olympus"] = olympus_fields

    def _extract_leica_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Leica-specific metadata fields."""
        leica_fields = {}

        # Film Mode
        if "EXIF FilmMode" in tags:
            leica_fields["film_mode"] = self._get_tag_value(tags, "EXIF FilmMode")

        # Lens Type
        if "EXIF LeicaLensType" in tags:
            leica_fields["lens_type"] = self._get_tag_value(tags, "EXIF LeicaLensType")

        if leica_fields:
            metadata["camera_specific"]["leica"] = leica_fields

    def _extract_hasselblad_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Hasselblad-specific metadata fields."""
        hasselblad_fields = {}

        # Sensor Unit
        if "EXIF SensorUnit" in tags:
            hasselblad_fields["sensor_unit"] = self._get_tag_value(tags, "EXIF SensorUnit")

        # Capture Mode
        if "EXIF CaptureMode" in tags:
            hasselblad_fields["capture_mode"] = self._get_tag_value(tags, "EXIF CaptureMode")

        if hasselblad_fields:
            metadata["camera_specific"]["hasselblad"] = hasselblad_fields

    def _extract_phase_one_metadata(self, tags: Dict, metadata: Dict[str, Any]) -> None:
        """Extract Phase One-specific metadata fields."""
        phase_one_fields = {}

        # Capture One Settings
        if "EXIF CaptureOneSettings" in tags:
            phase_one_fields["capture_one_settings"] = self._get_tag_value(tags, "EXIF CaptureOneSettings")

        # Sensor Temperature
        if "EXIF SensorTemperature" in tags:
            phase_one_fields["sensor_temperature"] = self._get_tag_float(tags, "EXIF SensorTemperature")

        if phase_one_fields:
            metadata["camera_specific"]["phase_one"] = phase_one_fields

    def _convert_to_degrees(self, value) -> float:
        """Convert GPS coordinate to decimal degrees.

        Args:
            value: EXIF GPS coordinate value

        Returns:
            Decimal degrees
        """
        try:
            d = float(value.values[0].num) / float(value.values[0].den)
            m = float(value.values[1].num) / float(value.values[1].den)
            s = float(value.values[2].num) / float(value.values[2].den)
            return d + (m / 60.0) + (s / 3600.0)
        except (IndexError, AttributeError, ZeroDivisionError):
            return 0.0


# Export singleton instance
_metadata_extraction_service: Optional[MetadataExtractionService] = None


def get_metadata_extraction_service() -> MetadataExtractionService:
    """Get singleton metadata extraction service instance."""
    global _metadata_extraction_service
    if _metadata_extraction_service is None:
        _metadata_extraction_service = MetadataExtractionService()
    return _metadata_extraction_service

