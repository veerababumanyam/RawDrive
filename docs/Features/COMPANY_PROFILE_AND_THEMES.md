# Company Profile and Theme Management

> Last Updated: December 2024
> Version: 2.0.0

## Overview

This document covers the Company Profile feature enhancements including QR codes, vCards, secondary contacts, and theme management system.

## Table of Contents

1. [Features](#features)
2. [API Endpoints](#api-endpoints)
3. [Components](#components)
4. [Theme System](#theme-system)
5. [Accessibility](#accessibility)
6. [Testing](#testing)
7. [Configuration](#configuration)

---

## Features

### 1. QR Code Generation

High-quality QR codes that link to public profiles.

**Features:**
- Error correction level H (30% recovery)
- Minimum 512x512 pixels
- PNG format with transparent background
- Rate limited to 100 requests/minute per IP

**Usage:**
```
GET /api/v1/public/profiles/{slug}/qr-code
```

**Response:** PNG image stream

### 2. vCard Generation

RFC 6350 compliant vCard 3.0 format.

**Features:**
- E.164 phone number formatting
- Logo as BASE64 PHOTO field
- Secondary contacts with TYPE labels
- UTF-8 encoding for international characters

**Usage:**
```
GET /api/v1/public/profiles/{slug}/vcard
```

**Response:** VCF file download

### 3. Secondary Contacts

Support for up to 2 additional email addresses and phone numbers.

**Database Schema:**
```typescript
interface SecondaryContact {
  value: string;       // Email or phone
  label?: string;      // Optional label (e.g., "Sales", "Support")
}

// Company Profile fields
secondary_emails: SecondaryContact[];  // Max 2
secondary_phones: SecondaryContact[];  // Max 2
```

**Visibility Controls:**
- Individual toggle for each secondary contact
- Visibility key format: `secondary_email_1`, `secondary_phone_2`

### 4. Theme System

Complete theme customization for public profiles.

#### Theme Categories
- **Minimal**: Clean, whitespace-focused designs
- **Bold**: Strong colors and typography
- **Elegant**: Sophisticated, refined aesthetics
- **Modern**: Contemporary, sleek layouts
- **Creative**: Artistic, unique designs

#### Theme Customization
- **Colors**: Primary, secondary, accent, background, text
- **Fonts**: Heading font, body font
- **Layout**: Spacing (compact/comfortable/spacious), hero style, section layout

---

## API Endpoints

### Public Profile Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/public/profiles/{slug}` | Get public profile data |
| GET | `/api/v1/public/profiles/{slug}/qr-code` | Download QR code |
| GET | `/api/v1/public/profiles/{slug}/vcard` | Download vCard |

### Profile Management Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workspaces/{id}/profile` | Get workspace profile |
| PUT | `/api/v1/workspaces/{id}/profile` | Update profile |
| POST | `/api/v1/workspaces/{id}/profile/logo` | Upload logo |

### Theme Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/themes` | List all themes |
| GET | `/api/v1/themes/{id}` | Get theme details |
| POST | `/api/v1/workspaces/{id}/profile/theme` | Apply theme |
| PATCH | `/api/v1/workspaces/{id}/profile/customization/colors` | Update colors |
| PATCH | `/api/v1/workspaces/{id}/profile/customization/fonts` | Update fonts |
| PATCH | `/api/v1/workspaces/{id}/profile/customization/layout` | Update layout |

---

## Components

### Frontend Components

| Component | Path | Description |
|-----------|------|-------------|
| `CompanyProfileForm` | `settings/CompanyProfileForm.tsx` | Main profile editor |
| `CompanyProfilePreview` | `settings/CompanyProfilePreview.tsx` | Live preview with device frames |
| `ProfileCard` | `profile/ProfileCard.tsx` | Shared profile card display |
| `PublicProfileView` | `profile/PublicProfileView.tsx` | Public page view |
| `ThemeSelector` | `settings/ThemeSelector.tsx` | Theme selection grid |
| `ThemeCustomization` | `settings/ThemeCustomization.tsx` | Color/font/layout editor |
| `UndoRedoControls` | `settings/UndoRedoControls.tsx` | Undo/redo buttons |
| `ThemeHelpTooltip` | `settings/ThemeHelpTooltip.tsx` | Contextual help |

### Hooks

| Hook | Path | Description |
|------|------|-------------|
| `useThemeUndoRedo` | `hooks/useThemeUndoRedo.ts` | History management |

---

## Theme System

### Default Themes

| Name | Category | Description |
|------|----------|-------------|
| Classic Light | Minimal | Clean light theme |
| Modern Dark | Modern | Sleek dark theme |
| Elegant Gold | Elegant | Sophisticated gold accents |
| Bold Vibrant | Bold | Strong colors |
| Creative Gradient | Creative | Gradient backgrounds |

### Theme Data Model

```typescript
interface Theme {
  theme_id: string;
  name: string;
  description: string;
  category: 'minimal' | 'bold' | 'elegant' | 'modern' | 'creative';
  is_popular: boolean;
  is_premium: boolean;
  colors: ThemeColors;
  fonts?: ThemeFonts;
  layout?: ThemeLayout;
  thumbnail_url?: string;
}

interface ThemeColors {
  primary: string;     // Main brand color
  secondary: string;   // Supporting color
  accent: string;      // Highlight color
  background: string;  // Page background
  text: string;        // Main text color
}

interface ThemeFonts {
  heading: string;     // Font for headings
  body: string;        // Font for body text
}

interface ThemeLayout {
  spacing: 'compact' | 'comfortable' | 'spacious';
  hero_style: 'card' | 'full_bleed';
  section_layout: 'single' | 'two_column';
}
```

### Customization Persistence

Customizations are stored per-workspace:

```typescript
interface ThemeCustomization {
  customization_id: string;
  workspace_id: string;
  theme_id: string;
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
  layout?: Partial<ThemeLayout>;
  created_at: string;
  updated_at: string;
}
```

### WCAG Contrast Validation

The theme customization UI includes real-time contrast checking:

- **AA Compliance**: 4.5:1 ratio for normal text
- **AAA Compliance**: 7:1 ratio for enhanced accessibility
- Visual warnings for non-compliant color combinations
- Suggested alternative colors

---

## Accessibility

### WCAG 2.1 AA Compliance

All components meet WCAG 2.1 Level AA standards:

| Requirement | Implementation |
|-------------|----------------|
| Keyboard Navigation | Full support for Tab, Enter, Escape |
| Focus Indicators | Visible focus rings on all interactive elements |
| Color Contrast | 4.5:1 minimum for text, 3:1 for UI components |
| Screen Readers | ARIA labels, roles, and live regions |
| Zoom Support | Functional at 200% browser zoom |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Tab | Navigate forward |
| Shift+Tab | Navigate backward |
| Enter | Activate button/link |
| Escape | Close modal/tooltip |
| Arrow keys | Navigate within groups |

### Screen Reader Support

- All inputs have associated labels
- Dynamic content uses `aria-live` regions
- Status changes are announced
- Tooltips are properly associated

---

## Testing

### Unit Tests

| Test File | Coverage |
|-----------|----------|
| `ThemeSelector.test.tsx` | Component rendering, filtering, selection |
| `ThemeCustomization.test.tsx` | Color pickers, fonts, layout |
| `UndoRedoControls.test.tsx` | Button states, interactions |
| `ThemeHelpTooltip.test.tsx` | Tooltips, tips panel |
| `useThemeUndoRedo.test.ts` | History management, auto-save |

### Accessibility Tests

| Test File | Coverage |
|-----------|----------|
| `accessibility.test.tsx` | axe-core, keyboard nav, ARIA |

### Performance Tests

| Test File | Coverage |
|-----------|----------|
| `performance.test.tsx` | Render time, memory, bundle size |

### Running Tests

```bash
# Run all theme-related tests
cd frontend && npm test -- --grep "Theme"

# Run accessibility tests
cd frontend && npm test -- --grep "Accessibility"

# Run with coverage
cd frontend && npm test -- --coverage
```

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_URL` | Base URL for public profiles | `https://rawdrive.ai` |
| `VITE_PUBLIC_URL` | Frontend public URL | `https://rawdrive.ai` |

### Backend Configuration

```python
# settings.py
class Settings(BaseSettings):
    public_url: str = "https://rawdrive.ai"
    qr_code_error_correction: str = "H"
    qr_code_box_size: int = 10
    qr_code_border: int = 4
```

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| QR Code | 100 | 1 minute |
| vCard | 100 | 1 minute |
| Theme API | 60 | 1 minute |

---

## Migration Guide

### From v1.x to v2.0

1. **Database Migration**: Run migration 0017 and 0018
   ```bash
   cd backend && alembic upgrade head
   ```

2. **Environment Variables**: Add `PUBLIC_URL` to `.env`
   ```env
   PUBLIC_URL=https://rawdrive.ai
   ```

3. **Frontend Update**: Theme components auto-load

4. **Verify**: Test QR code scanning with mobile devices

---

## Troubleshooting

### QR Codes Not Scanning

- Ensure `PUBLIC_URL` is correctly configured
- Verify QR code size is at least 512x512
- Check error correction level is 'H'

### vCard Import Issues

- Phone numbers must be valid E.164 format
- Logo must be accessible via public URL
- Check UTF-8 encoding for special characters

### Theme Not Applying

- Clear browser cache
- Verify theme is seeded in database
- Check customization is saved (no validation errors)

---

## Related Documentation

- [PHOTOGRAPHER_PUBLIC_PROFILE.md](PHOTOGRAPHER_PUBLIC_PROFILE.md) - Base profile features
- [AUTHENTICATION_AND_SECURITY.md](AUTHENTICATION_AND_SECURITY.md) - Auth requirements
- [API_AND_INTEGRATIONS.md](API_AND_INTEGRATIONS.md) - API standards
