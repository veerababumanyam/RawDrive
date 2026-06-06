export type CoverFontClassification = "serif" | "sans" | "display" | "mono";

export interface CoverFontOption {
  name: string;
  classification: CoverFontClassification;
  fallback?: string;
}

export interface CoverTextLanguage {
  id: string;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  script: string;
  sample: string;
  dir: "ltr" | "rtl";
  fallback: string;
  fonts: CoverFontOption[];
}

export const COVER_FONT_WEIGHTS = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semi Bold" },
  { value: 700, label: "Bold" },
] as const;

const latinFonts: CoverFontOption[] = [
  { name: "Playfair Display", classification: "serif" },
  { name: "Cormorant Garamond", classification: "serif" },
  { name: "Lora", classification: "serif" },
  { name: "Manrope", classification: "sans" },
  { name: "Montserrat", classification: "sans" },
  { name: "DM Sans", classification: "sans" },
  { name: "Inter", classification: "sans" },
  { name: "Lato", classification: "sans" },
  { name: "Open Sans", classification: "sans" },
  { name: "Source Sans Pro", classification: "sans" },
  { name: "DM Mono", classification: "mono" },
];

const devanagariFonts: CoverFontOption[] = [
  { name: "Noto Sans Devanagari", classification: "sans" },
  { name: "Noto Serif Devanagari", classification: "serif" },
  { name: "Hind", classification: "sans" },
  { name: "Mukta", classification: "sans" },
  { name: "Martel", classification: "serif" },
  { name: "Kalam", classification: "display" },
  { name: "Yatra One", classification: "display" },
  { name: "Modak", classification: "display" },
  { name: "Alkatra", classification: "display" },
  { name: "Gotu", classification: "display" },
  { name: "Ranga", classification: "display" },
  { name: "Rozha One", classification: "display" },
  { name: "Kadwa", classification: "serif" },
  { name: "Arya", classification: "sans" },
  { name: "Baloo 2", classification: "display" },
  { name: "Biryani", classification: "sans" },
  { name: "Eczar", classification: "serif" },
  { name: "Sahitya", classification: "serif" },
  { name: "Karma", classification: "serif" },
  { name: "Tiro Devanagari Hindi", classification: "serif" },
  { name: "Tiro Devanagari Marathi", classification: "serif" },
  { name: "Tiro Devanagari Sanskrit", classification: "serif" },
];

const bengaliFonts: CoverFontOption[] = [
  { name: "Noto Sans Bengali", classification: "sans" },
  { name: "Noto Serif Bengali", classification: "serif" },
  { name: "Hind Siliguri", classification: "sans" },
  { name: "Baloo Da 2", classification: "display" },
  { name: "Atma", classification: "display" },
  { name: "Galada", classification: "display" },
  { name: "Mina", classification: "sans" },
  { name: "Anek Bangla", classification: "sans" },
  { name: "Tiro Bangla", classification: "serif" },
  { name: "Alkatra", classification: "display" },
];

const teluguFonts: CoverFontOption[] = [
  { name: "Noto Sans Telugu", classification: "sans" },
  { name: "Noto Serif Telugu", classification: "serif" },
  { name: "Anek Telugu", classification: "sans" },
  { name: "Baloo Tammudu 2", classification: "display" },
  { name: "Sirivennela", classification: "display" },
  { name: "Ravi Prakash", classification: "display" },
  { name: "Lakki Reddy", classification: "display" },
  { name: "Tenali Ramakrishna", classification: "display" },
  { name: "Dhurjati", classification: "display" },
  { name: "Mandali", classification: "sans" },
  { name: "Ramabhadra", classification: "sans" },
  { name: "NTR", classification: "sans" },
  { name: "Ponnala", classification: "display" },
  { name: "Gurajada", classification: "display" },
  { name: "Ramaraja", classification: "display" },
  { name: "Timmana", classification: "display" },
  { name: "Sree Krushnadevaraya", classification: "serif" },
  { name: "Suravaram", classification: "serif" },
  { name: "Gidugu", classification: "sans" },
  { name: "Mallanna", classification: "sans" },
  { name: "Suranna", classification: "serif" },
  { name: "Tiro Telugu", classification: "serif" },
];

