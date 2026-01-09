"""Pydantic schemas for PersonalProfile digital visiting cards."""

from __future__ import annotations

import html
import re
from typing import Optional
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ---------------------------------------------------------------------------
# XSS Sanitization
# ---------------------------------------------------------------------------

def sanitize_text(text: Optional[str], field_name: str = "field") -> Optional[str]:
    """Sanitize text input to prevent XSS attacks.

    Escapes HTML entities while preserving readability.

    Args:
        text: Input text to sanitize
        field_name: Name of the field for error messages

    Returns:
        Sanitized text or None
    """
    if text is None:
        return None

    text = text.strip()
    if not text:
        return None

    # Use Python's html.escape which handles &, <, >, ", '
    return html.escape(text, quote=True)


def sanitize_text_preserve_some_entities(text: Optional[str]) -> Optional[str]:
    """Sanitize text but allow some common HTML entities like &amp; if already escaped.

    For display_name and profile_title where users might legitimately use
    ampersands in business names like "Smith & Co."

    Args:
        text: Input text to sanitize

    Returns:
        Sanitized text or None
    """
    if text is None:
        return None

    text = text.strip()
    if not text:
        return None

    # Remove any script/event handler patterns
    dangerous_patterns = [
        r'<script\b[^>]*>.*?</script>',
        r'javascript:',
        r'on\w+\s*=',
        r'<\s*iframe',
        r'<\s*embed',
        r'<\s*object',
    ]
    for pattern in dangerous_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE | re.DOTALL)

    # Escape HTML tags but leave standard text characters
    text = text.replace('<', '&lt;').replace('>', '&gt;')

    return text


# ---------------------------------------------------------------------------
# URL Validation Constants
# ---------------------------------------------------------------------------

# Allowed URL schemes for security (prevents javascript:, file:, etc.)
ALLOWED_URL_SCHEMES = ("http://", "https://")

# URL validation regex (basic validation, more strict than just scheme check)
URL_PATTERN = re.compile(
    r"^https?://"  # Scheme
    r"[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"  # Domain
    r"(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*"  # Subdomains
    r"(\.[a-zA-Z]{2,})"  # TLD
    r"(:[0-9]{1,5})?"  # Optional port
    r"(/.*)?$",  # Path
    re.IGNORECASE,
)


def validate_url(url: Optional[str], field_name: str = "URL") -> Optional[str]:
    """Validate URL to prevent XSS and SSRF attacks.

    Args:
        url: URL to validate
        field_name: Name of the field for error messages

    Returns:
        Validated URL or None

    Raises:
        ValueError: If URL is invalid or uses disallowed scheme
    """
    if url is None or url == "":
        return None

    url = url.strip()

    # Check for allowed schemes
    if not url.startswith(ALLOWED_URL_SCHEMES):
        raise ValueError(f"{field_name} must use http:// or https:// scheme")

    # Basic URL format validation
    if not URL_PATTERN.match(url):
        raise ValueError(f"Invalid {field_name} format")

    return url

# ---------------------------------------------------------------------------
# Value Objects
# ---------------------------------------------------------------------------


class PersonalProfileAddress(BaseModel):
    """Structured address with optional GPS coordinates.

    All fields are optional to allow partial address entry.
    The frontend may send empty strings which are treated as None.
    """

    line1: Optional[str] = Field(None, max_length=255)
    line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    postal_code: Optional[str] = Field(None, max_length=20)
    country: Optional[str] = Field(None, max_length=100)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)

    @field_validator("line1", "line2", "city", "state", "postal_code", "country", mode="before")
    @classmethod
    def empty_string_to_none(cls, v):
        """Convert empty strings to None."""
        if v == "":
            return None
        return v


