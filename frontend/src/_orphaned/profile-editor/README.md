# Public Profile Editor

A comprehensive editor for managing photographer public profiles with visibility controls, theming, live preview, and collaboration features.

## Overview

The Public Profile Editor allows photographers to customize their public-facing profile with:
- **Visibility Controls**: Toggle visibility for individual profile fields
- **Live Preview**: Real-time preview in desktop, tablet, and phone modes
- **Theming**: 5+ pre-built themes with full customization options
- **Typography**: 20+ web fonts plus custom font upload
- **Color Palette**: Color extraction from logo, harmony suggestions, WCAG contrast checking
- **Version Control**: Automatic daily snapshots with manual versioning
- **Collaboration**: Preview sharing with password protection and approval workflows
- **Analytics**: View tracking, geographic data, and referrer analytics

## Directory Structure

```
frontend/src/
├── components/features/profile-editor/
│   ├── ProfileEditorContainer.tsx      # Main editor layout
│   ├── VisibilityControls.tsx          # Field visibility toggles
│   ├── LivePreviewPanel.tsx            # Device preview panel
│   ├── ThemeGallery.tsx                # Theme selection gallery
│   ├── ColorPaletteBuilder.tsx         # Color customization
│   ├── TypographyManager.tsx           # Font management
│   ├── CustomFontUpload.tsx            # Custom font upload
│   ├── AssetUpload.tsx                 # Logo/asset management
│   ├── VersionHistory.tsx              # Version control UI
│   ├── PreviewSharing.tsx              # Preview link sharing
│   ├── CollaborationPanel.tsx          # Comments & approval
│   ├── AnalyticsDashboard.tsx          # Analytics display
│   └── shared/                         # Shared preview components
├── services/
│   ├── profileEditorService.ts         # Profile CRUD operations
│   ├── visibilityFilterService.ts      # Visibility filtering
│   ├── previewService.ts               # Preview generation
│   ├── themeService.ts                 # Theme management
│   ├── themeCustomizationService.ts    # Theme customization
│   ├── fontService.ts                  # Font management
│   ├── assetService.ts                 # Asset management
│   ├── versionControlService.ts        # Version management
│   ├── previewSharingService.ts        # Preview link sharing
│   ├── collaborationService.ts         # Comments & approval
│   └── profileAnalyticsService.ts      # Analytics tracking
├── hooks/
│   ├── useProfileEditor.ts             # Editor state management
│   ├── usePerformanceOptimization.ts   # Performance hooks
│   └── useAccessibility.ts             # Accessibility hooks
└── utils/
    ├── colorUtils.ts                   # Color manipulation
    ├── securityUtils.ts                # Security utilities
    └── performanceTestUtils.ts         # Performance testing
```

## Quick Start

### Basic Usage

```tsx
import { ProfileEditorContainer } from '@/components/features/profile-editor/ProfileEditorContainer';

function ProfileEditorPage() {
  return (
    <ProfileEditorContainer
      workspaceId="ws-123"
      profileId="profile-456"
      onSave={(profile) => console.log('Saved:', profile)}
      onPublish={() => console.log('Published!')}
    />
  );
}
```

### With Custom Configuration

```tsx
<ProfileEditorContainer
  workspaceId="ws-123"
  profileId="profile-456"
  initialDeviceMode="phone"
  autoSaveEnabled={true}
  autoSaveDelay={500}
  historyLimit={50}
  onSave={handleSave}
  onPublish={handlePublish}
  onError={handleError}
/>
```

## API Reference

### ProfileEditorService

Manages profile data operations.

```typescript
import { ProfileEditorService } from '@/services/profileEditorService';

const service = ProfileEditorService.getInstance();

// Get profile
const profile = await service.getProfile(workspaceId, profileId);

// Update profile
await service.updateProfile(workspaceId, profileId, {
  business_name: 'New Name',
  tagline: 'New Tagline',
});

// Get visibility config
const visibility = await service.getVisibilityConfig(workspaceId, profileId);

// Update visibility
await service.updateVisibility(workspaceId, profileId, {
  email: true,
  phone: false,
});

// Publish profile
await service.publishProfile(workspaceId, profileId);
```

### ThemeService