const tamilFonts: CoverFontOption[] = [
  { name: "Noto Sans Tamil", classification: "sans" },
  { name: "Noto Serif Tamil", classification: "serif" },
  { name: "Anek Tamil", classification: "sans" },
  { name: "Catamaran", classification: "sans" },
  { name: "Hind Madurai", classification: "sans" },
  { name: "Kavivanar", classification: "display" },
  { name: "Pavanam", classification: "sans" },
  { name: "Meera Inimai", classification: "sans" },
  { name: "Mukta Malar", classification: "sans" },
  { name: "Baloo Thambi 2", classification: "display" },
  { name: "Tiro Tamil", classification: "serif" },
  { name: "Arima", classification: "display" },
];

const malayalamFonts: CoverFontOption[] = [
  { name: "Noto Sans Malayalam", classification: "sans" },
  { name: "Noto Serif Malayalam", classification: "serif" },
  { name: "Anek Malayalam", classification: "sans" },
  { name: "Baloo Chettan 2", classification: "display" },
  { name: "Manjari", classification: "sans" },
  { name: "Gayathri", classification: "sans" },
  { name: "Chilanka", classification: "display" },
  { name: "Arima", classification: "display" },
  { name: "Noto Sans Malayalam UI", classification: "sans" },
  { name: "Google Sans", classification: "sans" },
];

const kannadaFonts: CoverFontOption[] = [
  { name: "Noto Sans Kannada", classification: "sans" },
  { name: "Noto Serif Kannada", classification: "serif" },
  { name: "Anek Kannada", classification: "sans" },
  { name: "Baloo Tamma 2", classification: "display" },
  { name: "Akaya Kanadaka", classification: "display" },
  { name: "Tiro Kannada", classification: "serif" },
  { name: "Hind Mysuru", classification: "sans" },
  { name: "Benne", classification: "display" },
  { name: "Hubballi", classification: "sans" },
  { name: "Padyakke Expanded One", classification: "display" },
];

const gujaratiFonts: CoverFontOption[] = [
  { name: "Noto Sans Gujarati", classification: "sans" },
  { name: "Noto Serif Gujarati", classification: "serif" },
  { name: "Anek Gujarati", classification: "sans" },
  { name: "Baloo Bhai 2", classification: "display" },
  { name: "Hind Vadodara", classification: "sans" },
  { name: "Mukta Vaani", classification: "sans" },
  { name: "Rasa", classification: "serif" },
  { name: "Kumar One", classification: "display" },
  { name: "Kumar One Outline", classification: "display" },
  { name: "Shrikhand", classification: "display" },
];

const gurmukhiFonts: CoverFontOption[] = [
  { name: "Noto Sans Gurmukhi", classification: "sans" },
  { name: "Noto Serif Gurmukhi", classification: "serif" },
  { name: "Anek Gurmukhi", classification: "sans" },
  { name: "Baloo Paaji 2", classification: "display" },
  { name: "Mukta Mahee", classification: "sans" },
  { name: "Tiro Gurmukhi", classification: "serif" },
  { name: "Langar", classification: "display" },
  { name: "Braah One", classification: "display" },
  { name: "BhuTuka Expanded One", classification: "display" },
  { name: "Google Sans", classification: "sans" },
];

const odiaFonts: CoverFontOption[] = [
  { name: "Noto Sans Oriya", classification: "sans" },
  { name: "Noto Serif Oriya", classification: "serif" },
  { name: "Anek Odia", classification: "sans" },
  { name: "Baloo Bhaina 2", classification: "display" },
  { name: "Alkatra", classification: "display" },
  { name: "Noto Sans Oriya UI", classification: "sans" },
  { name: "Google Sans", classification: "sans" },
  { name: "Noto Sans", classification: "sans" },
  { name: "Noto Serif", classification: "serif" },
  { name: "Noto Sans Display", classification: "display" },
];

