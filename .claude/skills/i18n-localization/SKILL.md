---
name: i18n-localization
description: "Internationalization and localization for RawDrive with i18next, supporting 13 languages including Indian regional languages and RTL (Urdu). Use this skill when adding translatable strings, creating new translation files, working with the i18n config, adding language support, handling RTL layouts, or ensuring all user-facing text uses translation keys. Also use when working with invitation templates in multiple languages. Triggers on: i18n, i18next, translation, localization, language, RTL, Hindi, Telugu, Tamil, multilingual, user-facing string, translate."
---

# Internationalization (i18n)

RawDrive supports 13 languages with i18next. All user-facing strings must use translation keys — never hardcode text.

## Supported Languages

| Code | Language | Direction |
|------|----------|-----------|
| `en` | English | LTR |
| `hi` | Hindi | LTR |
| `te` | Telugu | LTR |
| `ta` | Tamil | LTR |
| `kn` | Kannada | LTR |
| `ml` | Malayalam | LTR |
| `as` | Assamese | LTR |
| `bn` | Bengali | LTR |
| `gu` | Gujarati | LTR |
| `mr` | Marathi | LTR |
| `or` | Odia | LTR |
| `pa` | Punjabi | LTR |
| `ur` | Urdu | **RTL** |

## Configuration

Located at `frontend/src/i18n/config.ts`:
- Backend: HTTP loading from `/locales/{{lng}}/{{ns}}.json`
- Lazy loading with `partialBundledLanguages`
- Detection order: localStorage → navigator → htmlTag
- Storage key: `rawdrive_language`
- Auto RTL: Updates `document.documentElement.dir` and `lang`

## Translation Namespaces

```
common    # Shared strings (buttons, labels, errors)
auth      # Login, signup, password reset
dashboard # Dashboard page
gallery   # Gallery features
settings  # User/workspace settings
```

## Usage in Components

```typescript
import { useTranslation } from 'react-i18next';

export const GalleryHeader: React.FC = () => {
  const { t } = useTranslation('gallery');

  return (
    <div>
      <h1>{t('gallery.title')}</h1>
      <p>{t('gallery.description', { count: 42 })}</p>
      <button>{t('common:buttons.save')}</button>
    </div>
  );
};
```

## Translation File Structure

```
frontend/public/locales/
├── en/
│   ├── common.json
│   ├── auth.json
│   ├── dashboard.json
│   ├── gallery.json
│   └── settings.json
├── hi/
│   ├── common.json
│   └── ...
└── ur/     # RTL language
    ├── common.json
    └── ...
```

## Adding a New Translation Key

1. Add the key to `en/<namespace>.json` first (source of truth)
2. Add translations to other language files
3. Use in component: `t('namespace:key.path')`

```json
// en/gallery.json
{
  "gallery": {
    "create": "Create Gallery",
    "empty": "No galleries yet",
    "count": "{{count}} gallery",
    "count_plural": "{{count}} galleries"
  }
}
```

## RTL Support

For Urdu (and future RTL languages), ensure:
```typescript
// TailwindCSS RTL utilities
<div className="ml-4 rtl:mr-4 rtl:ml-0">
  <span className="text-left rtl:text-right">{t('label')}</span>
</div>

// Or use logical properties
<div className="ms-4">  {/* margin-inline-start */}
  <span className="text-start">{t('label')}</span>
</div>
```

## Rules

1. **Never hardcode user-facing strings** — always use `t()` function
2. **English is source of truth** — add keys to `en/` first
3. **Use namespace prefixes** when crossing namespaces: `t('common:buttons.cancel')`
4. **Pluralization:** Use i18next plural suffixes (`_plural`, `_0`, `_1`)
5. **Interpolation:** Use `{{variable}}` syntax, not string concatenation
6. **Date/number formatting:** Use `Intl.DateTimeFormat` and `Intl.NumberFormat` with locale
