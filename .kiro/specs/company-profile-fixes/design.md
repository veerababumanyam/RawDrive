# Design Document: Company Profile Critical Fixes

## Overview

This design document provides technical specifications for fixing critical issues in the Company Profile feature. The fixes address:

1. **Public Slug Editor UX** - Improved spacing, visual hierarchy, and user-friendly editing experience
2. **QR Code URL Correction** - Proper redirection to rawdrive.ai instead of unknown sites
3. **vCard Accuracy** - Complete and correctly formatted contact information export
4. **URL Copy/Share** - Easy sharing functionality with clipboard and Web Share API
5. **Public Profile Actions** - QR code and vCard buttons visible on public profiles
6. **Secondary Contacts** - Support for multiple emails and phones with visibility controls
7. **Theme Management** - Proper theme preview and selection in the profile editor

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Profile Editor   │  │ Public Profile   │                │
│  │ - Slug Editor    │  │ - QR/vCard       │                │
│  │ - Theme Selector │  │ - Contact Info   │                │
│  │ - Visibility     │  │ - Theme Display  │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                            │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Profile Service  │  │ Export Service   │                │
│  │ - CRUD Ops       │  │ - vCard Gen      │                │
│  │ - Validation     │  │ - QR Code Gen    │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                           │
│  ┌──────────────────────────────────────────┐              │
│  │ company_profiles (extended)              │              │
│  │ - secondary_emails: JSONB                │              │
│  │ - secondary_phones: JSONB                │              │
│  │ - theme_id: UUID                         │              │
│  │ - theme_customization: JSONB             │              │
│  └──────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Enhanced Public Slug Editor Component

**Location**: `frontend/src/components/features/settings/CompanyProfileForm.tsx`

**Current Issues**:
- Insufficient space for slug input
- Confusing inline edit mode
- Poor visual hierarchy
- Unclear validation feedback

**Design Solution**:
```typescript
interface SlugEditorProps {
  value: string;
  isExisting: boolean;
  onChange: (value: string) => void;
  onValidate: (slug: string) => Promise<ValidationResult>;
}

interface ValidationResult {
  status: 'idle' | 'checking' | 'available' | 'taken';
  message?: string;
}
```

**UI Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Public Slug                                          [Edit] │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ rawdrive.ai/p/  your-company-slug                       ││
│ └─────────────────────────────────────────────────────────┘│
│ Your public profile URL                                     │
│                                                    [Copy URL]│
└─────────────────────────────────────────────────────────────┘
```

### 2. QR Code Generation Service

**Location**: `backend/src/services/qrCodeService.ts` (new)

**Current Issue**: QR codes redirect to unknown sites

**Design Solution**:
```typescript
interface QRCodeService {
  generateQRCode(slug: string): Promise<Buffer>;
  getQRCodeUrl(slug: string): string;
}

// Implementation
class QRCodeServiceImpl implements QRCodeService {
  private readonly baseUrl: string;
  
  constructor() {
    this.baseUrl = process.env.PUBLIC_URL || 'https://rawdrive.ai';
  }
  
  async generateQRCode(slug: string): Promise<Buffer> {
    const url = `${this.baseUrl}/p/${slug}`;
    // Use qrcode library to generate QR code
    return qrcode.toBuffer(url, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 512,
      margin: 2
    });
  }
}
```

### 3. vCard Generation Service

**Location**: `backend/src/services/vCardService.ts` (new)

**Current Issue**: vCard exports incomplete or incorrect data

**Design Solution**:
```typescript
interface VCardService {
  generateVCard(profile: CompanyProfile): string;
}

