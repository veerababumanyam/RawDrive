"""Generated constants from shared-constants"""
API_VERSION = "v1"
API_BASE = f"/api/{API_VERSION}"


def _workspace_path(resource: str, workspace_id: str) -> str:
  return f"{API_BASE}/workspaces/{workspace_id}/{resource}"


WORKSPACE_PATHS = {
  "GALLERIES": lambda workspace_id: _workspace_path("galleries", workspace_id),
  "ASSETS": lambda workspace_id: _workspace_path("assets", workspace_id),
  "UPLOADS": lambda workspace_id: _workspace_path("uploads", workspace_id),
  "INVITATIONS": lambda workspace_id: _workspace_path("digital-invitations", workspace_id),
  "FACE_GROUPS": lambda workspace_id: _workspace_path("face-groups", workspace_id),
  "MEMBERS": lambda workspace_id: _workspace_path("members", workspace_id),
  "ROLES": lambda workspace_id: _workspace_path("roles", workspace_id),
}


PUBLIC_PATHS = {
  "GALLERY": lambda slug: f"{API_BASE}/public/galleries/{slug}",
  "INVITATION": lambda token: f"{API_BASE}/public/invitations/{token}",
}


STORAGE = {
  "KB": 1024,
  "MB": 1024 * 1024,
  "GB": 1024 * 1024 * 1024,
  "TB": 1024 * 1024 * 1024 * 1024,
}


FILE_LIMITS = {
  "MAX_PHOTO_SIZE": 100 * STORAGE["MB"],
  "MAX_VIDEO_SIZE": 500 * STORAGE["MB"],
  "MAX_DOCUMENT_SIZE": 50 * STORAGE["MB"],
  "MAX_AVATAR_SIZE": 5 * STORAGE["MB"],
}


STORAGE_KEYS = {
  "WORKSPACE_PREFIX": "workspaces",
  "ASSETS": "assets",
  "AVATARS": "avatars",
  "INVITATIONS": "invitations",
  "THUMBNAILS": "derived/thumbnails",
  "ORIGINALS": "original",
}


AI_THRESHOLDS = {
  "FACE_DETECTION_CONFIDENCE": 0.7,
  "FACE_CLUSTERING_SIMILARITY": 0.6,
  "AUTO_TAG_CONFIDENCE": 0.8,
}


PAGINATION = {
  "DEFAULT_PAGE": 1,
  "DEFAULT_LIMIT": 20,
  "MAX_LIMIT": 100,
}


RATE_LIMITS = {
  "API_REQUESTS_PER_MINUTE": 100,
  "AUTH_ATTEMPTS_PER_15_MIN": 5,
  "UPLOADS_PER_HOUR": 1000,
  "AI_OPS_PER_MINUTE": 30,
}


# ---------------------------------------------------------------------------
# Multi-Language Support (T001)
# Feature: Digital Invitation Service - Regional Language Support
# Supports 6 languages: English, Hindi, Tamil, Telugu, Kannada, Malayalam
# ---------------------------------------------------------------------------


class SupportedLanguage:
    """Language configuration with metadata for invitation rendering."""

    def __init__(
        self,
        code: str,
        name: str,
        native_name: str,
        script: str,
        direction: str = "ltr",
        font_family: str = "Noto Sans",
        locale: str = "",
        region: str = "",
    ):
        self.code = code
        self.name = name
        self.native_name = native_name
        self.script = script
        self.direction = direction
        self.font_family = font_family
        self.locale = locale or f"{code}-IN"
        self.region = region

    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            "code": self.code,
            "name": self.name,
            "native_name": self.native_name,
            "script": self.script,
            "direction": self.direction,
            "font_family": self.font_family,
            "locale": self.locale,
            "region": self.region,
        }


# Supported language codes (ISO 639-1)
LANGUAGE_CODES = ["en", "hi", "ta", "te", "kn", "ml"]

# Default language for invitations
DEFAULT_LANGUAGE = "en"

# Default locale (BCP 47 format)
DEFAULT_LOCALE = "en-IN"