Manages theme selection and application.

```typescript
import { ThemeService } from '@/services/themeService';

const service = ThemeService.getInstance();

// List available themes
const themes = await service.listThemes();

// Get themes by category
const minimalThemes = await service.getThemesByCategory('minimal');

// Apply theme to profile
await service.applyTheme(workspaceId, profileId, themeId);
```

### ThemeCustomizationService

Handles theme color and layout customization.

```typescript
import { ThemeCustomizationService } from '@/services/themeCustomizationService';

const service = ThemeCustomizationService.getInstance();

// Update colors
await service.updateColors(workspaceId, profileId, {
  primary: '#2563EB',
  secondary: '#1D4ED8',
  accent: '#06B6D4',
});

// Update layout
await service.updateLayout(workspaceId, profileId, {
  headerLayout: 'centered',
  sectionSpacing: 'relaxed',
});

// Save as preset
await service.saveAsPreset(workspaceId, profileId, 'My Custom Theme');
```

### FontService

Manages web fonts and custom font uploads.

```typescript
import { FontService } from '@/services/fontService';

const service = FontService.getInstance();

// List web fonts
const fonts = await service.listWebFonts();

// Upload custom font
const font = await service.uploadCustomFont(workspaceId, file, {
  family: 'Custom Font',
  weight: '400',
  style: 'normal',
});

// Update typography
await service.updateTypography(workspaceId, profileId, {
  headingFont: 'Playfair Display',
  bodyFont: 'Inter',
  accentFont: 'Roboto Mono',
});
```

### VersionControlService

Manages profile version history.

```typescript
import { VersionControlService } from '@/services/versionControlService';

const service = VersionControlService.getInstance();

// Create manual snapshot
const snapshot = await service.createSnapshot(workspaceId, profileId, {
  label: 'Before major changes',
  auto: false,
});

// List versions
const versions = await service.listVersions(workspaceId, profileId, {
  limit: 20,
});

// Restore version
await service.restoreVersion(workspaceId, profileId, versionId);

// Compare versions
const diff = await service.compareVersions(workspaceId, versionId1, versionId2);

// Export configuration
const config = await service.exportConfiguration(workspaceId, profileId);

// Import configuration
await service.importConfiguration(workspaceId, profileId, config);
```

### PreviewSharingService

Manages preview link sharing.

```typescript
import { PreviewSharingService } from '@/services/previewSharingService';

const service = PreviewSharingService.getInstance();

// Create preview link
const link = await service.createPreviewLink(workspaceId, profileId, {
  expiresIn: '7d',
  passwordProtected: true,
  password: 'secret123',
});

// Access preview (for viewers)
const access = await service.accessPreview(token, password);

// Revoke link
await service.revokePreviewLink(workspaceId, linkId);

// List all links
const links = await service.listPreviewLinks(workspaceId, profileId);
```

### CollaborationService

Handles comments and approval workflows.

```typescript
import { CollaborationService } from '@/services/collaborationService';

const service = CollaborationService.getInstance();

// Add comment
const comment = await service.addComment(workspaceId, profileId, linkId, {
  content: 'Looks great!',
  parentId: null, // or parent comment ID for replies
});

// Create approval request
const request = await service.createApprovalRequest(workspaceId, profileId, linkId, {
  approvers: ['user-1', 'user-2'],
  message: 'Please review before launch',
});

// Submit approval response
await service.respondToApproval(workspaceId, requestId, {
  approved: true,
  comment: 'Approved with minor suggestions',
});
```

### ProfileAnalyticsService

Tracks and retrieves analytics data.

```typescript
import { ProfileAnalyticsService } from '@/services/profileAnalyticsService';

const service = ProfileAnalyticsService.getInstance();

// Get analytics
const analytics = await service.getAnalytics(workspaceId, profileId, {
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});

// Get geographic data
const geoData = await service.getGeographicData(workspaceId, profileId);

// Get link clicks
const clicks = await service.getLinkClicks(workspaceId, profileId);

// Toggle analytics
await service.setAnalyticsEnabled(workspaceId, profileId, true);
```

## Hooks

### useProfileEditor

Main hook for editor state management.

