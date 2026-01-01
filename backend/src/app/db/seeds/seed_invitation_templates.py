"""Seed file for invitation templates.

Seeds 15 initial templates for various event types:
- 5 Wedding templates
- 5 Birthday templates
- 5 Festival/Corporate templates

Feature: 016-save-the-date
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from dataclasses import dataclass, field
from typing import Any

import asyncpg


@dataclass(frozen=True)
class Template:
    """Invitation template data."""

    template_id: uuid.UUID
    name: str
    slug: str
    description: str
    category: str
    subcategory: str
    tags: list[str]
    layout: dict[str, Any]
    content_i18n: dict[str, dict[str, str]]
    supported_languages: list[str]
    is_premium: bool = False


# ---------------------------------------------------------------------------
# Template Layout Configurations
# ---------------------------------------------------------------------------

WEDDING_LAYOUT_ELEGANT = {
    "sections": ["header", "hero", "details", "venue", "rsvp", "footer"],
    "fonts": {
        "heading": "Playfair Display",
        "body": "Inter",
        "accent": "Great Vibes",
    },
    "colors": {
        "primary": "#D4AF37",
        "secondary": "#1a1a2e",
        "background": "#faf8f5",
        "text": "#1a1a2e",
        "accent": "#8b7355",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "60vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "venue": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {
        "decorations": "floral-corners",
    },
}

WEDDING_LAYOUT_MODERN = {
    "sections": ["header", "hero", "timeline", "venue", "rsvp", "footer"],
    "fonts": {
        "heading": "Montserrat",
        "body": "Open Sans",
        "accent": "Sacramento",
    },
    "colors": {
        "primary": "#2c3e50",
        "secondary": "#ecf0f1",
        "background": "#ffffff",
        "text": "#2c3e50",
        "accent": "#e74c3c",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "70vh"},
        "timeline": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "venue": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {},
}

WEDDING_LAYOUT_TRADITIONAL = {
    "sections": ["header", "hero", "details", "venue", "gallery", "rsvp", "footer"],
    "fonts": {
        "heading": "Cormorant Garamond",
        "body": "Lato",
        "accent": "Tangerine",
    },
    "colors": {
        "primary": "#8B0000",
        "secondary": "#FFD700",
        "background": "#FFF8DC",
        "text": "#4a0000",
        "accent": "#CD853F",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "65vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "venue": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "gallery": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {
        "border": "traditional-border",
        "motifs": "indian-paisley",
    },
}

BIRTHDAY_LAYOUT_FUN = {
    "sections": ["header", "hero", "details", "gallery", "rsvp", "footer"],
    "fonts": {
        "heading": "Poppins",
        "body": "Inter",
        "accent": "Pacifico",
    },
    "colors": {
        "primary": "#FF6B6B",
        "secondary": "#4ECDC4",
        "background": "#ffffff",
        "text": "#2d3436",
        "accent": "#FFE66D",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "50vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "gallery": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {
        "confetti": "colorful-confetti",
        "balloons": "party-balloons",
    },
}

BIRTHDAY_LAYOUT_KIDS = {
    "sections": ["header", "hero", "details", "activities", "rsvp", "footer"],
    "fonts": {
        "heading": "Fredoka One",
        "body": "Nunito",
        "accent": "Comic Neue",
    },
    "colors": {
        "primary": "#FF69B4",
        "secondary": "#87CEEB",
        "background": "#FFF0F5",
        "text": "#333333",
        "accent": "#FFD700",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "45vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "activities": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {
        "characters": "cute-animals",
        "sparkles": "magical-sparkles",
    },
}

FESTIVAL_LAYOUT_DIWALI = {
    "sections": ["header", "hero", "details", "schedule", "rsvp", "footer"],
    "fonts": {
        "heading": "Rajdhani",
        "body": "Noto Sans Devanagari",
        "accent": "Laila",
    },
    "colors": {
        "primary": "#FF9933",
        "secondary": "#128807",
        "background": "#FFFAF0",
        "text": "#333333",
        "accent": "#FFD700",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "55vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "schedule": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {
        "diyas": "diya-row",
        "rangoli": "rangoli-patterns",
    },
}

CORPORATE_LAYOUT_PROFESSIONAL = {
    "sections": ["header", "hero", "details", "agenda", "speakers", "rsvp", "footer"],
    "fonts": {
        "heading": "Montserrat",
        "body": "Roboto",
        "accent": "Montserrat",
    },
    "colors": {
        "primary": "#2563EB",
        "secondary": "#0F172A",
        "background": "#ffffff",
        "text": "#1e293b",
        "accent": "#06B6D4",
    },
    "positions": {
        "header": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "hero": {"x": 0, "y": 0, "width": "100%", "height": "40vh"},
        "details": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "agenda": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "speakers": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "rsvp": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
        "footer": {"x": 0, "y": 0, "width": "100%", "height": "auto"},
    },
    "assets": {},
}


# ---------------------------------------------------------------------------
# i18n Content
# ---------------------------------------------------------------------------

WEDDING_I18N_ELEGANT = {
    "en": {
        "heading": "Together with their families",
        "subheading": "request the pleasure of your company",
        "event_label": "Wedding Ceremony",
        "date_label": "Date & Time",
        "venue_label": "Venue",
        "rsvp_heading": "RSVP",
        "rsvp_description": "Please let us know if you can make it",
        "attending_label": "Will you be attending?",
        "yes_label": "Joyfully Accept",
        "no_label": "Respectfully Decline",
        "maybe_label": "Not Sure Yet",
        "footer_text": "We look forward to celebrating with you",
    },
    "hi": {
        "heading": "अपने परिवारों के साथ",
        "subheading": "आपकी उपस्थिति का अनुरोध करते हैं",
        "event_label": "विवाह समारोह",
        "date_label": "तारीख और समय",
        "venue_label": "स्थान",
        "rsvp_heading": "उत्तर दें",
        "rsvp_description": "कृपया हमें बताएं कि क्या आप आ सकते हैं",
        "attending_label": "क्या आप शामिल होंगे?",
        "yes_label": "हर्षपूर्वक स्वीकार",
        "no_label": "सम्मानपूर्वक अस्वीकार",
        "maybe_label": "अभी निश्चित नहीं",
        "footer_text": "हम आपके साथ जश्न मनाने के लिए उत्सुक हैं",
    },
}

BIRTHDAY_I18N_FUN = {
    "en": {
        "heading": "You're Invited!",
        "subheading": "Join us for a birthday celebration",
        "event_label": "Birthday Party",
        "date_label": "When",
        "venue_label": "Where",
        "rsvp_heading": "RSVP",
        "rsvp_description": "Let us know if you can join the fun!",
        "attending_label": "Can you make it?",
        "yes_label": "Count me in!",
        "no_label": "Can't make it",
        "maybe_label": "Maybe",
        "footer_text": "Let's party!",
    },
    "hi": {
        "heading": "आप आमंत्रित हैं!",
        "subheading": "जन्मदिन समारोह में शामिल हों",
        "event_label": "जन्मदिन पार्टी",
        "date_label": "कब",
        "venue_label": "कहाँ",
        "rsvp_heading": "उत्तर दें",
        "rsvp_description": "हमें बताएं कि क्या आप मज़े में शामिल हो सकते हैं!",
        "attending_label": "क्या आप आ सकते हैं?",
        "yes_label": "मुझे गिनो!",
        "no_label": "नहीं आ पाऊंगा",
        "maybe_label": "शायद",
        "footer_text": "चलो पार्टी करें!",
    },
}

FESTIVAL_I18N_DIWALI = {
    "en": {
        "heading": "Diwali Celebration",
        "subheading": "Light up the Festival of Lights with us",
        "event_label": "Diwali Party",
        "date_label": "Date & Time",
        "venue_label": "Venue",
        "rsvp_heading": "RSVP",
        "rsvp_description": "Please confirm your attendance",
        "attending_label": "Will you join us?",
        "yes_label": "Yes, I'll be there",
        "no_label": "Sorry, can't make it",
        "maybe_label": "Not sure yet",
        "footer_text": "Wishing you a Happy Diwali!",
    },
    "hi": {
        "heading": "दीपावली समारोह",
        "subheading": "रोशनी के त्योहार में हमारे साथ शामिल हों",
        "event_label": "दीवाली पार्टी",
        "date_label": "तारीख और समय",
        "venue_label": "स्थान",
        "rsvp_heading": "उत्तर दें",
        "rsvp_description": "कृपया अपनी उपस्थिति की पुष्टि करें",
        "attending_label": "क्या आप शामिल होंगे?",
        "yes_label": "हां, मैं आऊंगा",
        "no_label": "माफ़ कीजिए, नहीं आ पाऊंगा",
        "maybe_label": "अभी पक्का नहीं",
        "footer_text": "आपको दीपावली की शुभकामनाएं!",
    },
}

CORPORATE_I18N = {
    "en": {
        "heading": "You're Invited",
        "subheading": "Please join us for",
        "event_label": "Corporate Event",
        "date_label": "Date & Time",
        "venue_label": "Location",
        "rsvp_heading": "Registration",
        "rsvp_description": "Please confirm your attendance",
        "attending_label": "Will you be attending?",
        "yes_label": "Confirm Attendance",
        "no_label": "Cannot Attend",
        "maybe_label": "Tentative",
        "footer_text": "We look forward to seeing you",
    },
}


# ---------------------------------------------------------------------------
# Template Definitions
# ---------------------------------------------------------------------------

TEMPLATES: list[Template] = [
    # Wedding Templates (5)
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110001"),
        name="Elegant Gold",
        slug="wedding-elegant-gold",
        description="A timeless wedding invitation with elegant gold accents and floral decorations",
        category="wedding",
        subcategory="traditional",
        tags=["elegant", "gold", "floral", "classic", "premium"],
        layout=WEDDING_LAYOUT_ELEGANT,
        content_i18n=WEDDING_I18N_ELEGANT,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110002"),
        name="Modern Minimalist",
        slug="wedding-modern-minimalist",
        description="Clean, modern design with a focus on beautiful typography",
        category="wedding",
        subcategory="modern",
        tags=["modern", "minimalist", "clean", "contemporary"],
        layout=WEDDING_LAYOUT_MODERN,
        content_i18n=WEDDING_I18N_ELEGANT,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110003"),
        name="Royal Traditional",
        slug="wedding-royal-traditional",
        description="Rich traditional design with deep maroon and gold, featuring Indian motifs",
        category="wedding",
        subcategory="traditional",
        tags=["traditional", "indian", "royal", "ornate", "premium"],
        layout=WEDDING_LAYOUT_TRADITIONAL,
        content_i18n=WEDDING_I18N_ELEGANT,
        supported_languages=["en", "hi"],
        is_premium=True,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110004"),
        name="Garden Romance",
        slug="wedding-garden-romance",
        description="Romantic garden-inspired design with soft florals and natural tones",
        category="wedding",
        subcategory="rustic",
        tags=["romantic", "garden", "floral", "rustic", "nature"],
        layout={
            **WEDDING_LAYOUT_ELEGANT,
            "colors": {
                "primary": "#7B9E89",
                "secondary": "#F5E6D3",
                "background": "#FDFBF7",
                "text": "#3D3D3D",
                "accent": "#D4A574",
            },
        },
        content_i18n=WEDDING_I18N_ELEGANT,
        supported_languages=["en"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110005"),
        name="Destination Beach",
        slug="wedding-destination-beach",
        description="Perfect for beach and destination weddings with tropical vibes",
        category="wedding",
        subcategory="destination",
        tags=["beach", "destination", "tropical", "summer", "coastal"],
        layout={
            **WEDDING_LAYOUT_MODERN,
            "colors": {
                "primary": "#0077B6",
                "secondary": "#CAF0F8",
                "background": "#FFFFFF",
                "text": "#03045E",
                "accent": "#00B4D8",
            },
        },
        content_i18n=WEDDING_I18N_ELEGANT,
        supported_languages=["en"],
        is_premium=True,
    ),

    # Birthday Templates (5)
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110006"),
        name="Colorful Celebration",
        slug="birthday-colorful-celebration",
        description="Bright and cheerful design perfect for any birthday party",
        category="birthday",
        subcategory="general",
        tags=["colorful", "fun", "party", "celebration"],
        layout=BIRTHDAY_LAYOUT_FUN,
        content_i18n=BIRTHDAY_I18N_FUN,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110007"),
        name="Kids Magic",
        slug="birthday-kids-magic",
        description="Magical and playful design for children's birthday parties",
        category="birthday",
        subcategory="kids",
        tags=["kids", "magical", "playful", "cartoon", "cute"],
        layout=BIRTHDAY_LAYOUT_KIDS,
        content_i18n=BIRTHDAY_I18N_FUN,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110008"),
        name="Milestone Birthday",
        slug="birthday-milestone",
        description="Elegant design for milestone birthdays (30th, 40th, 50th, etc.)",
        category="birthday",
        subcategory="milestone",
        tags=["milestone", "elegant", "adult", "sophisticated"],
        layout={
            **BIRTHDAY_LAYOUT_FUN,
            "fonts": {
                "heading": "Cormorant Garamond",
                "body": "Lato",
                "accent": "Playfair Display",
            },
            "colors": {
                "primary": "#1a1a2e",
                "secondary": "#D4AF37",
                "background": "#FAFAFA",
                "text": "#1a1a2e",
                "accent": "#B8860B",
            },
        },
        content_i18n=BIRTHDAY_I18N_FUN,
        supported_languages=["en"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110009"),
        name="Neon Glow",
        slug="birthday-neon-glow",
        description="Trendy neon-themed design for teen and adult parties",
        category="birthday",
        subcategory="teen",
        tags=["neon", "glow", "trendy", "teen", "party"],
        layout={
            **BIRTHDAY_LAYOUT_FUN,
            "colors": {
                "primary": "#FF00FF",
                "secondary": "#00FF00",
                "background": "#0D0D0D",
                "text": "#FFFFFF",
                "accent": "#00FFFF",
            },
        },
        content_i18n=BIRTHDAY_I18N_FUN,
        supported_languages=["en"],
        is_premium=True,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110010"),
        name="First Birthday",
        slug="birthday-first",
        description="Adorable design for baby's first birthday celebration",
        category="birthday",
        subcategory="first",
        tags=["first", "baby", "adorable", "cute", "pastel"],
        layout={
            **BIRTHDAY_LAYOUT_KIDS,
            "colors": {
                "primary": "#FFB6C1",
                "secondary": "#87CEFA",
                "background": "#FFF8FA",
                "text": "#4A4A4A",
                "accent": "#FFD700",
            },
        },
        content_i18n=BIRTHDAY_I18N_FUN,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),

    # Festival & Corporate Templates (5)
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110011"),
        name="Diwali Lights",
        slug="festival-diwali-lights",
        description="Vibrant Diwali celebration invitation with diyas and rangoli",
        category="festival",
        subcategory="diwali",
        tags=["diwali", "festival", "indian", "lights", "celebration"],
        layout=FESTIVAL_LAYOUT_DIWALI,
        content_i18n=FESTIVAL_I18N_DIWALI,
        supported_languages=["en", "hi"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110012"),
        name="Holi Colors",
        slug="festival-holi-colors",
        description="Colorful Holi celebration invitation with splashes of color",
        category="festival",
        subcategory="holi",
        tags=["holi", "festival", "colors", "spring", "celebration"],
        layout={
            **FESTIVAL_LAYOUT_DIWALI,
            "colors": {
                "primary": "#FF1493",
                "secondary": "#00FF00",
                "background": "#FFFFFF",
                "text": "#333333",
                "accent": "#FFD700",
            },
        },
        content_i18n={
            "en": {
                "heading": "Holi Celebration",
                "subheading": "Let's play with colors!",
                "event_label": "Holi Party",
                "date_label": "Date & Time",
                "venue_label": "Venue",
                "rsvp_heading": "RSVP",
                "rsvp_description": "Join us for a colorful celebration",
                "attending_label": "Will you join us?",
                "yes_label": "Yes, I'll be there",
                "no_label": "Sorry, can't make it",
                "maybe_label": "Not sure yet",
                "footer_text": "Happy Holi!",
            },
        },
        supported_languages=["en"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110013"),
        name="Professional Conference",
        slug="corporate-professional-conference",
        description="Clean and professional design for corporate events and conferences",
        category="corporate",
        subcategory="conference",
        tags=["corporate", "professional", "conference", "business", "formal"],
        layout=CORPORATE_LAYOUT_PROFESSIONAL,
        content_i18n=CORPORATE_I18N,
        supported_languages=["en"],
        is_premium=False,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110014"),
        name="Product Launch",
        slug="corporate-product-launch",
        description="Dynamic design for product launches and tech events",
        category="corporate",
        subcategory="launch",
        tags=["product", "launch", "tech", "startup", "modern"],
        layout={
            **CORPORATE_LAYOUT_PROFESSIONAL,
            "colors": {
                "primary": "#6366F1",
                "secondary": "#1E1B4B",
                "background": "#F8FAFC",
                "text": "#1E1B4B",
                "accent": "#A855F7",
            },
        },
        content_i18n=CORPORATE_I18N,
        supported_languages=["en"],
        is_premium=True,
    ),
    Template(
        template_id=uuid.UUID("11111111-1111-1111-1111-111111110015"),
        name="Team Celebration",
        slug="corporate-team-celebration",
        description="Fun corporate design for team building and celebration events",
        category="corporate",
        subcategory="team",
        tags=["team", "celebration", "fun", "casual", "corporate"],
        layout={
            **CORPORATE_LAYOUT_PROFESSIONAL,
            "colors": {
                "primary": "#10B981",
                "secondary": "#064E3B",
                "background": "#FFFFFF",
                "text": "#1F2937",
                "accent": "#F59E0B",
            },
        },
        content_i18n=CORPORATE_I18N,
        supported_languages=["en"],
        is_premium=False,
    ),
]


# ---------------------------------------------------------------------------
# Seeding Functions
# ---------------------------------------------------------------------------


async def seed_templates(conn: asyncpg.Connection) -> int:
    """Seed invitation templates.

    Args:
        conn: Database connection

    Returns:
        Number of templates seeded
    """
    count = 0

    for template in TEMPLATES:
        # Check if template already exists
        existing = await conn.fetchval(
            "SELECT 1 FROM invitation_templates WHERE template_id = $1",
            template.template_id,
        )

        if existing:
            continue

        await conn.execute(
            """
            INSERT INTO invitation_templates (
                template_id, workspace_id, name, slug, description,
                category, subcategory, tags, layout, content_i18n,
                supported_languages, preview_image_url, thumbnail_url,
                is_active, is_premium, created_at, updated_at
            )
            VALUES (
                $1, NULL, $2, $3, $4,
                $5, $6, $7, $8, $9,
                $10, NULL, NULL,
                true, $11, NOW(), NOW()
            )
            """,
            template.template_id,
            template.name,
            template.slug,
            template.description,
            template.category,
            template.subcategory,
            template.tags,
            json.dumps(template.layout),
            json.dumps(template.content_i18n),
            template.supported_languages,
            template.is_premium,
        )
        count += 1
        print(f"  Created template: {template.name}")

    return count


async def main() -> None:
    """Run the seed script."""
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive",
    )

    print("Connecting to database...")
    conn = await asyncpg.connect(database_url)

    try:
        print("\nSeeding invitation templates...")
        count = await seed_templates(conn)
        print(f"Seeded {count} invitation templates")

    finally:
        await conn.close()
        print("\nDone!")


if __name__ == "__main__":
    asyncio.run(main())