class CustomLink(BaseModel):
    """Custom navigation link."""

    label: str = Field(..., min_length=1, max_length=50)
    url: str = Field(..., min_length=1)
    logo_url: Optional[str] = None
    type: Optional[str] = Field(
        None,
        max_length=50,
        description="Link type: portfolio, service, contact, pricing, gallery, booking, blog, proofing",
    )

    @field_validator("label")
    @classmethod
    def sanitize_label(cls, v):
        """Sanitize label to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("url")
    @classmethod
    def validate_custom_link_url(cls, v):
        """Validate URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Link URL")

    @field_validator("logo_url")
    @classmethod
    def validate_custom_link_logo_url(cls, v):
        """Validate logo URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Logo URL")


class SecondaryContact(BaseModel):
    """Secondary contact (email or phone) with optional label."""

    value: str = Field(..., min_length=1, max_length=255)
    label: Optional[str] = Field(
        None, max_length=50, description="Optional label like 'Work', 'Personal'"
    )

    @field_validator("value", mode="before")
    @classmethod
    def strip_value(cls, v):
        """Strip whitespace from value."""
        if isinstance(v, str):
            return v.strip()
        return v


class EmbeddedMedia(BaseModel):
    """Embedded media configuration for TikTok and Spotify."""

    tiktok_username: Optional[str] = Field(
        None, max_length=100, description="TikTok username for profile embed"
    )
    spotify_playlist_id: Optional[str] = Field(
        None, max_length=100, description="Spotify playlist ID for embed"
    )


class SEOMetadata(BaseModel):
    """SEO metadata for search engine optimization."""

    meta_title: Optional[str] = Field(
        None, max_length=60, description="Page title (50-60 characters recommended)"
    )
    meta_description: Optional[str] = Field(
        None, max_length=160, description="Meta description (150-160 characters)"
    )
    meta_keywords: Optional[list[str]] = Field(
        None, max_length=20, description="Array of keywords"
    )
    og_title: Optional[str] = Field(None, max_length=60, description="Open Graph title")
    og_description: Optional[str] = Field(
        None, max_length=160, description="Open Graph description"
    )
    og_image: Optional[str] = Field(None, description="Open Graph image URL")
    twitter_card: Optional[str] = Field(
        "summary_large_image",
        description="Twitter card type: summary or summary_large_image",
    )
    twitter_title: Optional[str] = Field(None, max_length=60, description="Twitter card title")
    twitter_description: Optional[str] = Field(
        None, max_length=160, description="Twitter card description"
    )
    twitter_image: Optional[str] = Field(None, description="Twitter card image URL")

    # --- XSS Sanitization Validators ---

    @field_validator("meta_title", "og_title", "twitter_title")
    @classmethod
    def sanitize_titles(cls, v):
        """Sanitize SEO titles to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("meta_description", "og_description", "twitter_description")
    @classmethod
    def sanitize_descriptions(cls, v):
        """Sanitize SEO descriptions to prevent XSS attacks."""
        return sanitize_text(v)

    @field_validator("meta_keywords")
    @classmethod
    def sanitize_keywords(cls, v):
        """Sanitize keywords to prevent XSS attacks."""
        if v:
            return [sanitize_text_preserve_some_entities(kw) for kw in v if kw]
        return v

    # --- URL Validators ---

    @field_validator("og_image")
    @classmethod
    def validate_og_image_url(cls, v):
        """Validate Open Graph image URL."""
        return validate_url(v, "Open Graph image URL")

    @field_validator("twitter_image")
    @classmethod
    def validate_twitter_image_url(cls, v):
        """Validate Twitter image URL."""
        return validate_url(v, "Twitter image URL")


class PersonalVisibilityConfig(BaseModel):
    """Visibility configuration for personal profile fields."""

    # Identity
    display_name: bool = True
    profile_title: bool = True
    avatar_url: bool = True
    bio: bool = True
    location: bool = True

    # Contact
    email: bool = True
    phone: bool = True
    website: bool = True
    address: bool = True

    # Social media
    socials_instagram: bool = True
    socials_facebook: bool = True
    socials_twitter: bool = True
    socials_linkedin: bool = True
    socials_youtube: bool = True
    socials_tiktok: bool = True
    socials_pinterest: bool = True
    socials_behance: bool = True
    socials_dribbble: bool = True
    socials_spotify: bool = True
    socials_whatsapp: bool = True

    # Other
    custom_links: bool = True
    embedded_media: bool = True
    featured_gallery: bool = True
    categories: bool = True
    service_areas: bool = True
    booking_calendar: bool = True

    # Secondary contacts
    secondary_email_1: bool = True
    secondary_email_2: bool = True
    secondary_phone_1: bool = True
    secondary_phone_2: bool = True

    # Public profile features
    qr_code: bool = True
    vcard: bool = True


# ---------------------------------------------------------------------------
# Predefined Categories
# ---------------------------------------------------------------------------

PERSONAL_PROFILE_CATEGORIES = [
    "Photography",
    "Videography",
    "Wedding Services",
    "Commercial Production",
    "Portrait Photography",
    "Event Photography",
    "Creative Services",
    "Travel Photography",
    "Fashion Photography",
    "Product Photography",
    "Real Estate Photography",
    "Food Photography",
    "Sports Photography",
    "Documentary",
    "Fine Art",
]

