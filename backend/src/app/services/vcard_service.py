"""vCard Generation Service.

Generates vCard 3.0 compatible strings/files from CompanyProfile data.
Includes E.164 phone formatting and BASE64-encoded logo support.
"""

import base64
import logging
import re
from typing import Optional

from app.api.company_profile_schemas import CompanyProfileResponse
from app.services.visibility_service import VisibilityFilterService

logger = logging.getLogger(__name__)


def format_phone_e164(phone: str) -> str:
    """
    Format phone number to E.164 standard.

    E.164 format: +[country_code][subscriber_number]
    Example: +14155551234

    Args:
        phone: Raw phone number string

    Returns:
        E.164 formatted phone number or original if parsing fails
    """
    if not phone:
        return phone

    # Remove all non-digit characters except leading +
    cleaned = re.sub(r'[^\d+]', '', phone)

    # If already starts with +, validate and return
    if cleaned.startswith('+'):
        # Ensure only one + at the start
        cleaned = '+' + re.sub(r'\+', '', cleaned[1:])
        return cleaned

    # If no country code, assume US (+1) for 10-digit numbers
    digits_only = re.sub(r'\D', '', cleaned)
    if len(digits_only) == 10:
        return f"+1{digits_only}"
    elif len(digits_only) == 11 and digits_only.startswith('1'):
        return f"+{digits_only}"

    # Return with + prefix if it looks like it has a country code
    if len(digits_only) > 10:
        return f"+{digits_only}"

    # Return original if we can't determine format
    return phone


def escape_vcard_text(text: str) -> str:
    """
    Escape special characters for vCard text values.

    vCard 3.0 requires escaping of: backslash, comma, semicolon, newline
    """
    if not text:
        return text

    # Order matters: escape backslash first
    text = text.replace('\\', '\\\\')
    text = text.replace(',', '\\,')
    text = text.replace(';', '\\;')
    text = text.replace('\n', '\\n')
    text = text.replace('\r', '')

    return text


class VCardService:
    """Service for generating vCards with E.164 phone formatting and logo support."""

    @staticmethod
    def generate_vcard(
        profile: CompanyProfileResponse,
        include_private: bool = False,
        logo_bytes: Optional[bytes] = None,
        logo_mime_type: str = "image/webp",
    ) -> str:
        """
        Generate vCard 3.0 string.

        Args:
            profile: The company profile data.
            include_private: If False, applies visibility filter before generation.
            logo_bytes: Optional logo image bytes to embed as BASE64 PHOTO.
            logo_mime_type: MIME type of the logo (default: image/webp).

        Returns:
            vCard 3.0 formatted string with proper UTF-8 encoding.
        """
        # Convert Pydantic model to dict
        data = profile.model_dump()

        # Apply visibility filter if needed
        if not include_private:
            data = VisibilityFilterService.filter_visible(data, profile.company_visibility)

        # Build vCard lines
        lines = ["BEGIN:VCARD", "VERSION:3.0"]

        # FN (Full Name) - required
        name = escape_vcard_text(data.get("name", "Unknown"))
        lines.append(f"FN:{name}")
        lines.append(f"ORG:{name}")

        # TITLE/Tagline
        if tag := data.get("tagline"):
            lines.append(f"TITLE:{escape_vcard_text(tag)}")

        # EMAIL
        if email := data.get("email"):
            lines.append(f"EMAIL;TYPE=INTERNET,WORK:{email}")

        # TEL with E.164 formatting
        if phone := data.get("phone"):
            formatted_phone = format_phone_e164(phone)
            lines.append(f"TEL;TYPE=WORK,VOICE:{formatted_phone}")

        # Secondary emails
        if secondary_emails := data.get("secondary_emails"):
            for i, contact in enumerate(secondary_emails[:2]):  # Max 2
                if isinstance(contact, dict):
                    email_value = contact.get("value", "")
                    email_label = contact.get("label") or f"Secondary{i + 1}"
                else:
                    email_value = getattr(contact, "value", "")
                    email_label = getattr(contact, "label", None) or f"Secondary{i + 1}"
                if email_value:
                    # Clean label for vCard TYPE parameter
                    clean_label = re.sub(r'[^A-Za-z0-9]', '', email_label).upper()
                    lines.append(f"EMAIL;TYPE=INTERNET,{clean_label}:{email_value}")

        # Secondary phones with E.164 formatting
        if secondary_phones := data.get("secondary_phones"):
            for i, contact in enumerate(secondary_phones[:2]):  # Max 2
                if isinstance(contact, dict):
                    phone_value = contact.get("value", "")
                    phone_label = contact.get("label") or f"Secondary{i + 1}"
                else:
                    phone_value = getattr(contact, "value", "")
                    phone_label = getattr(contact, "label", None) or f"Secondary{i + 1}"
                if phone_value:
                    formatted_phone = format_phone_e164(phone_value)
                    clean_label = re.sub(r'[^A-Za-z0-9]', '', phone_label).upper()
                    lines.append(f"TEL;TYPE={clean_label},VOICE:{formatted_phone}")

        # URL
        if website := data.get("website"):
            lines.append(f"URL;TYPE=WORK:{website}")

        # Public profile URL
        if slug := data.get("slug"):
            from app.services.company_profile_service import CompanyProfileService
            public_url = CompanyProfileService.generate_public_url(slug)
            lines.append(f"URL;TYPE=Profile:{public_url}")

        # ADR (Address)
        if addr := data.get("address_structured"):
            line1 = escape_vcard_text(addr.get("line1", ""))
            line2 = escape_vcard_text(addr.get("line2", ""))
            street = f"{line1}, {line2}" if line2 else line1
            city = escape_vcard_text(addr.get("city", ""))
            state = escape_vcard_text(addr.get("state", ""))
            postal = escape_vcard_text(addr.get("postal_code", ""))
            country = escape_vcard_text(addr.get("country", ""))

            lines.append(f"ADR;TYPE=WORK:;;{street};{city};{state};{postal};{country}")

        # PHOTO - embed logo as BASE64 if provided
        if logo_bytes:
            try:
                encoded_logo = base64.b64encode(logo_bytes).decode('ascii')
                # vCard 3.0 PHOTO format with BASE64 encoding
                # Use TYPE parameter based on MIME type
                photo_type = "PNG"  # Default
                if "webp" in logo_mime_type.lower():
                    photo_type = "PNG"  # WebP may not be supported, fall back to PNG
                elif "jpeg" in logo_mime_type.lower() or "jpg" in logo_mime_type.lower():
                    photo_type = "JPEG"
                elif "gif" in logo_mime_type.lower():
                    photo_type = "GIF"

                # Split into 75-character lines for vCard compliance
                photo_line = f"PHOTO;ENCODING=b;TYPE={photo_type}:{encoded_logo}"
                lines.append(photo_line)
            except Exception as e:
                logger.warning(f"Failed to encode logo for vCard: {e}")

        # Socials
        if socials := data.get("socials"):
            for platform, url in socials.items():
                if url:
                    platform_upper = platform.upper()
                    lines.append(f"X-SOCIALPROFILE;TYPE={platform_upper}:{url}")
                    lines.append(f"URL;TYPE={platform_upper}:{url}")

        lines.append("END:VCARD")

        # Join with CRLF as per vCard spec
        return "\r\n".join(lines)

    @staticmethod
    def get_filename(profile_name: str) -> str:
        """Generate a safe filename for the vCard."""
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', profile_name)
        return f"{safe_name}.vcf"

    @staticmethod
    def get_content_type() -> str:
        """Get the MIME type for vCard files."""
        return "text/vcard; charset=utf-8"
