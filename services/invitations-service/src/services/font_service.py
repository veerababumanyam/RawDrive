"""Font Service for Regional Scripts.

Provides comprehensive font family configuration for digital invitations
supporting 6 regional Indian scripts using Google Noto Sans font family.

Supported Scripts:
- Latin (English) - Noto Sans
- Devanagari (Hindi) - Noto Sans Devanagari
- Tamil - Noto Sans Tamil
- Telugu - Noto Sans Telugu
- Kannada - Noto Sans Kannada
- Malayalam - Noto Sans Malayalam

Features:
- Font family configuration with weights and styles
- Google Fonts API integration for web font loading
- CSS @font-face generation for self-hosting
- Font stack generation with proper fallbacks
- Font metadata for UI display (preview text, character sets)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Font Weight Definitions
# ---------------------------------------------------------------------------


class FontWeight(Enum):
    """Standard font weights following CSS font-weight values."""

    THIN = 100
    EXTRA_LIGHT = 200
    LIGHT = 300
    REGULAR = 400
    MEDIUM = 500
    SEMI_BOLD = 600
    BOLD = 700
    EXTRA_BOLD = 800
    BLACK = 900


class FontStyle(Enum):
    """Font style variants."""

    NORMAL = "normal"
    ITALIC = "italic"


# ---------------------------------------------------------------------------
# Font Configuration Data Classes
# ---------------------------------------------------------------------------


@dataclass
class FontVariant:
    """A specific font variant (weight + style combination)."""

    weight: FontWeight
    style: FontStyle = FontStyle.NORMAL
    file_suffix: str = ""  # e.g., "-Regular", "-Bold"

    @property
    def css_weight(self) -> int:
        return self.weight.value

    @property
    def css_style(self) -> str:
        return self.style.value

    @property
    def variant_key(self) -> str:
        """Generate variant key for Google Fonts API (e.g., '400', '400italic')."""
        if self.style == FontStyle.ITALIC:
            return f"{self.weight.value}italic"
        return str(self.weight.value)


@dataclass
class FontFamily:
    """Complete font family configuration."""

    name: str  # Font family name (e.g., "Noto Sans Devanagari")
    script: str  # Script name (e.g., "Devanagari")
    language_codes: list[str]  # Supported language codes (e.g., ["hi"])
    google_fonts_name: str  # Google Fonts API name
    variants: list[FontVariant] = field(default_factory=list)
    fallback_fonts: list[str] = field(default_factory=list)
    preview_text: str = ""  # Sample text for font preview
    sample_characters: str = ""  # Character range sample
    unicode_range: str = ""  # Unicode range for subsetting
    category: str = "sans-serif"  # Font category

    def get_google_fonts_url(
        self,
        weights: list[FontWeight] | None = None,
        include_italic: bool = False,
        display: str = "swap",
    ) -> str:
        """Generate Google Fonts CSS URL.

        Args:
            weights: Specific weights to include. None = all available.
            include_italic: Whether to include italic variants.
            display: Font-display strategy (swap, block, fallback, optional).

        Returns:
            Google Fonts CSS2 API URL.
        """
        base_url = "https://fonts.googleapis.com/css2"
        font_name = self.google_fonts_name.replace(" ", "+")

        # Determine which weights to include
        if weights is None:
            weight_list = [v.weight for v in self.variants if v.style == FontStyle.NORMAL]
        else:
            weight_list = weights

        # Build weight specification
        weight_values = sorted(set(w.value for w in weight_list))

        if include_italic:
            # Include both normal and italic using axis notation
            ital_specs = []
            for w in weight_values:
                ital_specs.append(f"0,{w}")  # Normal
                # Check if italic is available for this weight
                if any(
                    v.weight.value == w and v.style == FontStyle.ITALIC
                    for v in self.variants
                ):
                    ital_specs.append(f"1,{w}")  # Italic
            weight_spec = f"ital,wght@{';'.join(ital_specs)}"
        else:
            weight_spec = f"wght@{';'.join(str(w) for w in weight_values)}"

        return f"{base_url}?family={font_name}:{weight_spec}&display={display}"

    def get_font_stack(self) -> str:
        """Generate CSS font-stack string with fallbacks.

        Returns:
            CSS font-family value string.
        """
        fonts = [f'"{self.name}"']
        fonts.extend(f'"{f}"' if " " in f else f for f in self.fallback_fonts)
        fonts.append(self.category)
        return ", ".join(fonts)

    def get_font_face_css(
        self,
        base_url: str = "/fonts",
        format_type: str = "woff2",
    ) -> str:
        """Generate @font-face CSS declarations for self-hosting.

        Args:
            base_url: Base URL where font files are hosted.
            format_type: Font file format (woff2, woff, ttf).

        Returns:
            CSS @font-face declarations.
        """
        css_blocks = []
        folder_name = self.google_fonts_name.replace(" ", "-").lower()

        for variant in self.variants:
            weight_name = variant.weight.name.lower().replace("_", "-")
            style_suffix = "-italic" if variant.style == FontStyle.ITALIC else ""
            filename = f"{folder_name}-{weight_name}{style_suffix}.{format_type}"

            unicode_range = (
                f"\n  unicode-range: {self.unicode_range};" if self.unicode_range else ""
            )

            css_block = f"""@font-face {{
  font-family: '{self.name}';
  font-style: {variant.css_style};
  font-weight: {variant.css_weight};
  font-display: swap;
  src: url('{base_url}/{folder_name}/{filename}') format('{format_type}');{unicode_range}
}}"""
            css_blocks.append(css_block)

        return "\n\n".join(css_blocks)

    def to_dict(self) -> dict:
        """Convert to dictionary for API responses."""
        return {
            "name": self.name,
            "script": self.script,
            "language_codes": self.language_codes,
            "google_fonts_name": self.google_fonts_name,
            "google_fonts_url": self.get_google_fonts_url(),
            "font_stack": self.get_font_stack(),
            "category": self.category,
            "preview_text": self.preview_text,
            "sample_characters": self.sample_characters,
            "variants": [
                {
                    "weight": v.weight.value,
                    "weight_name": v.weight.name.lower().replace("_", " ").title(),
                    "style": v.css_style,
                }
                for v in self.variants
            ],
            "fallback_fonts": self.fallback_fonts,
        }


# ---------------------------------------------------------------------------
# Font Family Definitions
# ---------------------------------------------------------------------------


# Standard variants available for most Noto Sans fonts
STANDARD_VARIANTS = [
    FontVariant(FontWeight.THIN),
    FontVariant(FontWeight.EXTRA_LIGHT),
    FontVariant(FontWeight.LIGHT),
    FontVariant(FontWeight.REGULAR),
    FontVariant(FontWeight.MEDIUM),
    FontVariant(FontWeight.SEMI_BOLD),
    FontVariant(FontWeight.BOLD),
    FontVariant(FontWeight.EXTRA_BOLD),
    FontVariant(FontWeight.BLACK),
]

# Common weights for body text and headings
BODY_TEXT_WEIGHTS = [FontWeight.REGULAR, FontWeight.MEDIUM, FontWeight.BOLD]

# Heading fonts configuration
HEADING_VARIANTS = [
    FontVariant(FontWeight.REGULAR),
    FontVariant(FontWeight.MEDIUM),
    FontVariant(FontWeight.SEMI_BOLD),
    FontVariant(FontWeight.BOLD),
]


# ---------------------------------------------------------------------------
# Regional Font Configurations
# ---------------------------------------------------------------------------


# Noto Sans (Latin - English)
NOTO_SANS_LATIN = FontFamily(
    name="Noto Sans",
    script="Latin",
    language_codes=["en"],
    google_fonts_name="Noto Sans",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Inter", "Helvetica Neue", "Arial", "sans-serif"],
    preview_text="The quick brown fox jumps over the lazy dog.",
    sample_characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    unicode_range="U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
)

# Noto Sans Devanagari (Hindi)
NOTO_SANS_DEVANAGARI = FontFamily(
    name="Noto Sans Devanagari",
    script="Devanagari",
    language_codes=["hi"],
    google_fonts_name="Noto Sans Devanagari",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Mangal", "Nirmala UI", "sans-serif"],
    preview_text="शुभ विवाह - आप सादर आमंत्रित हैं",
    sample_characters="अआइईउऊऋएऐओऔकखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह०१२३४५६७८९",
    unicode_range="U+0900-097F, U+1CD0-1CF6, U+1CF8-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FB",
)

# Noto Sans Tamil
NOTO_SANS_TAMIL = FontFamily(
    name="Noto Sans Tamil",
    script="Tamil",
    language_codes=["ta"],
    google_fonts_name="Noto Sans Tamil",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Latha", "Nirmala UI", "sans-serif"],
    preview_text="சுப முகூர்த்தம் - உங்களை அன்புடன் அழைக்கிறோம்",
    sample_characters="அஆஇஈஉஊஎஏஐஒஓஔககாகிகீகுகூகெகேகைகொகோகௌ௦௧௨௩௪௫௬௭௮௯",
    unicode_range="U+0B80-0BFF, U+200C-200D, U+20B9, U+25CC",
)

# Noto Sans Telugu
NOTO_SANS_TELUGU = FontFamily(
    name="Noto Sans Telugu",
    script="Telugu",
    language_codes=["te"],
    google_fonts_name="Noto Sans Telugu",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Gautami", "Nirmala UI", "sans-serif"],
    preview_text="శుభ ముహూర్తం - మిమ్మల్ని ఆహ్వానిస్తున్నాము",
    sample_characters="అఆఇఈఉఊఋఌఎఏఐఒఓఔకఖగఘఙచఛజఝఞటఠడఢణతథదధన౦౧౨౩౪౫౬౭౮౯",
    unicode_range="U+0C00-0C7F, U+200C-200D, U+20B9, U+25CC",
)

# Noto Sans Kannada
NOTO_SANS_KANNADA = FontFamily(
    name="Noto Sans Kannada",
    script="Kannada",
    language_codes=["kn"],
    google_fonts_name="Noto Sans Kannada",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Tunga", "Nirmala UI", "sans-serif"],
    preview_text="ಶುಭ ಮುಹೂರ್ತ - ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸುತ್ತೇವೆ",
    sample_characters="ಅಆಇಈಉಊಋಎಏಐಒಓಔಕಖಗಘಙಚಛಜಝಞಟಠಡಢಣತಥದಧನ೦೧೨೩೪೫೬೭೮೯",
    unicode_range="U+0C80-0CFF, U+200C-200D, U+20B9, U+25CC",
)

# Noto Sans Malayalam
NOTO_SANS_MALAYALAM = FontFamily(
    name="Noto Sans Malayalam",
    script="Malayalam",
    language_codes=["ml"],
    google_fonts_name="Noto Sans Malayalam",
    variants=STANDARD_VARIANTS.copy(),
    fallback_fonts=["Kartika", "Nirmala UI", "sans-serif"],
    preview_text="ശുഭ മുഹൂർത്തം - നിങ്ങളെ ക്ഷണിക്കുന്നു",
    sample_characters="അആഇഈഉഊഋഎഏഐഒഓഔകഖഗഘങചഛജഝഞടഠഡഢണതഥദധന൦൧൨൩൪൫൬൭൮൯",
    unicode_range="U+0D00-0D7F, U+200C-200D, U+20B9, U+25CC",
)


# ---------------------------------------------------------------------------
# Serif/Heading Font Configurations (for formal invitations)
# ---------------------------------------------------------------------------


NOTO_SERIF_LATIN = FontFamily(
    name="Noto Serif",
    script="Latin",
    language_codes=["en"],
    google_fonts_name="Noto Serif",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Georgia", "Times New Roman", "serif"],
    preview_text="Elegant Wedding Invitation",
    sample_characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    category="serif",
)

NOTO_SERIF_DEVANAGARI = FontFamily(
    name="Noto Serif Devanagari",
    script="Devanagari",
    language_codes=["hi"],
    google_fonts_name="Noto Serif Devanagari",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Noto Sans Devanagari", "Mangal", "serif"],
    preview_text="शुभ विवाह",
    sample_characters="शुभविवाहआमंत्रण",
    category="serif",
)

NOTO_SERIF_TAMIL = FontFamily(
    name="Noto Serif Tamil",
    script="Tamil",
    language_codes=["ta"],
    google_fonts_name="Noto Serif Tamil",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Noto Sans Tamil", "Latha", "serif"],
    preview_text="திருமண அழைப்பு",
    sample_characters="திருமணவிழா",
    category="serif",
)

NOTO_SERIF_TELUGU = FontFamily(
    name="Noto Serif Telugu",
    script="Telugu",
    language_codes=["te"],
    google_fonts_name="Noto Serif Telugu",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Noto Sans Telugu", "Gautami", "serif"],
    preview_text="పెళ్ళి ఆహ్వానం",
    sample_characters="పెళ్ళివిందు",
    category="serif",
)

NOTO_SERIF_KANNADA = FontFamily(
    name="Noto Serif Kannada",
    script="Kannada",
    language_codes=["kn"],
    google_fonts_name="Noto Serif Kannada",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Noto Sans Kannada", "Tunga", "serif"],
    preview_text="ವಿವಾಹ ಆಮಂತ್ರಣ",
    sample_characters="ವಿವಾಹಶುಭ",
    category="serif",
)

NOTO_SERIF_MALAYALAM = FontFamily(
    name="Noto Serif Malayalam",
    script="Malayalam",
    language_codes=["ml"],
    google_fonts_name="Noto Serif Malayalam",
    variants=HEADING_VARIANTS.copy(),
    fallback_fonts=["Noto Sans Malayalam", "Kartika", "serif"],
    preview_text="വിവാഹ ക്ഷണം",
    sample_characters="വിവാഹക്ഷണം",
    category="serif",
)


# ---------------------------------------------------------------------------
# Display/Decorative Fonts (for special headings)
# ---------------------------------------------------------------------------


PLAYFAIR_DISPLAY = FontFamily(
    name="Playfair Display",
    script="Latin",
    language_codes=["en"],
    google_fonts_name="Playfair Display",
    variants=[
        FontVariant(FontWeight.REGULAR),
        FontVariant(FontWeight.MEDIUM),
        FontVariant(FontWeight.SEMI_BOLD),
        FontVariant(FontWeight.BOLD),
        FontVariant(FontWeight.EXTRA_BOLD),
        FontVariant(FontWeight.BLACK),
        FontVariant(FontWeight.REGULAR, FontStyle.ITALIC),
        FontVariant(FontWeight.BOLD, FontStyle.ITALIC),
    ],
    fallback_fonts=["Georgia", "serif"],
    preview_text="Save the Date",
    sample_characters="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    category="serif",
)


# ---------------------------------------------------------------------------
# Font Registry
# ---------------------------------------------------------------------------


# All available font families indexed by name
FONT_FAMILIES: dict[str, FontFamily] = {
    # Sans-Serif (Body Text)
    "Noto Sans": NOTO_SANS_LATIN,
    "Noto Sans Devanagari": NOTO_SANS_DEVANAGARI,
    "Noto Sans Tamil": NOTO_SANS_TAMIL,
    "Noto Sans Telugu": NOTO_SANS_TELUGU,
    "Noto Sans Kannada": NOTO_SANS_KANNADA,
    "Noto Sans Malayalam": NOTO_SANS_MALAYALAM,
    # Serif (Headings, Formal)
    "Noto Serif": NOTO_SERIF_LATIN,
    "Noto Serif Devanagari": NOTO_SERIF_DEVANAGARI,
    "Noto Serif Tamil": NOTO_SERIF_TAMIL,
    "Noto Serif Telugu": NOTO_SERIF_TELUGU,
    "Noto Serif Kannada": NOTO_SERIF_KANNADA,
    "Noto Serif Malayalam": NOTO_SERIF_MALAYALAM,
    # Decorative
    "Playfair Display": PLAYFAIR_DISPLAY,
}

# Fonts indexed by script
FONTS_BY_SCRIPT: dict[str, dict[str, FontFamily]] = {
    "Latin": {
        "primary": NOTO_SANS_LATIN,
        "heading": NOTO_SERIF_LATIN,
        "decorative": PLAYFAIR_DISPLAY,
    },
    "Devanagari": {
        "primary": NOTO_SANS_DEVANAGARI,
        "heading": NOTO_SERIF_DEVANAGARI,
    },
    "Tamil": {
        "primary": NOTO_SANS_TAMIL,
        "heading": NOTO_SERIF_TAMIL,
    },
    "Telugu": {
        "primary": NOTO_SANS_TELUGU,
        "heading": NOTO_SERIF_TELUGU,
    },
    "Kannada": {
        "primary": NOTO_SANS_KANNADA,
        "heading": NOTO_SERIF_KANNADA,
    },
    "Malayalam": {
        "primary": NOTO_SANS_MALAYALAM,
        "heading": NOTO_SERIF_MALAYALAM,
    },
}

# Language code to script mapping
LANGUAGE_TO_SCRIPT: dict[str, str] = {
    "en": "Latin",
    "hi": "Devanagari",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
}


# ---------------------------------------------------------------------------
# Font Service Class
# ---------------------------------------------------------------------------


class FontService:
    """Service for managing font configurations for digital invitations.

    Provides methods to:
    - Get font configurations for languages and scripts
    - Generate Google Fonts URLs for web loading
    - Generate CSS for font embedding
    - Get font metadata for UI display
    """

    @staticmethod
    def get_font_family(name: str) -> FontFamily | None:
        """Get a font family by name.

        Args:
            name: Font family name (e.g., "Noto Sans Devanagari").

        Returns:
            FontFamily configuration or None if not found.
        """
        return FONT_FAMILIES.get(name)

    @staticmethod
    def get_fonts_for_script(script: str) -> dict[str, FontFamily] | None:
        """Get all fonts for a script.

        Args:
            script: Script name (e.g., "Devanagari").

        Returns:
            Dictionary with 'primary', 'heading', and optionally 'decorative' fonts.
        """
        return FONTS_BY_SCRIPT.get(script)

    @staticmethod
    def get_fonts_for_language(language_code: str) -> dict[str, FontFamily] | None:
        """Get all fonts for a language code.

        Args:
            language_code: ISO 639-1 language code (e.g., "hi" for Hindi).

        Returns:
            Dictionary with 'primary', 'heading', and optionally 'decorative' fonts.
        """
        # Handle locale codes (e.g., "hi-IN" -> "hi")
        short_code = language_code.split("-")[0].lower()
        script = LANGUAGE_TO_SCRIPT.get(short_code)
        if script:
            return FONTS_BY_SCRIPT.get(script)
        return None

    @staticmethod
    def get_primary_font(language_code: str) -> FontFamily:
        """Get the primary (body text) font for a language.

        Args:
            language_code: ISO 639-1 language code.

        Returns:
            FontFamily configuration, defaults to Noto Sans (Latin) if not found.
        """
        fonts = FontService.get_fonts_for_language(language_code)
        if fonts:
            return fonts.get("primary", NOTO_SANS_LATIN)
        return NOTO_SANS_LATIN

    @staticmethod
    def get_heading_font(language_code: str) -> FontFamily:
        """Get the heading/title font for a language.

        Args:
            language_code: ISO 639-1 language code.

        Returns:
            FontFamily configuration for headings.
        """
        fonts = FontService.get_fonts_for_language(language_code)
        if fonts:
            return fonts.get("heading", fonts.get("primary", NOTO_SERIF_LATIN))
        return NOTO_SERIF_LATIN

    @staticmethod
    def get_google_fonts_url_for_language(
        language_code: str,
        include_heading: bool = True,
        weights: list[FontWeight] | None = None,
    ) -> str:
        """Get combined Google Fonts URL for a language.

        Args:
            language_code: ISO 639-1 language code.
            include_heading: Whether to include heading font.
            weights: Specific weights to load. None = common weights (400, 500, 700).

        Returns:
            Google Fonts CSS2 API URL with all required fonts.
        """
        if weights is None:
            weights = BODY_TEXT_WEIGHTS

        fonts = FontService.get_fonts_for_language(language_code)
        if not fonts:
            fonts = FONTS_BY_SCRIPT["Latin"]

        primary_font = fonts.get("primary", NOTO_SANS_LATIN)
        font_specs = []

        # Primary font
        primary_name = primary_font.google_fonts_name.replace(" ", "+")
        weight_values = ";".join(str(w.value) for w in sorted(weights, key=lambda w: w.value))
        font_specs.append(f"{primary_name}:wght@{weight_values}")

        # Heading font (if different from primary)
        if include_heading:
            heading_font = fonts.get("heading")
            if heading_font and heading_font.name != primary_font.name:
                heading_name = heading_font.google_fonts_name.replace(" ", "+")
                heading_weights = ";".join(
                    str(w.value) for w in [FontWeight.REGULAR, FontWeight.BOLD]
                )
                font_specs.append(f"{heading_name}:wght@{heading_weights}")

        base_url = "https://fonts.googleapis.com/css2"
        family_param = "&family=".join(font_specs)
        return f"{base_url}?family={family_param}&display=swap"

    @staticmethod
    def get_google_fonts_url_multi_language(
        language_codes: list[str],
        include_heading: bool = True,
    ) -> str:
        """Get Google Fonts URL for multiple languages.

        Optimizes by combining fonts for all languages into a single request.

        Args:
            language_codes: List of ISO 639-1 language codes.
            include_heading: Whether to include heading fonts.

        Returns:
            Google Fonts CSS2 API URL with all required fonts.
        """
        font_specs = []
        seen_fonts = set()

        for lang_code in language_codes:
            fonts = FontService.get_fonts_for_language(lang_code)
            if not fonts:
                continue

            # Primary font
            primary = fonts.get("primary")
            if primary and primary.name not in seen_fonts:
                seen_fonts.add(primary.name)
                name = primary.google_fonts_name.replace(" ", "+")
                font_specs.append(f"{name}:wght@400;500;700")

            # Heading font
            if include_heading:
                heading = fonts.get("heading")
                if heading and heading.name not in seen_fonts:
                    seen_fonts.add(heading.name)
                    name = heading.google_fonts_name.replace(" ", "+")
                    font_specs.append(f"{name}:wght@400;700")

        if not font_specs:
            # Fallback to Latin
            font_specs = ["Noto+Sans:wght@400;500;700"]

        base_url = "https://fonts.googleapis.com/css2"
        family_param = "&family=".join(font_specs)
        return f"{base_url}?family={family_param}&display=swap"

    @staticmethod
    def generate_font_css(
        language_code: str,
        include_heading: bool = True,
        weights: list[FontWeight] | None = None,
    ) -> str:
        """Generate CSS with font-family declarations for a language.

        Args:
            language_code: ISO 639-1 language code.
            include_heading: Whether to include heading font.
            weights: Specific weights to include.

        Returns:
            CSS string with font-family custom properties.
        """
        if weights is None:
            weights = BODY_TEXT_WEIGHTS

        fonts = FontService.get_fonts_for_language(language_code)
        if not fonts:
            fonts = FONTS_BY_SCRIPT["Latin"]

        primary = fonts.get("primary", NOTO_SANS_LATIN)
        heading = fonts.get("heading", NOTO_SERIF_LATIN)

        css_lines = [
            "/* Auto-generated font configuration */",
            f"@import url('{FontService.get_google_fonts_url_for_language(language_code, include_heading, weights)}');",
            "",
            ":root {",
            f"  --font-family-body: {primary.get_font_stack()};",
            f"  --font-family-heading: {heading.get_font_stack()};",
            "  --font-weight-normal: 400;",
            "  --font-weight-medium: 500;",
            "  --font-weight-bold: 700;",
            "}",
            "",
            "body {",
            "  font-family: var(--font-family-body);",
            "}",
            "",
            "h1, h2, h3, h4, h5, h6 {",
            "  font-family: var(--font-family-heading);",
            "}",
        ]

        return "\n".join(css_lines)

    @staticmethod
    def get_all_fonts() -> list[dict]:
        """Get all available fonts as a list for API responses.

        Returns:
            List of font configuration dictionaries.
        """
        return [font.to_dict() for font in FONT_FAMILIES.values()]

    @staticmethod
    def get_fonts_by_category() -> dict[str, list[dict]]:
        """Get fonts organized by category (sans-serif, serif, display).

        Returns:
            Dictionary with category keys and font lists.
        """
        categorized = {
            "sans-serif": [],
            "serif": [],
            "display": [],
        }

        for font in FONT_FAMILIES.values():
            category = font.category
            if category in categorized:
                categorized[category].append(font.to_dict())

        return categorized

    @staticmethod
    def get_script_info(script: str) -> dict | None:
        """Get detailed information about a script and its fonts.

        Args:
            script: Script name (e.g., "Devanagari").

        Returns:
            Dictionary with script info and font configurations.
        """
        fonts = FONTS_BY_SCRIPT.get(script)
        if not fonts:
            return None

        primary = fonts.get("primary")
        if not primary:
            return None

        return {
            "script": script,
            "languages": primary.language_codes,
            "primary_font": primary.to_dict(),
            "heading_font": fonts.get("heading", primary).to_dict(),
            "decorative_font": fonts.get("decorative", {}).to_dict()
            if fonts.get("decorative")
            else None,
            "preview_text": primary.preview_text,
            "sample_characters": primary.sample_characters,
            "unicode_range": primary.unicode_range,
        }

    @staticmethod
    def get_preload_link_tags(language_code: str) -> str:
        """Generate HTML preload link tags for optimal font loading.

        Args:
            language_code: ISO 639-1 language code.

        Returns:
            HTML link tags for preloading fonts.
        """
        fonts = FontService.get_fonts_for_language(language_code)
        if not fonts:
            fonts = FONTS_BY_SCRIPT["Latin"]

        primary = fonts.get("primary", NOTO_SANS_LATIN)
        url = primary.get_google_fonts_url(weights=[FontWeight.REGULAR, FontWeight.BOLD])

        return f'<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="preload" href="{url}" as="style">'

    @staticmethod
    def get_font_display_strategy() -> str:
        """Get recommended font-display strategy.

        Returns 'swap' for optimal UX - shows fallback immediately,
        then swaps to custom font when loaded.
        """
        return "swap"

    @staticmethod
    def validate_font_name(name: str) -> bool:
        """Check if a font name is valid/supported.

        Args:
            name: Font family name.

        Returns:
            True if the font is supported.
        """
        return name in FONT_FAMILIES


# ---------------------------------------------------------------------------
# Convenience Functions (Module-level)
# ---------------------------------------------------------------------------


def get_font_family(name: str) -> FontFamily | None:
    """Get a font family by name."""
    return FontService.get_font_family(name)


def get_fonts_for_language(language_code: str) -> dict[str, FontFamily] | None:
    """Get all fonts for a language code."""
    return FontService.get_fonts_for_language(language_code)


def get_google_fonts_url(language_code: str) -> str:
    """Get Google Fonts URL for a language."""
    return FontService.get_google_fonts_url_for_language(language_code)


def generate_font_css(language_code: str) -> str:
    """Generate CSS for a language's fonts."""
    return FontService.generate_font_css(language_code)