```typescript
import { useProfileEditor } from '@/hooks/useProfileEditor';

function MyComponent() {
  const {
    profile,
    visibility,
    isLoading,
    isSaving,
    hasChanges,
    updateField,
    toggleVisibility,
    undo,
    redo,
    canUndo,
    canRedo,
    save,
    publish,
  } = useProfileEditor(workspaceId, profileId);

  return (
    <div>
      <input
        value={profile.business_name}
        onChange={(e) => updateField('business_name', e.target.value)}
      />
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
      <button onClick={save} disabled={!hasChanges}>Save</button>
    </div>
  );
}
```

### useDebounce

Debounce values for preview updates.

```typescript
import { useDebounce } from '@/hooks/usePerformanceOptimization';

function PreviewComponent({ profile }) {
  const { value: debouncedProfile, isPending } = useDebounce(profile, 300);

  return (
    <div>
      {isPending && <LoadingSpinner />}
      <Preview profile={debouncedProfile} />
    </div>
  );
}
```

### useLazyLoad

Lazy load content when visible.

```typescript
import { useLazyLoad } from '@/hooks/usePerformanceOptimization';

function ThemeThumbnail({ theme }) {
  const { ref, isInView, hasLoaded } = useLazyLoad({
    rootMargin: '50px',
    threshold: 0.1,
  });

  return (
    <div ref={ref}>
      {hasLoaded ? (
        <img src={theme.thumbnailUrl} alt={theme.name} />
      ) : (
        <Skeleton />
      )}
    </div>
  );
}
```

### useAccessibility

Accessibility helpers.

```typescript
import {
  useFocusTrap,
  useLiveRegion,
  useKeyboardNavigation,
} from '@/hooks/useAccessibility';

function Modal({ isOpen, onClose, children }) {
  const containerRef = useFocusTrap(isOpen);
  const { announce } = useLiveRegion();

  useEffect(() => {
    if (isOpen) {
      announce('Dialog opened');
    }
  }, [isOpen, announce]);

  return (
    <div ref={containerRef} role="dialog" aria-modal="true">
      {children}
    </div>
  );
}
```

## Performance Guidelines

### Targets

| Metric | Target | Tool |
|--------|--------|------|
| Editor Load Time | < 1 second | `measureEditorLoadTime()` |
| Preview Latency | < 100ms | `measurePreviewLatency()` |
| Image Delivery | < 500ms | `measureImageDelivery()` |
| Lighthouse Score | 95+ | Lighthouse CI |
| FCP | < 1.8s | Web Vitals |
| LCP | < 2.5s | Web Vitals |
| CLS | < 0.1 | Web Vitals |

### Optimization Techniques

1. **Lazy Loading**: Use `useLazyLoad` for theme thumbnails and assets
2. **Debouncing**: Preview updates are debounced at 300ms
3. **Caching**: Theme configs and fonts are cached (5 min TTL)
4. **Virtualization**: Use `useVirtualization` for long font lists
5. **Code Splitting**: Editor components are lazy-loaded

### Performance Testing

```typescript
import {
  measureEditorLoadTime,
  measurePreviewLatency,
  generatePerformanceReport,
} from '@/utils/performanceTestUtils';

// Run performance tests
const report = await generatePerformanceReport(
  loadEditor,
  updatePreview,
  imageUrls
);

console.log('Recommendations:', report.recommendations);
```

## Accessibility

### WCAG 2.1 AA Compliance

- All interactive elements are keyboard accessible
- Focus management with `useFocusTrap`
- Screen reader announcements with `useLiveRegion`
- Color contrast checking with `useColorContrast`
- Skip links for main content navigation

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Save changes |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Ctrl/Cmd + P` | Toggle preview mode |
| `Escape` | Close modal/panel |
| `Tab` | Navigate between elements |

### Screen Reader Support

```typescript
// Announce changes to screen readers
const { announce } = useLiveRegion();

const handleSave = async () => {
  await save();
  announce('Profile saved successfully');
};

const handleVisibilityToggle = (field: string, visible: boolean) => {
  toggleVisibility(field, visible);
  announce(`${field} is now ${visible ? 'visible' : 'hidden'}`);
};
```

## Security

### Input Sanitization

All user input is sanitized before storage:

```typescript
import { sanitizeHtml, escapeHtml, validateText } from '@/utils/securityUtils';