const urduFonts: CoverFontOption[] = [
  { name: "Noto Nastaliq Urdu", classification: "serif" },
  { name: "Noto Naskh Arabic", classification: "serif" },
  { name: "Noto Sans Arabic", classification: "sans" },
  { name: "Noto Kufi Arabic", classification: "display" },
  { name: "Baloo Bhaijaan 2", classification: "display" },
  { name: "Lemonada", classification: "display" },
  { name: "Rakkas", classification: "display" },
  { name: "Aref Ruqaa", classification: "display" },
  { name: "Aref Ruqaa Ink", classification: "display" },
  { name: "Katibeh", classification: "display" },
  { name: "Amiri", classification: "serif" },
  { name: "Scheherazade New", classification: "serif" },
  { name: "Lateef", classification: "serif" },
  { name: "Reem Kufi", classification: "display" },
  { name: "El Messiri", classification: "display" },
  { name: "Mirza", classification: "display" },
  { name: "Markazi Text", classification: "serif" },
  { name: "Cairo", classification: "sans" },
  { name: "Tajawal", classification: "sans" },
  { name: "Almarai", classification: "sans" },
  { name: "Changa", classification: "sans" },
];

function language(
  values: Omit<CoverTextLanguage, "dir"> & {
    dir?: "ltr" | "rtl";
  },
): CoverTextLanguage {
  return { dir: "ltr", ...values };
}

export const COVER_TEXT_LANGUAGES: CoverTextLanguage[] = [
  language({
    id: "english",
    label: "English / Latin",
    nativeLabel: "English",
    htmlLang: "en",
    script: "Latin",
    sample: "Aa",
    fallback: "Inter, system-ui, sans-serif",
    fonts: latinFonts,
  }),
  language({
    id: "hindi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    htmlLang: "hi",
    script: "Devanagari",
    sample: "क ख ग",
    fallback: "'Noto Sans Devanagari', 'Nirmala UI', sans-serif",
    fonts: devanagariFonts,
  }),
  language({
    id: "marathi",
    label: "Marathi",
    nativeLabel: "मराठी",
    htmlLang: "mr",
    script: "Devanagari",
    sample: "म र ठ",
    fallback: "'Noto Sans Devanagari', 'Nirmala UI', sans-serif",
    fonts: devanagariFonts,
  }),
  language({
    id: "sanskrit",
    label: "Sanskrit",
    nativeLabel: "संस्कृतम्",
    htmlLang: "sa",
    script: "Devanagari",
    sample: "अ आ इ",
    fallback: "'Noto Serif Devanagari', 'Nirmala UI', serif",
    fonts: devanagariFonts,
  }),
  language({
    id: "bengali",
    label: "Bengali",
    nativeLabel: "বাংলা",
    htmlLang: "bn",
    script: "Bengali",
    sample: "ক খ গ",
    fallback: "'Noto Sans Bengali', sans-serif",
    fonts: bengaliFonts,
  }),
  language({
    id: "assamese",
    label: "Assamese",
    nativeLabel: "অসমীয়া",
    htmlLang: "as",
    script: "Bengali-Assamese",
    sample: "অ আ ক",
    fallback: "'Noto Sans Bengali', sans-serif",
    fonts: bengaliFonts,
  }),
  language({
    id: "telugu",
    label: "Telugu",
    nativeLabel: "తెలుగు",
    htmlLang: "te",
    script: "Telugu",
    sample: "అ ఆ క",
    fallback: "'Noto Sans Telugu', sans-serif",
    fonts: teluguFonts,
  }),
  language({
    id: "tamil",
    label: "Tamil",
    nativeLabel: "தமிழ்",
    htmlLang: "ta",
    script: "Tamil",
    sample: "அ ஆ க",
    fallback: "'Noto Sans Tamil', sans-serif",
    fonts: tamilFonts,
  }),
  language({
    id: "malayalam",
    label: "Malayalam",
    nativeLabel: "മലയാളം",
    htmlLang: "ml",
    script: "Malayalam",
    sample: "അ ആ ക",
    fallback: "'Noto Sans Malayalam', sans-serif",
    fonts: malayalamFonts,
  }),
  language({
    id: "kannada",
    label: "Kannada",
    nativeLabel: "ಕನ್ನಡ",
    htmlLang: "kn",
    script: "Kannada",
    sample: "ಅ ಆ ಕ",
    fallback: "'Noto Sans Kannada', sans-serif",
    fonts: kannadaFonts,
  }),
  language({
    id: "gujarati",
    label: "Gujarati",
    nativeLabel: "ગુજરાતી",
    htmlLang: "gu",
    script: "Gujarati",
    sample: "અ આ ક",
    fallback: "'Noto Sans Gujarati', sans-serif",
    fonts: gujaratiFonts,
  }),
  language({
    id: "punjabi",
    label: "Punjabi",
    nativeLabel: "ਪੰਜਾਬੀ",
    htmlLang: "pa-Guru",
    script: "Gurmukhi",
    sample: "ਅ ਆ ਕ",
    fallback: "'Noto Sans Gurmukhi', sans-serif",
    fonts: gurmukhiFonts,
  }),
  language({
    id: "odia",
    label: "Odia",
    nativeLabel: "ଓଡ଼ିଆ",
    htmlLang: "or",
    script: "Odia",
    sample: "ଅ ଆ କ",
    fallback: "'Noto Sans Oriya', sans-serif",
    fonts: odiaFonts,
  }),
  language({
    id: "urdu",
    label: "Urdu",
    nativeLabel: "اردو",
    htmlLang: "ur",
    script: "Arabic Nastaliq",
    sample: "ا ب پ",
    dir: "rtl",
    fallback: "'Noto Nastaliq Urdu', 'Noto Naskh Arabic', serif",
    fonts: urduFonts,
  }),
];