# Language configurations with full metadata
SUPPORTED_LANGUAGES = {
    "en": SupportedLanguage(
        code="en",
        name="English",
        native_name="English",
        script="Latin",
        direction="ltr",
        font_family="Noto Sans",
        locale="en-IN",
        region="India (Pan-India)",
    ),
    "hi": SupportedLanguage(
        code="hi",
        name="Hindi",
        native_name="हिन्दी",
        script="Devanagari",
        direction="ltr",
        font_family="Noto Sans Devanagari",
        locale="hi-IN",
        region="North India, Central India",
    ),
    "ta": SupportedLanguage(
        code="ta",
        name="Tamil",
        native_name="தமிழ்",
        script="Tamil",
        direction="ltr",
        font_family="Noto Sans Tamil",
        locale="ta-IN",
        region="Tamil Nadu, Sri Lanka",
    ),
    "te": SupportedLanguage(
        code="te",
        name="Telugu",
        native_name="తెలుగు",
        script="Telugu",
        direction="ltr",
        font_family="Noto Sans Telugu",
        locale="te-IN",
        region="Andhra Pradesh, Telangana",
    ),
    "kn": SupportedLanguage(
        code="kn",
        name="Kannada",
        native_name="ಕನ್ನಡ",
        script="Kannada",
        direction="ltr",
        font_family="Noto Sans Kannada",
        locale="kn-IN",
        region="Karnataka",
    ),
    "ml": SupportedLanguage(
        code="ml",
        name="Malayalam",
        native_name="മലയാളം",
        script="Malayalam",
        direction="ltr",
        font_family="Noto Sans Malayalam",
        locale="ml-IN",
        region="Kerala",
    ),
}


# Quick lookup for valid language codes (includes locale variants)
VALID_LANGUAGE_CODES = set(LANGUAGE_CODES) | {
    "en-IN", "hi-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN"
}


# Script-to-languages mapping (for font grouping)
SCRIPT_LANGUAGES = {
    "Latin": ["en"],
    "Devanagari": ["hi"],
    "Tamil": ["ta"],
    "Telugu": ["te"],
    "Kannada": ["kn"],
    "Malayalam": ["ml"],
}


# Font family mapping for each script (primary and fallback)
SCRIPT_FONTS = {
    "Latin": {
        "primary": "Noto Sans",
        "heading": "Playfair Display",
        "fallback": ["Inter", "sans-serif"],
    },
    "Devanagari": {
        "primary": "Noto Sans Devanagari",
        "heading": "Noto Serif Devanagari",
        "fallback": ["Noto Sans Devanagari", "sans-serif"],
    },
    "Tamil": {
        "primary": "Noto Sans Tamil",
        "heading": "Noto Serif Tamil",
        "fallback": ["Noto Sans Tamil", "sans-serif"],
    },
    "Telugu": {
        "primary": "Noto Sans Telugu",
        "heading": "Noto Serif Telugu",
        "fallback": ["Noto Sans Telugu", "sans-serif"],
    },
    "Kannada": {
        "primary": "Noto Sans Kannada",
        "heading": "Noto Serif Kannada",
        "fallback": ["Noto Sans Kannada", "sans-serif"],
    },
    "Malayalam": {
        "primary": "Noto Sans Malayalam",
        "heading": "Noto Serif Malayalam",
        "fallback": ["Noto Sans Malayalam", "sans-serif"],
    },
}


