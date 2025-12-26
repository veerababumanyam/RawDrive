/**
 * i18n Configuration
 *
 * Initializes internationalization with lazy loading of locale bundles,
 * browser language detection, and fallback to English.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';

// Supported languages with RTL info
export const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', dir: 'ltr' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', dir: 'ltr' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', dir: 'ltr' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', dir: 'ltr' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', dir: 'ltr' },
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', dir: 'ltr' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', dir: 'ltr' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', dir: 'ltr' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', dir: 'ltr' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', dir: 'ltr' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', dir: 'ltr' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', dir: 'rtl' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Get language direction
export function getLanguageDirection(lang: string): 'ltr' | 'rtl' {
    const language = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
    return language?.dir ?? 'ltr';
}

// Namespaces for translations
export const TRANSLATION_NAMESPACES = [
    'common',
    'auth',
    'dashboard',
    'gallery',
    'settings',
] as const;

export type TranslationNamespace = (typeof TRANSLATION_NAMESPACES)[number];

// Initialize i18next
i18n
    .use(HttpBackend) // Load translations via HTTP
    .use(LanguageDetector) // Detect user language
    .use(initReactI18next) // React bindings
    .init({
        // Fallback language
        fallbackLng: 'en',

        // Default namespace - only load 'common' upfront
        // Other namespaces will be loaded on-demand when components use them
        defaultNS: 'common',
        ns: ['common'],

        // Enable lazy loading - load namespaces only when needed
        partialBundledLanguages: true,

        // Load backend options
        backend: {
            loadPath: '/locales/{{lng}}/{{ns}}.json',
        },

        // Detection options
        detection: {
            // Order of detection methods
            order: ['localStorage', 'navigator', 'htmlTag'],
            // Cache user language preference
            caches: ['localStorage'],
            // localStorage key
            lookupLocalStorage: 'rawdrive_language',
        },

        // Strip regional codes (en-IN → en, es-MX → es)
        // Avoids needing separate folders for each region variant
        load: 'languageOnly',

        // Debug mode in development
        debug: import.meta.env.DEV,

        // Interpolation options
        interpolation: {
            escapeValue: false, // React already handles escaping
        },

        // React-specific options
        react: {
            useSuspense: true, // Enable Suspense for lazy loading
        },
    });

// Update document direction when language changes
i18n.on('languageChanged', (lng) => {
    const dir = getLanguageDirection(lng);
    document.documentElement.dir = dir;
    document.documentElement.lang = lng;
});

export default i18n;