BACKGROUND_THEMES = ["dark", "pastel", "bold", "cinematic", "minimal"]


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------


class CreatePersonalProfileRequest(BaseModel):
    """Create personal profile request."""

    # Required fields
    display_name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(
        ..., min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$"
    )
    email: EmailStr

    # Optional identity fields
    profile_title: Optional[str] = Field(
        None, max_length=255, description="Professional title like 'Wedding Photographer & Filmmaker'"
    )
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500, description="Short biography")
    location: Optional[str] = Field(
        None, max_length=255, description="Location string like 'Based in Berlin - Available Worldwide'"
    )

    # Contact info
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = None

    # Secondary contacts (max 2 each)
    secondary_emails: Optional[list[SecondaryContact]] = Field(
        default=None, description="Up to 2 secondary email addresses"
    )
    secondary_phones: Optional[list[SecondaryContact]] = Field(
        default=None, description="Up to 2 secondary phone numbers"
    )

    # Location & Travel
    address_structured: Optional[PersonalProfileAddress] = None
    service_areas: Optional[list[str]] = Field(
        None, max_length=20, description="Array of service areas/locations"
    )

    # Social media & links
    socials: Optional[dict[str, str]] = None
    custom_links: Optional[list[CustomLink]] = None

    # Embedded media
    embedded_media: Optional[EmbeddedMedia] = None

    # Featured gallery
    featured_gallery_id: Optional[UUID] = None

    # Categories
    categories: Optional[list[str]] = Field(
        None, max_length=10, description="Array of category names"
    )

    # Branding
    brand_color: Optional[str] = Field(
        None, pattern=r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$"
    )
    background_theme: Optional[str] = Field(None, description="Theme: dark, pastel, bold, cinematic, minimal")

    # Visibility
    visibility_config: Optional[dict[str, bool]] = None

    # Public toggle
    is_public: bool = False

    # SEO
    seo_metadata: Optional[SEOMetadata] = None

    # Calendar
    booking_calendar_url: Optional[str] = None

    # --- XSS Sanitization Validators ---

    @field_validator("display_name")
    @classmethod
    def sanitize_display_name(cls, v):
        """Sanitize display name to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("profile_title")
    @classmethod
    def sanitize_profile_title(cls, v):
        """Sanitize profile title to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("bio")
    @classmethod
    def sanitize_bio(cls, v):
        """Sanitize bio to prevent XSS attacks."""
        return sanitize_text(v)

    @field_validator("location")
    @classmethod
    def sanitize_location(cls, v):
        """Sanitize location to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("service_areas")
    @classmethod
    def sanitize_service_areas(cls, v):
        """Sanitize service areas to prevent XSS attacks."""
        if v:
            return [sanitize_text_preserve_some_entities(area) for area in v if area]
        return v

    # --- Format Validators ---

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v and not re.match(r"^\+?[0-9\-\s\(\)]+$", v):
            raise ValueError("Invalid phone format")
        return v

    @field_validator("secondary_emails")
    @classmethod
    def validate_secondary_emails(cls, v):
        if v:
            if len(v) > 2:
                raise ValueError("Maximum 2 secondary emails allowed")
            email_pattern = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
            for contact in v:
                if not email_pattern.match(contact.value):
                    raise ValueError(f"Invalid email format: {contact.value}")
        return v

    @field_validator("secondary_phones")
    @classmethod
    def validate_secondary_phones(cls, v):
        if v:
            if len(v) > 2:
                raise ValueError("Maximum 2 secondary phones allowed")
            phone_pattern = re.compile(r"^\+?[0-9\-\s\(\)]+$")
            for contact in v:
                if not phone_pattern.match(contact.value):
                    raise ValueError(f"Invalid phone format: {contact.value}")
        return v

    @field_validator("background_theme")
    @classmethod
    def validate_background_theme(cls, v):
        if v and v not in BACKGROUND_THEMES:
            raise ValueError(f"Invalid background theme. Must be one of: {', '.join(BACKGROUND_THEMES)}")
        return v

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v):
        if v:
            if len(v) > 10:
                raise ValueError("Maximum 10 categories allowed")
        return v

    # --- URL Validators ---

    @field_validator("website")
    @classmethod
    def validate_website_url(cls, v):
        """Validate website URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Website")

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v):
        """Validate avatar URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Avatar URL")

    @field_validator("booking_calendar_url")
    @classmethod
    def validate_booking_url(cls, v):
        """Validate booking calendar URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Booking calendar URL")

    @field_validator("socials")
    @classmethod
    def validate_social_urls(cls, v):
        """Validate all social media URLs to prevent XSS/SSRF attacks."""
        if v:
            validated = {}
            for platform, url in v.items():
                if url:
                    validated[platform] = validate_url(url, f"Social URL ({platform})")
                else:
                    validated[platform] = None
            return validated
        return v