# Regional cultural context for AI content generation
LANGUAGE_CULTURAL_CONTEXT = {
    "en": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "semi-formal",
        "common_salutations": ["Dear", "Respected", "Beloved"],
        "auspicious_elements": [],
        "wedding_traditions": ["Western", "Christian", "Civil"],
    },
    "hi": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "formal",
        "common_salutations": ["श्रीमान/श्रीमती", "आदरणीय", "प्रिय"],
        "auspicious_elements": ["शुभ विवाह", "सौभाग्यवती", "श्री गणेशाय नमः", "शुभ मुहूर्त"],
        "wedding_traditions": ["Hindu", "Sikh", "Arya Samaj", "Court Marriage"],
    },
    "ta": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "formal",
        "common_salutations": ["திரு/திருமதி", "மதிப்பிற்குரிய", "அன்பான"],
        "auspicious_elements": ["சுபம்", "திருமணம்", "பிள்ளையார் சுழி", "சுப முகூர்த்தம்"],
        "wedding_traditions": ["Hindu Tamil", "Christian", "Brahmin", "Non-Brahmin"],
    },
    "te": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "formal",
        "common_salutations": ["శ్రీ/శ్రీమతి", "గౌరవనీయ", "ప్రియమైన"],
        "auspicious_elements": ["శుభం", "పెళ్ళి", "శ్రీ గణేశాయ నమః", "శుభ ముహూర్తం"],
        "wedding_traditions": ["Telugu Hindu", "Brahmin", "Reddy", "Kamma"],
    },
    "kn": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "formal",
        "common_salutations": ["ಶ್ರೀ/ಶ್ರೀಮತಿ", "ಗೌರವಾನ್ವಿತ", "ಪ್ರಿಯ"],
        "auspicious_elements": ["ಶುಭ", "ವಿವಾಹ", "ಶ್ರೀ ಗಣೇಶಾಯ ನಮಃ", "ಶುಭ ಮುಹೂರ್ತ"],
        "wedding_traditions": ["Kannada Hindu", "Lingayat", "Vokkaliga", "Brahmin"],
    },
    "ml": {
        "formality_options": ["formal", "semi-formal", "casual"],
        "default_formality": "formal",
        "common_salutations": ["ശ്രീ/ശ്രീമതി", "ബഹുമാനപ്പെട്ട", "പ്രിയപ്പെട്ട"],
        "auspicious_elements": ["ശുഭം", "വിവാഹം", "ശ്രീ ഗണേശായ നമഃ", "ശുഭ മുഹൂർത്തം"],
        "wedding_traditions": ["Kerala Hindu", "Nair", "Ezhava", "Syrian Christian", "Muslim"],
    },
}


