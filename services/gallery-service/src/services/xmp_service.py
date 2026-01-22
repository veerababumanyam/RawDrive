"""
XMP Generation Service
Generates Adobe-compatible XMP sidecar files from asset metadata
Feature: 029-pro-review-xmp-sync
Task: T033

Uses lxml for XML generation to ensure proper namespace handling
and compatibility with Adobe Lightroom/Camera Raw.
"""

import io
import zipfile
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from uuid import UUID

from lxml import etree
from lxml.builder import ElementMaker

from src.schemas.xmp_sync import (
    XmpMetadata,
    XmpRating,
    XmpLabel,
    XmpFlag,
    XmpExportRequest,
    XmpExportPreview,
    XmpExportResult,
    COLOR_LABEL_TO_XMP,
    FLAG_TO_XMP,
    XMP_TO_COLOR_LABEL,
    XMP_TO_FLAG,
)
from src.config import get_settings

settings = get_settings()

# XML Namespaces for XMP
NAMESPACES = {
    "x": "adobe:ns:meta/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "xmp": "http://ns.adobe.com/xap/1.0/",
    "xmpMM": "http://ns.adobe.com/xap/1.0/mm/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "photoshop": "http://ns.adobe.com/photoshop/1.0/",
    "crs": "http://ns.adobe.com/camera-raw-settings/1.0/",
    "lr": "http://ns.adobe.com/lightroom/1.0/",
    "rawdrive": "http://rawdrive.in/xmp/1.0/",
}

# XMP packet header and trailer
XMP_PACKET_HEADER = '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>'
XMP_PACKET_TRAILER = '<?xpacket end="w"?>'