class UpdatePersonalProfileRequest(BaseModel):
    """Update personal profile request."""

    # Identity fields
    display_name: Optional[str] = Field(None, min_length=1, max_length=255)
    profile_title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, min_length=3, max_length=100, pattern=r"^[a-z0-9-]+$")
    avatar_url: Optional[str] = None
    bio: Optional[str] = Field(None, max_length=500)
    location: Optional[str] = Field(None, max_length=255)

    # Contact info
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = None

    # Secondary contacts
    secondary_emails: Optional[list[SecondaryContact]] = None
    secondary_phones: Optional[list[SecondaryContact]] = None

    # Location & Travel
    address_structured: Optional[PersonalProfileAddress] = None
    service_areas: Optional[list[str]] = Field(None, max_length=20)

    # Social media & links
    socials: Optional[dict[str, str]] = None
    custom_links: Optional[list[CustomLink]] = None

    # Embedded media
    embedded_media: Optional[EmbeddedMedia] = None

    # Featured gallery
    featured_gallery_id: Optional[UUID] = None

    # Categories
    categories: Optional[list[str]] = Field(None, max_length=10)

    # Branding
    brand_color: Optional[str] = Field(None, pattern=r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
    background_theme: Optional[str] = None

    # Visibility
    visibility_config: Optional[dict[str, bool]] = None

    # Public toggle
    is_public: Optional[bool] = None

    # SEO
    seo_metadata: Optional[SEOMetadata] = None

    # Calendar
    booking_calendar_url: Optional[str] = None

    # --- XSS Sanitization Validators ---

    @field_validator("display_name")
    @classmethod
    def sanitize_display_name(cls, v):
        """Sanitize display name to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("profile_title")
    @classmethod
    def sanitize_profile_title(cls, v):
        """Sanitize profile title to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("bio")
    @classmethod
    def sanitize_bio(cls, v):
        """Sanitize bio to prevent XSS attacks."""
        return sanitize_text(v)

    @field_validator("location")
    @classmethod
    def sanitize_location(cls, v):
        """Sanitize location to prevent XSS attacks."""
        return sanitize_text_preserve_some_entities(v)

    @field_validator("service_areas")
    @classmethod
    def sanitize_service_areas(cls, v):
        """Sanitize service areas to prevent XSS attacks."""
        if v:
            return [sanitize_text_preserve_some_entities(area) for area in v if area]
        return v

    # --- Format Validators ---

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if v and not re.match(r"^\+?[0-9\-\s\(\)]+$", v):
            raise ValueError("Invalid phone format")
        return v

    @field_validator("secondary_emails")
    @classmethod
    def validate_secondary_emails(cls, v):
        if v:
            if len(v) > 2:
                raise ValueError("Maximum 2 secondary emails allowed")
            email_pattern = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
            for contact in v:
                if not email_pattern.match(contact.value):
                    raise ValueError(f"Invalid email format: {contact.value}")
        return v

    @field_validator("secondary_phones")
    @classmethod
    def validate_secondary_phones(cls, v):
        if v:
            if len(v) > 2:
                raise ValueError("Maximum 2 secondary phones allowed")
            phone_pattern = re.compile(r"^\+?[0-9\-\s\(\)]+$")
            for contact in v:
                if not phone_pattern.match(contact.value):
                    raise ValueError(f"Invalid phone format: {contact.value}")
        return v

    @field_validator("background_theme")
    @classmethod
    def validate_background_theme(cls, v):
        if v and v not in BACKGROUND_THEMES:
            raise ValueError(f"Invalid background theme. Must be one of: {', '.join(BACKGROUND_THEMES)}")
        return v

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, v):
        if v:
            if len(v) > 10:
                raise ValueError("Maximum 10 categories allowed")
        return v

    # --- URL Validators ---

    @field_validator("website")
    @classmethod
    def validate_website_url(cls, v):
        """Validate website URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Website")

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v):
        """Validate avatar URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Avatar URL")

    @field_validator("booking_calendar_url")
    @classmethod
    def validate_booking_url(cls, v):
        """Validate booking calendar URL to prevent XSS/SSRF attacks."""
        return validate_url(v, "Booking calendar URL")

    @field_validator("socials")
    @classmethod
    def validate_social_urls(cls, v):
        """Validate all social media URLs to prevent XSS/SSRF attacks."""
        if v:
            validated = {}
            for platform, url in v.items():
                if url:
                    validated[platform] = validate_url(url, f"Social URL ({platform})")
                else:
                    validated[platform] = None
            return validated
        return v


