# Data Model: Indian Language Support for Invitations

**Feature**: 019-invitation-indian-languages
**Date**: 2026-01-02

## Overview

This feature requires **no database schema changes**. The existing invitation and template tables already have the necessary language fields. This document defines the TypeScript and Python types used in the implementation.

## Existing Schema (No Changes Required)

### invitations table

```sql
-- Existing columns (already in schema)
primary_language VARCHAR(10) DEFAULT 'en',       -- ISO 639-1 code
secondary_language VARCHAR(10) DEFAULT NULL,     -- Optional bilingual support
content_i18n JSONB DEFAULT '{}'                  -- Localized content by language code
```

### invitation_templates table

```sql
-- Existing columns (already in schema)
supported_languages VARCHAR(10)[] DEFAULT '{"en"}',  -- Array of supported language codes
content_i18n JSONB DEFAULT '{}'                       -- Pre-translated template content
```

## Type Definitions

### Frontend Types (TypeScript)

#### Language Configuration

```typescript
// Source: frontend/src/i18n/config.ts (EXISTS)
export interface SupportedLanguage {
  code: string;        // ISO 639-1 code (e.g., 'te')
  name: string;        // English name (e.g., 'Telugu')
  nativeName: string;  // Native script (e.g., 'తెలుగు')
  dir: 'ltr' | 'rtl';  // Text direction
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
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
];

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]['code'];
```

#### Language Configuration for Public Pages

```typescript
// NEW: Extended language config for rendering
export interface LanguageRenderConfig {
  code: LanguageCode;
  locale: string;          // BCP 47 locale tag (e.g., 'te-IN')
  fontClass: string;       // CSS class for font (e.g., 'font-lang-te')
  dateScript?: string;     // Unicode script name for date formatting
  dir: 'ltr' | 'rtl';
}

export const LANGUAGE_RENDER_CONFIG: Record<LanguageCode, LanguageRenderConfig> = {
  en: { code: 'en', locale: 'en-IN', fontClass: 'font-lang-en', dir: 'ltr' },
  hi: { code: 'hi', locale: 'hi-IN', fontClass: 'font-lang-hi', dateScript: 'Deva', dir: 'ltr' },
  te: { code: 'te', locale: 'te-IN', fontClass: 'font-lang-te', dateScript: 'Telu', dir: 'ltr' },
  ta: { code: 'ta', locale: 'ta-IN', fontClass: 'font-lang-ta', dateScript: 'Taml', dir: 'ltr' },
  kn: { code: 'kn', locale: 'kn-IN', fontClass: 'font-lang-kn', dateScript: 'Knda', dir: 'ltr' },
  ml: { code: 'ml', locale: 'ml-IN', fontClass: 'font-lang-ml', dateScript: 'Mlym', dir: 'ltr' },
  as: { code: 'as', locale: 'as-IN', fontClass: 'font-lang-as', dateScript: 'Beng', dir: 'ltr' },
  bn: { code: 'bn', locale: 'bn-IN', fontClass: 'font-lang-bn', dateScript: 'Beng', dir: 'ltr' },
  gu: { code: 'gu', locale: 'gu-IN', fontClass: 'font-lang-gu', dateScript: 'Gujr', dir: 'ltr' },
  mr: { code: 'mr', locale: 'mr-IN', fontClass: 'font-lang-mr', dateScript: 'Deva', dir: 'ltr' },
  or: { code: 'or', locale: 'or-IN', fontClass: 'font-lang-or', dateScript: 'Orya', dir: 'ltr' },
  pa: { code: 'pa', locale: 'pa-IN', fontClass: 'font-lang-pa', dateScript: 'Guru', dir: 'ltr' },
  ur: { code: 'ur', locale: 'ur-PK', fontClass: 'font-lang-ur', dateScript: 'Arab', dir: 'rtl' },
};
```

### Backend Types (Python)

```python
# Source: backend/src/app/api/invitation_schemas.py
from enum import Enum
from typing import Literal

class SupportedLanguage(str, Enum):
    """Supported languages for invitation content."""
    ENGLISH = "en"
    HINDI = "hi"
    TELUGU = "te"
    TAMIL = "ta"
    KANNADA = "kn"
    MALAYALAM = "ml"
    ASSAMESE = "as"
    BENGALI = "bn"
    GUJARATI = "gu"
    MARATHI = "mr"
    ODIA = "or"
    PUNJABI = "pa"
    URDU = "ur"

# Language direction mapping
LANGUAGE_DIRECTION: dict[str, Literal["ltr", "rtl"]] = {
    "en": "ltr", "hi": "ltr", "te": "ltr", "ta": "ltr",
    "kn": "ltr", "ml": "ltr", "as": "ltr", "bn": "ltr",
    "gu": "ltr", "mr": "ltr", "or": "ltr", "pa": "ltr",
    "ur": "rtl",
}
```

## CSS Font Classes (New Additions)

```css
/* frontend/src/index.css - Add these font-face declarations */

/* Shared fonts (Devanagari used by Hindi, Marathi) */
.font-lang-hi, .font-lang-mr {
  font-family: 'Noto Sans Devanagari', sans-serif;
}

/* Bengali script (Bengali, Assamese) */
.font-lang-bn, .font-lang-as {
  font-family: 'Noto Sans Bengali', sans-serif;
}

/* Individual scripts */
.font-lang-te { font-family: 'Noto Sans Telugu', sans-serif; }
.font-lang-ta { font-family: 'Noto Sans Tamil', sans-serif; }
.font-lang-kn { font-family: 'Noto Sans Kannada', sans-serif; }
.font-lang-ml { font-family: 'Noto Sans Malayalam', sans-serif; }
.font-lang-gu { font-family: 'Noto Sans Gujarati', sans-serif; }
.font-lang-or { font-family: 'Noto Sans Oriya', sans-serif; }
.font-lang-pa { font-family: 'Noto Sans Gurmukhi', sans-serif; }
.font-lang-ur { font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; }
.font-lang-en { font-family: var(--font-sans); }
```

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                        Invitation                           │
├─────────────────────────────────────────────────────────────┤
│ primary_language: LanguageCode (FK → SUPPORTED_LANGUAGES)   │
│ secondary_language: LanguageCode | null                     │
│ content_i18n: Record<LanguageCode, LocalizedContent>        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ uses template
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   InvitationTemplate                        │
├─────────────────────────────────────────────────────────────┤
│ supported_languages: LanguageCode[]                         │
│ content_i18n: Record<LanguageCode, TemplateContent>         │
└─────────────────────────────────────────────────────────────┘
```

## Validation Rules

1. **Language Code Validation**: All language codes must exist in `SUPPORTED_LANGUAGES`
2. **Primary Language Required**: `primary_language` cannot be null
3. **Secondary Language Optional**: `secondary_language` must be different from `primary_language` if set
4. **Template Compatibility**: If template is selected, invitation language should be in template's `supported_languages` (warning, not error)