# Default UI labels for common invitation elements (i18n)
INVITATION_UI_LABELS = {
    "en": {
        "event_details": "Event Details",
        "date_and_time": "Date & Time",
        "venue": "Venue",
        "rsvp": "RSVP",
        "rsvp_by": "Please respond by",
        "attending": "Will Attend",
        "not_attending": "Unable to Attend",
        "maybe": "Maybe",
        "number_of_guests": "Number of Guests",
        "dietary_preferences": "Dietary Preferences",
        "message_to_host": "Message to Host",
        "submit": "Submit",
        "add_to_calendar": "Add to Calendar",
        "get_directions": "Get Directions",
        "contact_host": "Contact Host",
        "save_the_date": "Save the Date",
        "you_are_invited": "You are cordially invited",
        "with_love": "With love",
        "hosted_by": "Hosted by",
    },
    "hi": {
        "event_details": "कार्यक्रम विवरण",
        "date_and_time": "दिनांक और समय",
        "venue": "स्थान",
        "rsvp": "उपस्थिति की पुष्टि करें",
        "rsvp_by": "कृपया इस तारीख तक जवाब दें",
        "attending": "उपस्थित रहूंगा/रहूंगी",
        "not_attending": "उपस्थित नहीं हो पाऊंगा/पाऊंगी",
        "maybe": "शायद",
        "number_of_guests": "मेहमानों की संख्या",
        "dietary_preferences": "खान-पान संबंधी प्राथमिकताएं",
        "message_to_host": "मेज़बान के लिए संदेश",
        "submit": "जमा करें",
        "add_to_calendar": "कैलेंडर में जोड़ें",
        "get_directions": "दिशानिर्देश प्राप्त करें",
        "contact_host": "मेज़बान से संपर्क करें",
        "save_the_date": "तारीख याद रखें",
        "you_are_invited": "आप सादर आमंत्रित हैं",
        "with_love": "स्नेह सहित",
        "hosted_by": "आयोजक",
    },
    "ta": {
        "event_details": "நிகழ்வு விவரங்கள்",
        "date_and_time": "தேதி மற்றும் நேரம்",
        "venue": "இடம்",
        "rsvp": "பதில் அளிக்கவும்",
        "rsvp_by": "இந்த தேதிக்குள் பதிலளிக்கவும்",
        "attending": "வருவேன்",
        "not_attending": "வர இயலாது",
        "maybe": "ஒருவேளை",
        "number_of_guests": "விருந்தினர்களின் எண்ணிக்கை",
        "dietary_preferences": "உணவு விருப்பங்கள்",
        "message_to_host": "நிகழ்ச்சி நடத்துபவருக்கு செய்தி",
        "submit": "சமர்ப்பிக்கவும்",
        "add_to_calendar": "நாட்காட்டியில் சேர்க்கவும்",
        "get_directions": "வழிகாட்டுதல் பெறுங்கள்",
        "contact_host": "தொடர்பு கொள்ளுங்கள்",
        "save_the_date": "நாளை நினைவில் வைக்கவும்",
        "you_are_invited": "நீங்கள் அன்புடன் அழைக்கப்படுகிறீர்கள்",
        "with_love": "அன்புடன்",
        "hosted_by": "நிகழ்ச்சி நடத்துபவர்",
    },
    "te": {
        "event_details": "కార్యక్రమ వివరాలు",
        "date_and_time": "తేదీ మరియు సమయం",
        "venue": "వేదిక",
        "rsvp": "హాజరు నిర్ధారించండి",
        "rsvp_by": "దయచేసి ఈ తేదీలోగా జవాబివ్వండి",
        "attending": "హాజరవుతాను",
        "not_attending": "హాజరుకాలేను",
        "maybe": "బహుశా",
        "number_of_guests": "అతిథుల సంఖ్య",
        "dietary_preferences": "ఆహార ప్రాధాన్యతలు",
        "message_to_host": "ఆతిథేయునికి సందేశం",
        "submit": "సమర్పించు",
        "add_to_calendar": "క్యాలెండర్‌కు జోడించండి",
        "get_directions": "మార్గనిర్దేశం పొందండి",
        "contact_host": "సంప్రదించండి",
        "save_the_date": "తేదీ గుర్తుంచుకోండి",
        "you_are_invited": "మిమ్మల్ని ఆహ్వానిస్తున్నాము",
        "with_love": "ప్రేమతో",
        "hosted_by": "ఆతిథేయులు",
    },
    "kn": {
        "event_details": "ಕಾರ್ಯಕ್ರಮದ ವಿವರಗಳು",
        "date_and_time": "ದಿನಾಂಕ ಮತ್ತು ಸಮಯ",
        "venue": "ಸ್ಥಳ",
        "rsvp": "ಹಾಜರಾತಿ ದೃಢೀಕರಿಸಿ",
        "rsvp_by": "ದಯವಿಟ್ಟು ಈ ದಿನಾಂಕದೊಳಗೆ ಪ್ರತಿಕ್ರಿಯಿಸಿ",
        "attending": "ಹಾಜರಾಗುತ್ತೇನೆ",
        "not_attending": "ಹಾಜರಾಗಲು ಸಾಧ್ಯವಿಲ್ಲ",
        "maybe": "ಬಹುಶಃ",
        "number_of_guests": "ಅತಿಥಿಗಳ ಸಂಖ್ಯೆ",
        "dietary_preferences": "ಆಹಾರ ಆದ್ಯತೆಗಳು",
        "message_to_host": "ಆತಿಥೇಯರಿಗೆ ಸಂದೇಶ",
        "submit": "ಸಲ್ಲಿಸಿ",
        "add_to_calendar": "ಕ್ಯಾಲೆಂಡರ್‌ಗೆ ಸೇರಿಸಿ",
        "get_directions": "ಮಾರ್ಗಸೂಚಿ ಪಡೆಯಿರಿ",
        "contact_host": "ಸಂಪರ್ಕಿಸಿ",
        "save_the_date": "ದಿನಾಂಕ ನೆನಪಿಡಿ",
        "you_are_invited": "ನಿಮ್ಮನ್ನು ಪ್ರೀತಿಯಿಂದ ಆಹ್ವಾನಿಸುತ್ತೇವೆ",
        "with_love": "ಪ್ರೀತಿಯಿಂದ",
        "hosted_by": "ಆತಿಥೇಯರು",
    },
    "ml": {
        "event_details": "പരിപാടി വിശദാംശങ്ങൾ",
        "date_and_time": "തീയതിയും സമയവും",
        "venue": "വേദി",
        "rsvp": "സാന്നിധ്യം അറിയിക്കുക",
        "rsvp_by": "ദയവായി ഈ തീയതിക്കുള്ളിൽ മറുപടി നൽകുക",
        "attending": "സംബന്ധിക്കും",
        "not_attending": "സംബന്ധിക്കാൻ കഴിയില്ല",
        "maybe": "ഒരുപക്ഷേ",
        "number_of_guests": "അതിഥികളുടെ എണ്ണം",
        "dietary_preferences": "ഭക്ഷണ മുൻഗണനകൾ",
        "message_to_host": "ആതിഥേയനോട് സന്ദേശം",
        "submit": "സമർപ്പിക്കുക",
        "add_to_calendar": "കലണ്ടറിൽ ചേർക്കുക",
        "get_directions": "ദിശ കണ്ടെത്തുക",
        "contact_host": "ബന്ധപ്പെടുക",
        "save_the_date": "തീയതി ഓർമ്മിക്കുക",
        "you_are_invited": "നിങ്ങളെ സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു",
        "with_love": "സ്നേഹത്തോടെ",
        "hosted_by": "ആതിഥേയർ",
    },
}


