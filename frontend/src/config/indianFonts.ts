/**
 * Indian Language Font Configuration
 *
 * Provides multiple font style options for each of the 12 Indian languages.
 * Fonts are loaded from Google Fonts CDN for reliability and performance.
 *
 * Font Categories:
 * - display: Decorative/calligraphic fonts for headings and titles
 * - body: Clean, readable fonts for body text
 * - traditional: Classical script-style fonts
 *
 * Feature: 019-invitation-indian-languages (Font Enhancement)
 */

export interface FontOption {
  name: string;
  family: string;
  category: 'display' | 'body' | 'traditional';
  weights: number[];
  googleFontsUrl: string;
  /** Optional local file path for self-hosted fonts */
  localPath?: string;
  /** Preview text in the font's script */
  previewText: string;
}

export interface LanguageFontConfig {
  code: string;
  name: string;
  nativeName: string;
  script: string;
  direction: 'ltr' | 'rtl';
  fonts: FontOption[];
}

/**
 * Comprehensive font configuration for all supported Indian languages.
 * Each language has 3-5 font options across display, body, and traditional categories.
 */
export const INDIAN_LANGUAGE_FONTS: LanguageFontConfig[] = [
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    script: 'Devanagari',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Devanagari',
        family: "'Noto Sans Devanagari', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap',
        previewText: 'आपका स्वागत है',
      },
      {
        name: 'Noto Serif Devanagari',
        family: "'Noto Serif Devanagari', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Devanagari:wght@400;500;600;700&display=swap',
        previewText: 'शुभ विवाह',
      },
      {
        name: 'Tiro Devanagari Hindi',
        family: "'Tiro Devanagari Hindi', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Hindi:ital@0;1&display=swap',
        previewText: 'सादर आमंत्रण',
      },
      {
        name: 'Poppins',
        family: "'Poppins', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
        previewText: 'आप सादर आमंत्रित हैं',
      },
      {
        name: 'Mukta',
        family: "'Mukta', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700&display=swap',
        previewText: 'हार्दिक शुभकामनाएं',
      },
    ],
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    script: 'Devanagari',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Devanagari',
        family: "'Noto Sans Devanagari', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap',
        previewText: 'आपणास हार्दिक निमंत्रण',
      },
      {
        name: 'Noto Serif Devanagari',
        family: "'Noto Serif Devanagari', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Devanagari:wght@400;500;600;700&display=swap',
        previewText: 'शुभ मंगल',
      },
      {
        name: 'Mukta',
        family: "'Mukta', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mukta:wght@400;500;600;700&display=swap',
        previewText: 'मंगलमय हो',
      },
      {
        name: 'Tiro Devanagari Marathi',
        family: "'Tiro Devanagari Marathi', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Devanagari+Marathi:ital@0;1&display=swap',
        previewText: 'सप्रेम निमंत्रण',
      },
    ],
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    script: 'Telugu',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Telugu',
        family: "'Noto Sans Telugu', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap',
        previewText: 'మీకు ఆహ్వానం',
      },
      {
        name: 'Noto Serif Telugu',
        family: "'Noto Serif Telugu', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Telugu:wght@400;500;600;700&display=swap',
        previewText: 'శుభ వివాహం',
      },
      {
        name: 'Tiro Telugu',
        family: "'Tiro Telugu', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Telugu:ital@0;1&display=swap',
        previewText: 'ఆత్మీయ ఆహ్వానం',
      },
      {
        name: 'Mandali',
        family: "'Mandali', sans-serif",
        category: 'body',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mandali&display=swap',
        previewText: 'హృదయపూర్వక స్వాగతం',
      },
    ],
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    script: 'Tamil',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Tamil',
        family: "'Noto Sans Tamil', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap',
        previewText: 'உங்களை அழைக்கிறோம்',
      },
      {
        name: 'Noto Serif Tamil',
        family: "'Noto Serif Tamil', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Tamil:wght@400;500;600;700&display=swap',
        previewText: 'திருமண விழா',
      },
      {
        name: 'Tiro Tamil',
        family: "'Tiro Tamil', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Tamil:ital@0;1&display=swap',
        previewText: 'அன்புடன் அழைப்பு',
      },
      {
        name: 'Mukta Malar',
        family: "'Mukta Malar', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mukta+Malar:wght@400;500;600;700&display=swap',
        previewText: 'நல்வரவு',
      },
    ],
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    script: 'Kannada',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Kannada',
        family: "'Noto Sans Kannada', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Kannada:wght@400;500;600;700&display=swap',
        previewText: 'ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸುತ್ತೇವೆ',
      },
      {
        name: 'Noto Serif Kannada',
        family: "'Noto Serif Kannada', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Kannada:wght@400;500;600;700&display=swap',
        previewText: 'ಶುಭ ವಿವಾಹ',
      },
      {
        name: 'Tiro Kannada',
        family: "'Tiro Kannada', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Kannada:ital@0;1&display=swap',
        previewText: 'ಪ್ರೀತಿಯ ಆಹ್ವಾನ',
      },
    ],
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    script: 'Malayalam',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Malayalam',
        family: "'Noto Sans Malayalam', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Malayalam:wght@400;500;600;700&display=swap',
        previewText: 'നിങ്ങളെ ക്ഷണിക്കുന്നു',
      },
      {
        name: 'Noto Serif Malayalam',
        family: "'Noto Serif Malayalam', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Malayalam:wght@400;500;600;700&display=swap',
        previewText: 'വിവാഹ ക്ഷണം',
      },
      {
        name: 'Tiro Malayalam',
        family: "'Tiro Malayalam', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Malayalam:ital@0;1&display=swap',
        previewText: 'സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു',
      },
    ],
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    script: 'Bengali',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Bengali',
        family: "'Noto Sans Bengali', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap',
        previewText: 'আপনাকে আমন্ত্রণ',
      },
      {
        name: 'Noto Serif Bengali',
        family: "'Noto Serif Bengali', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;500;600;700&display=swap',
        previewText: 'শুভ বিবাহ',
      },
      {
        name: 'Tiro Bangla',
        family: "'Tiro Bangla', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Bangla:ital@0;1&display=swap',
        previewText: 'সাদর আমন্ত্রণ',
      },
      {
        name: 'Galada',
        family: "'Galada', cursive",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Galada&display=swap',
        previewText: 'স্বাগতম',
      },
    ],
  },
  {
    code: 'as',
    name: 'Assamese',
    nativeName: 'অসমীয়া',
    script: 'Bengali',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Bengali',
        family: "'Noto Sans Bengali', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&display=swap',
        previewText: 'আপোনাক আমন্ত্ৰণ',
      },
      {
        name: 'Noto Serif Bengali',
        family: "'Noto Serif Bengali', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@400;500;600;700&display=swap',
        previewText: 'শুভ বিবাহ',
      },
      {
        name: 'Tiro Bangla',
        family: "'Tiro Bangla', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Bangla:ital@0;1&display=swap',
        previewText: 'সাদৰ আমন্ত্ৰণ',
      },
    ],
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    script: 'Gujarati',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Gujarati',
        family: "'Noto Sans Gujarati', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gujarati:wght@400;500;600;700&display=swap',
        previewText: 'આપને આમંત્રણ',
      },
      {
        name: 'Noto Serif Gujarati',
        family: "'Noto Serif Gujarati', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Gujarati:wght@400;500;600;700&display=swap',
        previewText: 'શુભ લગ્ન',
      },
      {
        name: 'Tiro Gurmukhi',
        family: "'Tiro Gurmukhi', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Gurmukhi:ital@0;1&display=swap',
        previewText: 'પ્રેમથી આમંત્રણ',
      },
      {
        name: 'Mukta Vaani',
        family: "'Mukta Vaani', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mukta+Vaani:wght@400;500;600;700&display=swap',
        previewText: 'સાદર પધારો',
      },
    ],
  },
  {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    script: 'Oriya',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Oriya',
        family: "'Noto Sans Oriya', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700&display=swap',
        previewText: 'ଆପଣଙ୍କୁ ଆମନ୍ତ୍ରଣ',
      },
      {
        name: 'Noto Serif Oriya',
        family: "'Noto Serif Oriya', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Oriya:wght@400;500;600;700&display=swap',
        previewText: 'ଶୁଭ ବିବାହ',
      },
    ],
  },
  {
    code: 'pa',
    name: 'Punjabi',
    nativeName: 'ਪੰਜਾਬੀ',
    script: 'Gurmukhi',
    direction: 'ltr',
    fonts: [
      {
        name: 'Noto Sans Gurmukhi',
        family: "'Noto Sans Gurmukhi', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@400;500;600;700&display=swap',
        previewText: 'ਤੁਹਾਨੂੰ ਸੱਦਾ',
      },
      {
        name: 'Noto Serif Gurmukhi',
        family: "'Noto Serif Gurmukhi', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Gurmukhi:wght@400;500;600;700&display=swap',
        previewText: 'ਸ਼ੁਭ ਵਿਆਹ',
      },
      {
        name: 'Tiro Gurmukhi',
        family: "'Tiro Gurmukhi', serif",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Tiro+Gurmukhi:ital@0;1&display=swap',
        previewText: 'ਪਿਆਰ ਨਾਲ ਸੱਦਾ',
      },
      {
        name: 'Mukta Mahee',
        family: "'Mukta Mahee', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Mukta+Mahee:wght@400;500;600;700&display=swap',
        previewText: 'ਜੀ ਆਇਆਂ ਨੂੰ',
      },
    ],
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    script: 'Arabic',
    direction: 'rtl',
    fonts: [
      {
        name: 'Noto Nastaliq Urdu',
        family: "'Noto Nastaliq Urdu', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap',
        previewText: 'آپ کو دعوت',
      },
      {
        name: 'Noto Sans Arabic',
        family: "'Noto Sans Arabic', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap',
        previewText: 'آپ کا استقبال',
      },
      {
        name: 'Noto Serif Arabic',
        family: "'Noto Serif Arabic', serif",
        category: 'display',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Noto+Serif+Arabic:wght@400;500;600;700&display=swap',
        previewText: 'مبارک شادی',
      },
      {
        name: 'Amiri',
        family: "'Amiri', serif",
        category: 'display',
        weights: [400, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap',
        previewText: 'خوش آمدید',
      },
    ],
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    script: 'Latin',
    direction: 'ltr',
    fonts: [
      {
        name: 'Inter',
        family: "'Inter', sans-serif",
        category: 'body',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
        previewText: 'You are cordially invited',
      },
      {
        name: 'Playfair Display',
        family: "'Playfair Display', serif",
        category: 'display',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap',
        previewText: 'Wedding Invitation',
      },
      {
        name: 'Great Vibes',
        family: "'Great Vibes', cursive",
        category: 'display',
        weights: [400],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap',
        previewText: 'Save the Date',
      },
      {
        name: 'Cormorant Garamond',
        family: "'Cormorant Garamond', serif",
        category: 'traditional',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap',
        previewText: 'Together with their families',
      },
      {
        name: 'Dancing Script',
        family: "'Dancing Script', cursive",
        category: 'display',
        weights: [400, 500, 600, 700],
        googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;500;600;700&display=swap',
        previewText: 'With Love',
      },
    ],
  },
];