export function getCoverLanguage(
  languageId: string | null | undefined,
): CoverTextLanguage {
  return (
    COVER_TEXT_LANGUAGES.find((entry) => entry.id === languageId) ||
    COVER_TEXT_LANGUAGES[0]
  );
}

export function getCoverFontsForLanguage(
  languageId: string | null | undefined,
): CoverFontOption[] {
  return getCoverLanguage(languageId).fonts;
}

export function getCoverFontOption(
  fontName: string | null | undefined,
  languageId: string | null | undefined,
): CoverFontOption | undefined {
  return getCoverFontsForLanguage(languageId).find(
    (font) => font.name === fontName,
  );
}

export function normalizeCoverFontForLanguage(
  fontName: string | null | undefined,
  languageId: string | null | undefined,
): string {
  return (
    getCoverFontOption(fontName, languageId)?.name ||
    getCoverFontsForLanguage(languageId)[0]?.name ||
    "Inter"
  );
}

export function normalizeCoverFontWeight(weight: unknown, fallback: number) {
  return COVER_FONT_WEIGHTS.some((entry) => entry.value === weight)
    ? (weight as number)
    : fallback;
}

export function fontFamilyForCoverText(
  fontName: string | null | undefined,
  languageId: string | null | undefined,
): string | undefined {
  if (!fontName) return undefined;
  const languageConfig = getCoverLanguage(languageId);
  const option = getCoverFontOption(fontName, languageId);
  const fallback =
    option?.fallback ||
    (option?.classification === "serif"
      ? languageConfig.fallback.replace("sans-serif", "serif")
      : languageConfig.fallback);
  return `'${fontName}', ${fallback}`;
}

export function buildCoverGoogleFontsHref(
  families: Array<string | null | undefined>,
): string | null {
  const uniqueFamilies = Array.from(
    new Set(families.filter((family): family is string => Boolean(family))),
  );
  if (uniqueFamilies.length === 0) return null;
  const params = uniqueFamilies
    .map(
      (family) =>
        `family=${encodeURIComponent(family).replace(/%20/g, "+")}:wght@400;500;600;700`,
    )
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