// Sanitize HTML content
const safeHtml = sanitizeHtml(userInput, {
  allowedTags: ['b', 'i', 'a'],
  stripHtml: false,
});

// Validate text with constraints
const result = validateText(text, {
  minLength: 1,
  maxLength: 500,
  allowHtml: false,
});
```

### CSRF Protection

All API requests include CSRF tokens:

```typescript
import { getCsrfHeader } from '@/utils/securityUtils';

const response = await fetch('/api/v1/profile', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    ...getCsrfHeader(),
  },
  body: JSON.stringify(data),
});
```

### Rate Limiting

Client-side rate limiting for actions:

```typescript
import { checkRateLimit } from '@/utils/securityUtils';

const handleUpload = async (file: File) => {
  const limit = checkRateLimit('asset-upload', 10, 60000); // 10/minute

  if (limit.isLimited) {
    showError(`Too many uploads. Try again in ${Math.ceil((limit.resetAt - Date.now()) / 1000)}s`);
    return;
  }

  await uploadAsset(file);
};
```

## Testing

### Running Tests

```bash
# Run all profile editor tests
npm test -- --grep "Profile Editor"

# Run performance tests
npm test -- --grep "Performance"

# Run integration tests
npm test -- --grep "Integration"

# Run accessibility tests
npm test -- --grep "Accessibility"
```

### Test Files

- `ProfileEditorContainer.test.tsx` - Main editor tests
- `VisibilityControls.test.tsx` - Visibility toggle tests
- `ProfileEditorPerformance.test.tsx` - Performance tests
- `ProfileEditorIntegration.test.tsx` - Integration tests

### Writing Tests

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { ProfileEditorContainer } from './ProfileEditorContainer';

describe('ProfileEditorContainer', () => {
  it('should update field and trigger auto-save', async () => {
    const onSave = vi.fn();

    render(
      <ProfileEditorContainer
        workspaceId="ws-123"
        profileId="p-456"
        onSave={onSave}
      />
    );

    const input = screen.getByLabelText('Business Name');
    fireEvent.change(input, { target: { value: 'New Name' } });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
  });
});
```

## Troubleshooting

### Common Issues

#### Preview not updating
- Check that debouncing is not too aggressive (default: 300ms)
- Verify WebSocket connection for real-time sync
- Clear preview cache: `previewService.clearCache(profileId)`

#### Theme not applying
- Ensure theme exists: `themeService.getTheme(themeId)`
- Check workspace isolation: themes are workspace-scoped
- Verify CSS variable support in browser

#### Custom font not loading
- Check file type: only .woff, .woff2, .ttf, .otf supported
- Verify file size: max 5MB
- Check font-face CSS generation in DevTools

#### Performance issues
- Use `generatePerformanceReport()` to identify bottlenecks
- Enable lazy loading for theme gallery
- Reduce history limit if memory is an issue

### Debug Mode

```typescript
// Enable debug logging
if (import.meta.env.DEV) {
  ProfileEditorService.getInstance().enableDebug(true);
  PreviewService.getInstance().enableDebug(true);
}
```

## Migration Guide

### From v1.x to v2.x

1. Update service imports:
```typescript
// Old
import { ProfileService } from '@/services/profileService';

// New
import { ProfileEditorService } from '@/services/profileEditorService';
```

2. Update hook usage:
```typescript
// Old
const { profile, updateProfile } = useProfile(workspaceId);

// New
const { profile, updateField, save } = useProfileEditor(workspaceId, profileId);
```

3. Theme customization API changed:
```typescript
// Old
await themeService.updateTheme(profileId, colors);

// New
await themeCustomizationService.updateColors(workspaceId, profileId, colors);
```

## Contributing

### Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start dev server: `npm run dev`
4. Open editor: `http://localhost:3000/workspace/{id}/profile-editor`

### Code Style

- Use TypeScript strict mode
- Follow project ESLint/Prettier config
- Write tests for new features
- Update documentation

### Pull Request Checklist

- [ ] Tests pass
- [ ] Performance targets met
- [ ] Accessibility verified
- [ ] Security review completed
- [ ] Documentation updated