class XmpService:
    """
    Service for generating and parsing XMP sidecar files.
    Provides Adobe Lightroom/Camera Raw compatible XMP generation.
    """

    def __init__(self):
        """Initialize XMP service with namespace prefixes."""
        # Register namespaces
        for prefix, uri in NAMESPACES.items():
            etree.register_namespace(prefix, uri)

    def generate_xmp_content(self, metadata: XmpMetadata) -> str:
        """
        Generate XMP sidecar content for a single asset.

        Args:
            metadata: XmpMetadata object with asset metadata

        Returns:
            String containing the complete XMP file content
        """
        # Create the root x:xmpmeta element
        root = etree.Element(
            "{%s}xmpmeta" % NAMESPACES["x"],
            nsmap={
                "x": NAMESPACES["x"],
            },
        )
        root.set("{%s}xmptk" % NAMESPACES["x"], "RawDrive XMP Generator 1.0")

        # Create RDF root
        rdf = etree.SubElement(
            root,
            "{%s}RDF" % NAMESPACES["rdf"],
            nsmap={
                "rdf": NAMESPACES["rdf"],
                "xmp": NAMESPACES["xmp"],
                "xmpMM": NAMESPACES["xmpMM"],
                "dc": NAMESPACES["dc"],
                "photoshop": NAMESPACES["photoshop"],
                "crs": NAMESPACES["crs"],
                "lr": NAMESPACES["lr"],
                "rawdrive": NAMESPACES["rawdrive"],
            },
        )

        # Create Description element
        desc = etree.SubElement(
            rdf,
            "{%s}Description" % NAMESPACES["rdf"],
        )
        desc.set("{%s}about" % NAMESPACES["rdf"], "")

        # Add XMP core metadata
        self._add_xmp_core(desc, metadata)

        # Add Dublin Core metadata
        self._add_dc_metadata(desc, metadata)

        # Add Photoshop metadata
        self._add_photoshop_metadata(desc, metadata)

        # Add Camera Raw / Lightroom metadata
        self._add_crs_metadata(desc, metadata)

        # Add RawDrive custom metadata
        self._add_rawdrive_metadata(desc, metadata)

        # Generate the XML string
        xml_content = etree.tostring(
            root,
            encoding="unicode",
            pretty_print=True,
            xml_declaration=False,
        )

        # Wrap in XMP packet
        return f'{XMP_PACKET_HEADER}\n{xml_content}\n{XMP_PACKET_TRAILER}'

    def _add_xmp_core(self, desc: etree._Element, metadata: XmpMetadata) -> None:
        """Add XMP core namespace metadata."""
        ns_xmp = NAMESPACES["xmp"]

        # Rating (1-5 stars, 0 = unrated, -1 = rejected in some apps)
        if metadata.rating is not None and metadata.rating > 0:
            desc.set("{%s}Rating" % ns_xmp, str(metadata.rating))

        # Label (color label)
        if metadata.label and metadata.label != XmpLabel.NONE:
            desc.set("{%s}Label" % ns_xmp, metadata.label)

        # Creation date
        if metadata.date_created:
            desc.set("{%s}CreateDate" % ns_xmp, metadata.date_created.isoformat())

        # Modification date
        modify_date = metadata.modify_date or datetime.now(timezone.utc)
        desc.set("{%s}ModifyDate" % ns_xmp, modify_date.isoformat())
        desc.set("{%s}MetadataDate" % ns_xmp, modify_date.isoformat())

    def _add_dc_metadata(self, desc: etree._Element, metadata: XmpMetadata) -> None:
        """Add Dublin Core namespace metadata."""
        ns_dc = NAMESPACES["dc"]
        ns_rdf = NAMESPACES["rdf"]

        # Title
        if metadata.title:
            title_elem = etree.SubElement(desc, "{%s}title" % ns_dc)
            alt = etree.SubElement(title_elem, "{%s}Alt" % ns_rdf)
            li = etree.SubElement(alt, "{%s}li" % ns_rdf)
            li.set("{%s}lang" % "{http://www.w3.org/XML/1998/namespace}", "x-default")
            li.text = metadata.title

        # Description
        if metadata.description:
            desc_elem = etree.SubElement(desc, "{%s}description" % ns_dc)
            alt = etree.SubElement(desc_elem, "{%s}Alt" % ns_rdf)
            li = etree.SubElement(alt, "{%s}li" % ns_rdf)
            li.set("{%s}lang" % "{http://www.w3.org/XML/1998/namespace}", "x-default")
            li.text = metadata.description

        # Creator
        if metadata.creator:
            creator_elem = etree.SubElement(desc, "{%s}creator" % ns_dc)
            seq = etree.SubElement(creator_elem, "{%s}Seq" % ns_rdf)
            li = etree.SubElement(seq, "{%s}li" % ns_rdf)
            li.text = metadata.creator

        # Rights/Copyright
        if metadata.copyright:
            rights_elem = etree.SubElement(desc, "{%s}rights" % ns_dc)
            alt = etree.SubElement(rights_elem, "{%s}Alt" % ns_rdf)
            li = etree.SubElement(alt, "{%s}li" % ns_rdf)
            li.set("{%s}lang" % "{http://www.w3.org/XML/1998/namespace}", "x-default")
            li.text = metadata.copyright

        # Keywords/subjects
        if metadata.keywords:
            subject_elem = etree.SubElement(desc, "{%s}subject" % ns_dc)
            bag = etree.SubElement(subject_elem, "{%s}Bag" % ns_rdf)
            for keyword in metadata.keywords:
                li = etree.SubElement(bag, "{%s}li" % ns_rdf)
                li.text = keyword

    def _add_photoshop_metadata(self, desc: etree._Element, metadata: XmpMetadata) -> None:
        """Add Photoshop namespace metadata."""
        ns_photoshop = NAMESPACES["photoshop"]

        # Urgency (used by some apps for pick/reject)
        # 1 = highest priority (pick), 8 = lowest (reject)
        if metadata.flag == XmpFlag.PICK:
            desc.set("{%s}Urgency" % ns_photoshop, "1")
        elif metadata.flag == XmpFlag.REJECT:
            desc.set("{%s}Urgency" % ns_photoshop, "8")

    def _add_crs_metadata(self, desc: etree._Element, metadata: XmpMetadata) -> None:
        """Add Camera Raw Settings namespace metadata."""
        ns_crs = NAMESPACES["crs"]

        # Camera Raw uses 'RawFileName' for original filename reference
        if metadata.original_filename:
            desc.set("{%s}RawFileName" % ns_crs, metadata.original_filename)

    def _add_rawdrive_metadata(self, desc: etree._Element, metadata: XmpMetadata) -> None:
        """Add RawDrive custom namespace metadata."""
        ns_rawdrive = NAMESPACES["rawdrive"]

        # Asset ID
        if metadata.rawdrive_asset_id:
            desc.set("{%s}AssetID" % ns_rawdrive, metadata.rawdrive_asset_id)

        # Gallery ID
        if metadata.rawdrive_gallery_id:
            desc.set("{%s}GalleryID" % ns_rawdrive, metadata.rawdrive_gallery_id)

        # Sync timestamp
        if metadata.rawdrive_sync_timestamp:
            desc.set("{%s}SyncTimestamp" % ns_rawdrive, metadata.rawdrive_sync_timestamp.isoformat())

        # Pick/reject flag (explicit field since xmp:Label is for colors)
        if metadata.flag and metadata.flag != XmpFlag.UNFLAGGED:
            desc.set("{%s}Flag" % ns_rawdrive, metadata.flag)

    def parse_xmp_content(self, content: str) -> Optional[XmpMetadata]:
        """
        Parse XMP sidecar content and extract metadata.

        Args:
            content: String containing XMP file content

        Returns:
            XmpMetadata object or None if parsing fails
        """
        try:
            # Remove XMP packet markers if present
            content = content.strip()
            if content.startswith("<?xpacket"):
                # Find the actual XML content
                start_idx = content.find("<x:xmpmeta")
                if start_idx == -1:
                    start_idx = content.find("<rdf:RDF")
                end_idx = content.rfind("</x:xmpmeta>")
                if end_idx == -1:
                    end_idx = content.rfind("</rdf:RDF>")
                if start_idx != -1 and end_idx != -1:
                    end_idx = end_idx + len("</x:xmpmeta>") if "</x:xmpmeta>" in content else end_idx + len("</rdf:RDF>")
                    content = content[start_idx:end_idx]

            # Parse XML
            root = etree.fromstring(content.encode("utf-8"))

            # Find RDF Description element
            desc = root.find(".//{%s}Description" % NAMESPACES["rdf"])
            if desc is None:
                return None

            # Extract metadata
            ns_xmp = NAMESPACES["xmp"]
            ns_dc = NAMESPACES["dc"]
            ns_crs = NAMESPACES["crs"]
            ns_rawdrive = NAMESPACES["rawdrive"]
            ns_photoshop = NAMESPACES["photoshop"]
            ns_rdf = NAMESPACES["rdf"]

            # Rating
            rating_str = desc.get("{%s}Rating" % ns_xmp)
            rating = XmpRating(int(rating_str)) if rating_str else XmpRating.UNRATED

            # Label (color)
            label_str = desc.get("{%s}Label" % ns_xmp, "")
            try:
                label = XmpLabel(label_str)
            except ValueError:
                label = XmpLabel.NONE

            # Flag (check rawdrive namespace first, then photoshop:Urgency)
            flag_str = desc.get("{%s}Flag" % ns_rawdrive, "")
            if flag_str:
                try:
                    flag = XmpFlag(flag_str)
                except ValueError:
                    flag = XmpFlag.UNFLAGGED
            else:
                urgency = desc.get("{%s}Urgency" % ns_photoshop)
                if urgency == "1":
                    flag = XmpFlag.PICK
                elif urgency == "8":
                    flag = XmpFlag.REJECT
                else:
                    flag = XmpFlag.UNFLAGGED

            # Original filename
            original_filename = desc.get("{%s}RawFileName" % ns_crs, "")

            # Title
            title = None
            title_elem = desc.find("{%s}title/{%s}Alt/{%s}li" % (ns_dc, ns_rdf, ns_rdf))
            if title_elem is not None and title_elem.text:
                title = title_elem.text

            # Description
            description = None
            desc_elem = desc.find("{%s}description/{%s}Alt/{%s}li" % (ns_dc, ns_rdf, ns_rdf))
            if desc_elem is not None and desc_elem.text:
                description = desc_elem.text

            # Creator
            creator = None
            creator_elem = desc.find("{%s}creator/{%s}Seq/{%s}li" % (ns_dc, ns_rdf, ns_rdf))
            if creator_elem is not None and creator_elem.text:
                creator = creator_elem.text

            # Copyright
            copyright_text = None
            rights_elem = desc.find("{%s}rights/{%s}Alt/{%s}li" % (ns_dc, ns_rdf, ns_rdf))
            if rights_elem is not None and rights_elem.text:
                copyright_text = rights_elem.text

            # Keywords
            keywords = []
            subject_elem = desc.find("{%s}subject/{%s}Bag" % (ns_dc, ns_rdf))
            if subject_elem is not None:
                for li in subject_elem.findall("{%s}li" % ns_rdf):
                    if li.text:
                        keywords.append(li.text)

            # RawDrive IDs
            rawdrive_asset_id = desc.get("{%s}AssetID" % ns_rawdrive)
            rawdrive_gallery_id = desc.get("{%s}GalleryID" % ns_rawdrive)
            sync_timestamp_str = desc.get("{%s}SyncTimestamp" % ns_rawdrive)
            rawdrive_sync_timestamp = None
            if sync_timestamp_str:
                try:
                    rawdrive_sync_timestamp = datetime.fromisoformat(sync_timestamp_str)
                except ValueError:
                    pass

            return XmpMetadata(
                filename=original_filename.rsplit(".", 1)[0] if original_filename else "",
                original_filename=original_filename,
                rating=rating,
                label=label,
                flag=flag,
                title=title,
                description=description,
                creator=creator,
                copyright=copyright_text,
                keywords=keywords,
                rawdrive_asset_id=rawdrive_asset_id,
                rawdrive_gallery_id=rawdrive_gallery_id,
                rawdrive_sync_timestamp=rawdrive_sync_timestamp,
            )

        except Exception as e:
            # Log error but don't crash
            print(f"Error parsing XMP content: {e}")
            return None

    def get_xmp_filename(self, original_filename: str) -> str:
        """
        Generate XMP sidecar filename from original image filename.

        Args:
            original_filename: Original image filename (e.g., "IMG_1234.CR2")

        Returns:
            XMP sidecar filename (e.g., "IMG_1234.xmp")
        """
        # Split filename and extension
        if "." in original_filename:
            base_name = original_filename.rsplit(".", 1)[0]
        else:
            base_name = original_filename

        return f"{base_name}.xmp"

    def create_xmp_zip(
        self,
        assets: List[Dict[str, Any]],
        gallery_id: str,
        include_rawdrive_metadata: bool = True,
    ) -> Tuple[bytes, str]:
        """
        Create a ZIP file containing XMP sidecar files for multiple assets.

        Args:
            assets: List of asset dictionaries with metadata
            gallery_id: Gallery UUID
            include_rawdrive_metadata: Whether to include RawDrive-specific fields

        Returns:
            Tuple of (ZIP file bytes, suggested filename)
        """
        # Create in-memory ZIP file
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for asset in assets:
                # Convert asset dict to XmpMetadata
                metadata = self._asset_to_xmp_metadata(
                    asset,
                    gallery_id,
                    include_rawdrive_metadata,
                )

                # Generate XMP content
                xmp_content = self.generate_xmp_content(metadata)

                # Get XMP filename
                xmp_filename = self.get_xmp_filename(asset.get("filename", "unknown"))

                # Add to ZIP
                zip_file.writestr(xmp_filename, xmp_content.encode("utf-8"))

        # Generate ZIP filename
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        zip_filename = f"xmp_export_{timestamp}.zip"

        return zip_buffer.getvalue(), zip_filename

    def _asset_to_xmp_metadata(
        self,
        asset: Dict[str, Any],
        gallery_id: str,
        include_rawdrive_metadata: bool = True,
    ) -> XmpMetadata:
        """
        Convert asset dictionary to XmpMetadata object.

        Args:
            asset: Asset dictionary from database
            gallery_id: Gallery UUID
            include_rawdrive_metadata: Whether to include RawDrive fields

        Returns:
            XmpMetadata object
        """
        # Map rating
        rating_value = asset.get("rating", 0) or 0
        rating = XmpRating(min(max(rating_value, 0), 5))

        # Map color label
        color_label = asset.get("color_label", "none") or "none"
        label = COLOR_LABEL_TO_XMP.get(color_label, XmpLabel.NONE)

        # Map flag
        flag_value = asset.get("flag", "unflagged") or "unflagged"
        flag = FLAG_TO_XMP.get(flag_value, XmpFlag.UNFLAGGED)

        # Get original filename
        original_filename = asset.get("filename", "unknown.jpg")

        # Build metadata object
        metadata = XmpMetadata(
            filename=original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename,
            original_filename=original_filename,
            rating=rating,
            label=label,
            flag=flag,
            title=asset.get("title"),
            description=asset.get("description"),
            creator=asset.get("photographer_name"),
            date_created=asset.get("captured_at") or asset.get("created_at"),
            modify_date=datetime.now(timezone.utc),
        )

        # Add keywords if available
        keywords = asset.get("keywords") or asset.get("tags") or []
        if keywords:
            if isinstance(keywords, str):
                metadata.keywords = [k.strip() for k in keywords.split(",")]
            else:
                metadata.keywords = list(keywords)

        # Add RawDrive metadata if requested
        if include_rawdrive_metadata:
            metadata.rawdrive_asset_id = str(asset.get("asset_id", ""))
            metadata.rawdrive_gallery_id = gallery_id
            metadata.rawdrive_sync_timestamp = datetime.now(timezone.utc)

        return metadata


# Singleton instance
_xmp_service: Optional[XmpService] = None


def get_xmp_service() -> XmpService:
    """Get the singleton XMP service instance."""
    global _xmp_service
    if _xmp_service is None:
        _xmp_service = XmpService()
    return _xmp_service
