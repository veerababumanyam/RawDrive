# Research: Indian Language Support for Invitations

**Feature**: 019-invitation-indian-languages
**Date**: 2026-01-02

## Research Questions

### 1. Font Support for Indic Scripts

**Decision**: Use Google Noto fonts family for all Indic scripts

**Rationale**:
- Noto fonts provide comprehensive Unicode coverage for all 12 scripts
- Free, open-source, and optimized for web
- Consistent visual style across scripts
- Well-maintained with regular updates

**Font Mapping**:

| Language | Script | Font Family |
|----------|--------|-------------|
| Hindi | Devanagari | Noto Sans Devanagari |
| Telugu | Telugu | Noto Sans Telugu |
| Tamil | Tamil | Noto Sans Tamil |
| Kannada | Kannada | Noto Sans Kannada |
| Malayalam | Malayalam | Noto Sans Malayalam |
| Assamese | Bengali (Assamese variant) | Noto Sans Bengali |
| Bengali | Bengali | Noto Sans Bengali |
| Gujarati | Gujarati | Noto Sans Gujarati |
| Marathi | Devanagari | Noto Sans Devanagari |
| Odia | Odia | Noto Sans Oriya |
| Punjabi | Gurmukhi | Noto Sans Gurmukhi |
| Urdu | Nastaliq/Arabic | Noto Nastaliq Urdu |

**Alternatives Considered**:
- System fonts: Inconsistent rendering across platforms
- Adobe fonts: License cost, not self-hostable
- Individual font families per language: Complex management

### 2. RTL Support for Urdu

**Decision**: Use CSS `dir="rtl"` attribute and CSS logical properties

**Rationale**:
- Native browser support for RTL text direction
- CSS logical properties (margin-inline-start, etc.) handle RTL automatically
- TailwindCSS has RTL utilities (`rtl:` prefix)

**Implementation Pattern**:
```tsx
// Detect RTL from SUPPORTED_LANGUAGES
const isRTL = SUPPORTED_LANGUAGES.find(l => l.code === lang)?.dir === 'rtl';

// Apply to container
<div dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'text-right' : 'text-left'}>
  {content}
</div>
```

**Alternatives Considered**:
- CSS transforms (flip): Breaks layout, doesn't handle mixed content
- Separate RTL stylesheet: Maintenance burden, not needed for one language

### 3. AI Content Generation Quality for Regional Languages

**Decision**: Enhance prompts with cultural context; rely on Gemini's multilingual capabilities

**Rationale**:
- Gemini models support all 12 target languages natively
- Cultural context in prompts improves output quality
- No additional API costs or configuration needed

**Enhanced Prompt Template**:
```python
prompt = f"""You are a professional copywriter for digital invitations.
Generate a Title and Description for a {event_type} invitation.

Language: {language}
Mood: {mood}
{f'Tone: {tone}' if tone else ''}

Cultural guidelines:
- Use culturally appropriate phrasing for {language} speakers
- For formal events, use respectful honorifics common in {language} culture
- The description should feel warm and inviting in the native style

{f'Additional details: {additional_details}' if additional_details else ''}

Output: Valid JSON with 'title' and 'description' keys.
"""
```

**Alternatives Considered**:
- Separate translation service: Adds latency and cost
- Pre-translated templates only: Limits creativity and personalization

### 4. Language Selector Component Pattern

**Decision**: Create reusable `InvitationLanguageSelect` component

**Rationale**:
- Single source of truth for language options (imports SUPPORTED_LANGUAGES)
- Shows both English name and native script
- Handles RTL indicator for Urdu
- Reusable across wizard, AI generator, and template selector

**Component API**:
```tsx
interface InvitationLanguageSelectProps {
  value: string;              // Language code (e.g., 'te')
  onChange: (code: string) => void;
  label?: string;
  showNativeNames?: boolean;  // Show native script (default: true)
  excludeEnglish?: boolean;   // For invitation-only contexts
}
```

**Alternatives Considered**:
- Update each component individually: Violates DRY, error-prone
- Use existing LanguageSelector: That's for UI language, different purpose

### 5. Font Loading Strategy

**Decision**: Lazy load fonts per language using CSS @font-face with `font-display: swap`

**Rationale**:
- Only loads fonts when actually used
- `font-display: swap` shows fallback immediately, then swaps
- Reduces initial page load
- User only downloads fonts for languages they use

**Implementation**:
```css
/* Load via Google Fonts with text optimization */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap');

/* Or self-hosted with subset */
@font-face {
  font-family: 'Noto Sans Telugu';
  src: url('/fonts/NotoSansTelugu-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
  unicode-range: U+0C00-0C7F; /* Telugu Unicode block */
}
```

**Alternatives Considered**:
- Load all fonts upfront: ~2MB additional payload, most unused
- Use system fonts: Inconsistent, many systems lack Indic fonts

### 6. Existing Infrastructure Validation

**Decision**: The codebase already has most infrastructure in place

**Findings**:

| Component | Status | Notes |
|-----------|--------|-------|
| `SUPPORTED_LANGUAGES` | ✅ Complete | All 12 languages defined in `i18n/config.ts` |
| Invitation schema | ✅ Complete | `primary_language`, `secondary_language` fields exist |
| Template schema | ✅ Complete | `supported_languages`, `content_i18n` fields exist |
| AI service | ✅ Functional | Accepts language parameter, needs prompt enhancement |
| Font classes | ⚠️ Partial | Only 6 languages have `font-lang-*` classes |
| Component language lists | ❌ Outdated | 3 components have hardcoded incomplete lists |

**Conclusion**: Feature is primarily UI updates + font CSS additions. No database changes needed.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Font rendering issues on older browsers | Low | Medium | Fallback to system fonts |
| AI generates incorrect script | Low | High | Validate output contains expected Unicode range |
| RTL layout breaks existing styles | Medium | Medium | Test Urdu specifically; use CSS logical properties |
| Performance impact from font loading | Low | Low | Lazy loading + `font-display: swap` |

## Dependencies

1. **Google Fonts CDN** - For Noto font family (or self-host)
2. **Gemini API** - Already integrated, supports all languages
3. **No new npm packages required** - Uses existing i18next, TailwindCSS