/**
 * Get all fonts for a specific language code
 */
export const getFontsForLanguage = (languageCode: string): FontOption[] => {
  const config = INDIAN_LANGUAGE_FONTS.find((lang) => lang.code === languageCode);
  return config?.fonts || [];
};

/**
 * Get fonts filtered by category
 */
export const getFontsByCategory = (
  languageCode: string,
  category: 'display' | 'body' | 'traditional'
): FontOption[] => {
  const fonts = getFontsForLanguage(languageCode);
  return fonts.filter((font) => font.category === category);
};

/**
 * Get the default font for a language (first body font, or first available)
 */
export const getDefaultFont = (languageCode: string): FontOption | undefined => {
  const fonts = getFontsForLanguage(languageCode);
  return fonts.find((font) => font.category === 'body') || fonts[0];
};

/**
 * Get all unique Google Fonts URLs for preloading
 */
export const getAllGoogleFontUrls = (): string[] => {
  const urls = new Set<string>();
  INDIAN_LANGUAGE_FONTS.forEach((lang) => {
    lang.fonts.forEach((font) => {
      urls.add(font.googleFontsUrl);
    });
  });
  return Array.from(urls);
};

/**
 * Get Google Fonts URLs for specific languages (for on-demand loading)
 */
export const getGoogleFontUrlsForLanguages = (languageCodes: string[]): string[] => {
  const urls = new Set<string>();
  languageCodes.forEach((code) => {
    const config = INDIAN_LANGUAGE_FONTS.find((lang) => lang.code === code);
    config?.fonts.forEach((font) => {
      urls.add(font.googleFontsUrl);
    });
  });
  return Array.from(urls);
};

/**
 * Font category labels for UI
 */
export const FONT_CATEGORY_LABELS: Record<string, string> = {
  display: 'Decorative',
  body: 'Clean & Modern',
  traditional: 'Traditional',
};

export default INDIAN_LANGUAGE_FONTS;