// vCard 3.0 format
class VCardServiceImpl implements VCardService {
  generateVCard(profile: CompanyProfile): string {
    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${profile.name}`,
      `ORG:${profile.name}`,
    ];
    
    // Add visible fields only
    if (profile.company_visibility.email && profile.email) {
      lines.push(`EMAIL;TYPE=INTERNET:${profile.email}`);
    }
    
    if (profile.company_visibility.phone && profile.phone) {
      lines.push(`TEL;TYPE=WORK,VOICE:${profile.phone}`);
    }
    
    // ... more fields
    
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }
}
```

## Data Models

### Extended Company Profile Schema

```sql
-- Add secondary contact fields
ALTER TABLE company_profiles 
ADD COLUMN IF NOT EXISTS secondary_emails JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS secondary_phones JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS theme_id UUID REFERENCES themes(theme_id),
ADD COLUMN IF NOT EXISTS theme_customization JSONB DEFAULT '{}';

-- Add visibility fields for secondary contacts
ALTER TABLE company_profiles
ADD COLUMN IF NOT EXISTS visibility_secondary_email_1 BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visibility_secondary_email_2 BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visibility_secondary_phone_1 BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visibility_secondary_phone_2 BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visibility_qr_code BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS visibility_vcard BOOLEAN DEFAULT true;
```

### TypeScript Interfaces

```typescript
interface SecondaryContact {
  value: string;
  label?: string;
  visible: boolean;
}

interface ExtendedCompanyProfile extends CompanyProfile {
  secondary_emails: SecondaryContact[];
  secondary_phones: SecondaryContact[];
  theme_id?: string;
  theme_customization?: ThemeCustomization;
}

interface ThemeCustomization {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  fonts?: {
    heading?: string;
    body?: string;
  };
  layout?: {
    spacing?: 'compact' | 'normal' | 'spacious';
  };
}
```

## API Endpoints

### New Endpoints

```typescript
// QR Code
GET /api/v1/public/profiles/:slug/qr-code
  Response: image/png (QR code image)

// vCard
GET /api/v1/public/profiles/:slug/vcard
  Response: text/vcard (vCard file)

// Theme Management
GET /api/v1/themes
  Response: Theme[]

PATCH /api/v1/workspaces/:workspace_id/profile/theme
  Body: { theme_id: string, customization?: ThemeCustomization }
  Response: CompanyProfile
```

### Modified Endpoints

```typescript
// Profile Update - now supports secondary contacts
PATCH /api/v1/workspaces/:workspace_id/profile
  Body: {
    ...existing fields,
    secondary_emails?: SecondaryContact[],
    secondary_phones?: SecondaryContact[]
  }
```

## Implementation Details

### 1. Slug Editor Improvements

**File**: `frontend/src/components/features/settings/CompanyProfileForm.tsx`

**Changes**:
1. Increase input field height to 48px minimum
2. Add prominent URL preview above input
3. Improve edit mode with clear buttons
4. Add copy URL button with clipboard API
5. Better validation feedback positioning

### 2. QR Code Fix

**Files**: 
- `backend/src/services/qrCodeService.ts` (new)
- `backend/src/routes/v1/public.ts` (update)

**Changes**:
1. Create QRCodeService with proper URL generation
2. Use environment variable for base URL
3. Add endpoint for QR code generation
4. Update frontend to use correct endpoint

### 3. vCard Fix

**Files**:
- `backend/src/services/vCardService.ts` (new)
- `backend/src/routes/v1/public.ts` (update)

**Changes**:
1. Create VCardService with vCard 3.0 format
2. Include all visible fields
3. Format phone numbers correctly
4. Add logo as PHOTO field
5. Test with major contact apps

### 4. Copy/Share Functionality

**File**: `frontend/src/components/features/settings/CompanyProfileForm.tsx`

**Changes**:
1. Add "Copy URL" button with clipboard API
2. Add "Share" button with Web Share API
3. Implement fallbacks for unsupported browsers
4. Add success toast notifications

### 5. Public Profile Actions

**File**: `frontend/src/components/features/profile/ProfileCard.tsx`

**Changes**:
1. Add "Save Contact" button
2. Add "QR Code" button
3. Implement QR code modal
4. Add visibility toggles in editor
5. Style buttons consistently with theme

### 6. Secondary Contacts

**Files**:
- `frontend/src/components/features/settings/CompanyProfileForm.tsx`
- `backend/src/services/companyProfileService.ts`

**Changes**:
1. Add UI for secondary email/phone inputs
2. Add individual visibility toggles
3. Update backend schema and validation
4. Include in vCard exports

### 7. Theme Management

**Files**:
- `frontend/src/components/features/settings/ThemeSelector.tsx` (new)
- `backend/src/services/themeService.ts` (new)

**Changes**:
1. Create theme selector component
2. Implement theme preview
3. Add theme customization controls
4. Save theme selection automatically

## Testing Strategy

### Unit Tests
- Slug validation logic
- QR code URL generation
- vCard formatting
- Clipboard API wrapper
- Theme customization logic

### Integration Tests
- Profile CRUD with secondary contacts
- QR code generation endpoint
- vCard generation endpoint
- Theme application

### E2E Tests
- Complete profile creation flow
- QR code scan and redirect
- vCard download and import
- Theme selection and preview
- Copy/share functionality

## Security Considerations

1. **Input Validation**: Validate all user inputs (slug, emails, phones, URLs)
2. **Rate Limiting**: Limit QR code and vCard generation requests
3. **CORS**: Proper CORS headers for public endpoints
4. **XSS Prevention**: Sanitize all user-generated content
5. **CSRF Protection**: CSRF tokens for state-changing operations

## Performance Optimization

1. **Caching**: Cache generated QR codes and vCards for 1 hour
2. **Lazy Loading**: Load theme thumbnails on demand
3. **Debouncing**: Debounce slug validation API calls (500ms)
4. **Image Optimization**: Optimize QR code image size
5. **CDN**: Serve static theme assets from CDN

## Deployment Plan

### Phase 1: Critical Fixes (Week 1)
- Fix QR code URL redirection
- Fix vCard export accuracy
- Improve slug editor UX
- Add copy/share functionality

### Phase 2: Enhanced Features (Week 2)
- Add secondary contacts support
- Add QR/vCard buttons to public profile
- Implement theme selector

### Phase 3: Polish and Testing (Week 3)
- Comprehensive testing
- Performance optimization
- Documentation
- User acceptance testing

## Rollback Strategy

1. Feature flags for new functionality
2. Database migrations with rollback scripts
3. Gradual rollout (10% → 50% → 100%)
4. Monitoring and alerting for errors
5. Quick rollback procedure documented

## Success Metrics

1. QR code scan success rate > 95%
2. vCard import success rate > 90%
3. Slug editor task completion time < 30 seconds
4. Theme selection engagement > 40%
5. Copy/share feature usage > 20% of profile edits
6. Zero critical bugs in production
7. User satisfaction score > 4.5/5

## Open Questions

1. Should we support custom QR code styling (colors, logos)?
2. Should we provide QR code analytics (scan location, device type)?
3. Should we support vCard 4.0 format in addition to 3.0?
4. Should we allow bulk theme application across multiple profiles?
5. Should we provide theme marketplace for premium themes?

## Future Enhancements

1. **Advanced QR Codes**: Custom styling, analytics, dynamic QR codes
2. **vCard Plus**: Enhanced vCard with social media, photos, videos
3. **Theme Builder**: Visual theme builder for custom themes
4. **A/B Testing**: Test different themes for conversion optimization
5. **White Label**: Custom branding for enterprise customers
