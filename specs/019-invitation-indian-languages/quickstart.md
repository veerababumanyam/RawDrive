# Quickstart: Indian Language Support for Invitations

**Feature**: 019-invitation-indian-languages
**Date**: 2026-01-02

## Overview

This guide helps you get started with implementing Indian language support for digital invitations in RawDrive.

## Prerequisites

1. RawDrive development environment running (`npm run dev:all`)
2. Access to `frontend/` and `backend/` codebases
3. Understanding of existing invitation creation flow

## Quick Implementation Checklist

### Step 1: Update AI Text Generator (15 min)

**File**: `frontend/src/components/features/invitations/AITextGenerator.tsx`

Replace hardcoded `languageOptions` with:

```typescript
import { SUPPORTED_LANGUAGES } from '@/i18n/config';

// Replace lines 89-97 with:
const languageOptions = SUPPORTED_LANGUAGES.map(lang => ({
  value: lang.name,  // AI service expects full name, not code
  label: `${lang.nativeName} (${lang.name})`,
}));
```

### Step 2: Update Invitation Wizard (15 min)

**File**: `frontend/src/components/features/invitations/InvitationWizard.tsx`

Replace hardcoded `LANGUAGES` constant with:

```typescript
import { SUPPORTED_LANGUAGES } from '@/i18n/config';

// Replace lines 137-144 with:
const LANGUAGES = SUPPORTED_LANGUAGES.map(lang => ({
  value: lang.code,
  label: lang.name,
  nativeLabel: lang.nativeName,
  fontClass: `font-lang-${lang.code}`,
}));
```

### Step 3: Update Public Invitation Page (20 min)

**File**: `frontend/src/pages/public/PublicInvitationPage.tsx`

Replace hardcoded `LANGUAGE_CONFIG` with:

```typescript
import { SUPPORTED_LANGUAGES, getLanguageDirection } from '@/i18n/config';

// Replace lines 56-66 with:
const LANGUAGE_CONFIG: Record<string, { locale: string; fontClass: string; dir: 'ltr' | 'rtl' }> =
  Object.fromEntries(
    SUPPORTED_LANGUAGES.map(lang => [
      lang.code,
      {
        locale: `${lang.code}-IN`,
        fontClass: `font-lang-${lang.code}`,
        dir: lang.dir,
      },
    ])
  );
```

### Step 4: Add Font CSS Classes (20 min)

**File**: `frontend/src/index.css`

Add these font-face declarations and classes:

```css
/* Google Fonts import - add to top of file */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=Noto+Sans+Gujarati:wght@400;500;600;700&family=Noto+Sans+Gurmukhi:wght@400;500;600;700&family=Noto+Sans+Kannada:wght@400;500;600;700&family=Noto+Sans+Malayalam:wght@400;500;600;700&family=Noto+Sans+Oriya:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&family=Noto+Sans+Telugu:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;500;600;700&display=swap');

/* Font classes for each language */
.font-lang-en { font-family: var(--font-sans); }
.font-lang-hi, .font-lang-mr { font-family: 'Noto Sans Devanagari', sans-serif; }
.font-lang-te { font-family: 'Noto Sans Telugu', sans-serif; }
.font-lang-ta { font-family: 'Noto Sans Tamil', sans-serif; }
.font-lang-kn { font-family: 'Noto Sans Kannada', sans-serif; }
.font-lang-ml { font-family: 'Noto Sans Malayalam', sans-serif; }
.font-lang-as, .font-lang-bn { font-family: 'Noto Sans Bengali', sans-serif; }
.font-lang-gu { font-family: 'Noto Sans Gujarati', sans-serif; }
.font-lang-or { font-family: 'Noto Sans Oriya', sans-serif; }
.font-lang-pa { font-family: 'Noto Sans Gurmukhi', sans-serif; }
.font-lang-ur {
  font-family: 'Noto Nastaliq Urdu', serif;
  direction: rtl;
  text-align: right;
}
```

### Step 5: Enhance AI Prompt (10 min)

**File**: `backend/src/app/services/invitation_ai_service.py`

Update the `_build_prompt` method to add cultural context:

```python
def _build_prompt(self, event_type: str, mood: str, tone: Optional[str],
                  language: str, additional_details: Optional[str],
                  host_names: Optional[list[str]]) -> str:
    parts = [
        f"You are a professional copywriter for digital invitations.",
        f"Generate a Title and Description for a {event_type} invitation.",
        f"Language: {language}",
        f"Mood: {mood}",
    ]

    if tone:
        parts.append(f"Tone: {tone}")

    if host_names:
        parts.append(f"Hosts: {', '.join(host_names)}")

    # Add cultural context for regional languages
    if language != "English":
        parts.append(f"\nCultural guidelines:")
        parts.append(f"- Use culturally appropriate phrasing for {language} speakers")
        parts.append(f"- For formal events, use respectful honorifics common in {language} culture")
        parts.append(f"- The description should feel warm and inviting in the native style")

    if additional_details:
        parts.append(f"Additional details: {additional_details}")

    parts.append(
        "\nOutput must be a valid JSON object with keys 'title' and 'description'."
        "\nDo not include markdown formatting or code blocks."
        "\nThe title should be catchy and short."
        "\nThe description should be warm and inviting, around 2-3 sentences."
    )

    return "\n".join(parts)
```

## Testing

### Manual Testing Checklist

1. **AI Generator**:
   - [ ] Open AI text generator modal
   - [ ] Verify all 12 Indian languages appear in dropdown
   - [ ] Generate content in Telugu - verify Telugu script output
   - [ ] Generate content in Urdu - verify RTL output

2. **Invitation Wizard**:
   - [ ] Verify language dropdown shows all languages with native names
   - [ ] Select a language and complete wizard
   - [ ] Verify language is saved with invitation

3. **Public Invitation Page**:
   - [ ] Create invitation in Hindi
   - [ ] Open public link
   - [ ] Verify Hindi font renders correctly
   - [ ] Test Urdu for RTL layout

### Automated Tests

```bash
# Frontend tests
cd frontend && npm test -- --grep "language"

# Backend tests
cd backend && pytest tests/unit/test_invitation_ai_service.py -v
```

## Troubleshooting

### Fonts Not Loading

1. Check browser DevTools Network tab for font requests
2. Verify Google Fonts URL is accessible
3. Check CSS class is applied: `font-lang-{code}`

### AI Returns English Instead of Regional Language

1. Verify `language` parameter is passed correctly to backend
2. Check backend logs for the prompt being sent to Gemini
3. Verify Gemini API supports the language (it should - all 12 are supported)

### RTL Layout Issues

1. Verify `dir="rtl"` attribute is set on container
2. Check for hardcoded `text-left` or `margin-left` classes
3. Use CSS logical properties (`margin-inline-start` instead of `margin-left`)

## Resources

- [SUPPORTED_LANGUAGES](../../../frontend/src/i18n/config.ts) - Centralized language configuration
- [Google Noto Fonts](https://fonts.google.com/noto) - Font families used
- [Gemini Language Support](https://ai.google.dev/gemini-api/docs/models/gemini) - AI model capabilities