# ---------------------------------------------------------------------------
# Response Schemas
# ---------------------------------------------------------------------------


class PersonalProfileResponse(BaseModel):
    """Personal profile response."""

    model_config = ConfigDict(from_attributes=True)

    profile_id: UUID
    workspace_id: UUID
    user_id: UUID

    # Identity
    display_name: str
    profile_title: Optional[str] = None
    slug: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None

    # Contact info
    email: str
    phone: Optional[str] = None
    website: Optional[str] = None

    # Secondary contacts
    secondary_emails: list[SecondaryContact] = Field(default_factory=list)
    secondary_phones: list[SecondaryContact] = Field(default_factory=list)

    # Location & Travel
    address_structured: Optional[PersonalProfileAddress] = None
    service_areas: list[str] = Field(default_factory=list)

    # Social media & links
    socials: dict[str, str] = Field(default_factory=dict)
    custom_links: list[CustomLink] = Field(default_factory=list)

    # Embedded media
    embedded_media: Optional[EmbeddedMedia] = None

    # Featured gallery
    featured_gallery_id: Optional[UUID] = None

    # Categories
    categories: list[str] = Field(default_factory=list)

    # Branding
    brand_color: Optional[str] = None
    background_theme: Optional[str] = None

    # Visibility
    visibility_config: dict[str, bool] = Field(default_factory=dict)

    # Public toggle
    is_public: bool = False

    # SEO
    seo_metadata: Optional[SEOMetadata] = None

    # Verification & Badges
    is_verified: bool = False
    badges: list[str] = Field(default_factory=list)

    # Calendar
    booking_calendar_url: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime


class PublicPersonalProfileResponse(BaseModel):
    """Public personal profile response with SEO schema.

    This response only includes fields that are marked visible
    in the visibility configuration.
    """

    model_config = ConfigDict(from_attributes=True)

    # Identity (always included if profile is public)
    display_name: Optional[str] = None
    profile_title: Optional[str] = None
    slug: str
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None

    # Contact info (based on visibility)
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None

    # Secondary contacts (based on visibility)
    secondary_emails: list[SecondaryContact] = Field(default_factory=list)
    secondary_phones: list[SecondaryContact] = Field(default_factory=list)

    # Address (based on visibility)
    address_structured: Optional[PersonalProfileAddress] = None
    service_areas: list[str] = Field(default_factory=list)

    # Social media & links (based on visibility)
    socials: dict[str, str] = Field(default_factory=dict)
    custom_links: list[CustomLink] = Field(default_factory=list)

    # Embedded media (based on visibility)
    embedded_media: Optional[EmbeddedMedia] = None

    # Featured gallery (based on visibility)
    featured_gallery_id: Optional[UUID] = None
    featured_gallery: Optional[dict] = Field(
        None, description="Featured gallery basic info"
    )

    # Categories (based on visibility)
    categories: list[str] = Field(default_factory=list)

    # Branding (always included for theming)
    brand_color: Optional[str] = None
    background_theme: Optional[str] = None

    # Verification & Badges (always included)
    is_verified: bool = False
    badges: list[str] = Field(default_factory=list)

    # Booking calendar (based on visibility)
    booking_calendar_url: Optional[str] = None

    # Visibility (for client to know what buttons to show)
    show_qr_code: bool = True
    show_vcard: bool = True

    # SEO schema (JSON-LD)
    seo_schema: Optional[dict] = Field(None, description="JSON-LD Person schema")

    # SEO metadata for meta tags
    seo_metadata: Optional[SEOMetadata] = None

    # Public profile URL
    public_url: str = Field(..., description="Full public profile URL")


# ---------------------------------------------------------------------------
# Utility Schemas
# ---------------------------------------------------------------------------


class SlugAvailabilityResponse(BaseModel):
    """Slug availability check response."""

    slug: str
    available: bool
    message: Optional[str] = None


class AvatarUploadResponse(BaseModel):
    """Avatar upload response."""

    avatar_url: str
    message: str = "Avatar uploaded successfully"