def get_language_config(code: str) -> SupportedLanguage | None:
    """Get language configuration by code.

    Accepts both short codes (en, hi) and locale codes (en-IN, hi-IN).

    Args:
        code: Language code or locale code

    Returns:
        SupportedLanguage configuration or None if not found
    """
    # Normalize to short code
    short_code = code.split("-")[0].lower() if "-" in code else code.lower()
    return SUPPORTED_LANGUAGES.get(short_code)


def get_font_for_language(code: str) -> dict:
    """Get font configuration for a language.

    Args:
        code: Language code

    Returns:
        Font configuration dict with primary, heading, and fallback fonts
    """
    lang = get_language_config(code)
    if lang:
        return SCRIPT_FONTS.get(lang.script, SCRIPT_FONTS["Latin"])
    return SCRIPT_FONTS["Latin"]


def get_ui_labels(code: str) -> dict:
    """Get UI labels for a language.

    Args:
        code: Language code

    Returns:
        Dictionary of UI labels, falls back to English if not found
    """
    short_code = code.split("-")[0].lower() if "-" in code else code.lower()
    return INVITATION_UI_LABELS.get(short_code, INVITATION_UI_LABELS["en"])


def get_cultural_context(code: str) -> dict:
    """Get cultural context for a language (for AI content generation).

    Args:
        code: Language code

    Returns:
        Dictionary of cultural context, falls back to English if not found
    """
    short_code = code.split("-")[0].lower() if "-" in code else code.lower()
    return LANGUAGE_CULTURAL_CONTEXT.get(short_code, LANGUAGE_CULTURAL_CONTEXT["en"])


def is_valid_language(code: str) -> bool:
    """Check if a language code is supported.

    Args:
        code: Language code or locale code

    Returns:
        True if the language is supported
    """
    return code in VALID_LANGUAGE_CODES or code.lower() in LANGUAGE_CODES


def get_all_languages() -> list[dict]:
    """Get all supported languages as a list of dictionaries.

    Returns:
        List of language configurations for API responses
    """
    return [lang.to_dict() for lang in SUPPORTED_LANGUAGES.values()]
