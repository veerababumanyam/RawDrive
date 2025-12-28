# Quickstart Guide: User Profile Tabbed Navigation

**Feature**: 009-profile-tabs-redesign
**Date**: 2025-12-28

## Prerequisites

- Node.js 18+ installed
- RawDrive repository cloned
- Docker running (for backend services)

## Development Setup

### 1. Start Development Environment

```bash
# From repository root
cd /Users/v13478/Desktop/RawDrive

# Start infrastructure (PostgreSQL, Redis)
npm run docker:dev:up

# Start frontend dev server (in a new terminal)
cd frontend && npm run dev

# Start backend (in another terminal, optional for API testing)
cd backend && npm run dev
```

Frontend will be available at: `http://localhost:3000`

### 2. Navigate to Settings

1. Log in with test credentials:
   - Email: `business@test.rawdrive.in`
   - Password: `TestPass123!`

2. Go to workspace sidebar → Click "My Profile"
   - Current URL: `http://localhost:3000/settings/profile`
   - Target URL (after implementation): `http://localhost:3000/settings?tab=profile`

---

## Implementation Order

### Phase 1: Create Reusable Tabs Component

```bash
# Create new file
touch frontend/src/components/ui/Tabs.tsx
```

**File**: `frontend/src/components/ui/Tabs.tsx`

Implement the generic `Tabs` component following:
- [contracts/components.md](./contracts/components.md) - Props interface
- [research.md](./research.md) - WAI-ARIA pattern

### Phase 2: Create Tab Content Components

```bash
# Create settings components directory
mkdir -p frontend/src/components/settings

# Create tab content components (extract from existing pages)
touch frontend/src/components/settings/ProfileTabContent.tsx
touch frontend/src/components/settings/SecurityTabContent.tsx
touch frontend/src/components/settings/NotificationsTabContent.tsx
touch frontend/src/components/settings/PrivacyTabContent.tsx
touch frontend/src/components/settings/AITabContent.tsx
touch frontend/src/components/settings/SubscriptionTabContent.tsx
touch frontend/src/components/settings/AccountTabContent.tsx
touch frontend/src/components/settings/SettingsTabs.tsx
touch frontend/src/components/settings/index.ts
```

For each tab content component:
1. Copy the JSX from the existing page (e.g., `ProfileSettingsPage.tsx`)
2. Keep the hooks (e.g., `useUserProfile()`)
3. Remove the `SettingsLayout` wrapper
4. Export as `ProfileTabContent`, etc.

### Phase 3: Create UserSettingsPage

```bash
touch frontend/src/pages/settings/UserSettingsPage.tsx
```

Container page that:
1. Reads `?tab=` from URL
2. Renders `SettingsTabs`
3. Conditionally renders tab content

### Phase 4: Update Router

**File**: `frontend/src/router/routes.tsx`

Replace `userSettingsRoutes` configuration:

```typescript
// Before
export const userSettingsRoutes: RouteObject[] = [
  {
    path: '/settings',
    element: <ProtectedRoute><SettingsLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <UserProfileSettingsPage /> },
      { path: 'profile', element: <UserProfileSettingsPage /> },
      // ... 7 routes
    ],
  },
];

// After
export const userSettingsRoutes: RouteObject[] = [
  {
    path: '/settings',
    element: <ProtectedRoute><WorkspaceLayout /></ProtectedRoute>,
    children: [
      { index: true, element: <UserSettingsPage /> },
    ],
  },
];
```

### Phase 5: Update Sidebar Navigation

**File**: `frontend/src/components/workspace/WorkspaceSidebar.tsx`

Update "My Profile" link:

```typescript
// Before
{ id: 'myProfile', label: 'My Profile', icon: <User />, path: '/settings/profile' },

// After
{ id: 'myProfile', label: 'My Profile', icon: <User />, path: '/settings' },
```

---

## Testing Commands

### Run Unit Tests

```bash
cd frontend
npm test -- --watch --testPathPattern="settings"
```

### Run All Frontend Tests

```bash
cd frontend
npm test
```

### Accessibility Testing

```bash
# Install axe-core if not present
npm install -D @axe-core/react

# Add to test setup
import '@axe-core/react';
```

Manual testing with screen reader:
- macOS: Enable VoiceOver (Cmd + F5)
- Navigate through tabs with arrow keys
- Verify tab announcements

### Visual Testing

Check at these breakpoints:
- Mobile: 375px
- Tablet: 768px
- Desktop: 1024px
- Large: 1440px

---

## File Reference

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/ui/Tabs.tsx` | Reusable tabs | NEW |
| `frontend/src/components/ui/TabPanel.tsx` | Tab panel wrapper | NEW |
| `frontend/src/components/settings/SettingsTabs.tsx` | Settings tab config | NEW |
| `frontend/src/components/settings/ProfileTabContent.tsx` | Profile section | NEW |
| `frontend/src/components/settings/SecurityTabContent.tsx` | Security section | NEW |
| `frontend/src/components/settings/NotificationsTabContent.tsx` | Notifications | NEW |
| `frontend/src/components/settings/PrivacyTabContent.tsx` | Privacy section | NEW |
| `frontend/src/components/settings/AITabContent.tsx` | AI & Gemini | NEW |
| `frontend/src/components/settings/SubscriptionTabContent.tsx` | Subscription | NEW |
| `frontend/src/components/settings/AccountTabContent.tsx` | Account/Danger | NEW |
| `frontend/src/components/settings/index.ts` | Barrel export | NEW |
| `frontend/src/pages/settings/UserSettingsPage.tsx` | Container page | NEW |
| `frontend/src/types/settings.ts` | Type definitions | NEW |
| `frontend/src/router/routes.tsx` | Route config | MODIFY |
| `frontend/src/components/workspace/WorkspaceSidebar.tsx` | Sidebar nav | MODIFY |
| `frontend/src/components/layout/SettingsLayout.tsx` | Old layout | DEPRECATE |

---

## Keyboard Navigation Testing Checklist

- [ ] Tab key moves focus into tab list
- [ ] Arrow Left/Right moves between tabs
- [ ] Home key moves to first tab
- [ ] End key moves to last tab
- [ ] Enter/Space activates focused tab
- [ ] Tab key moves focus out of tab list into content
- [ ] Focus ring visible on all interactive elements

---

## Common Issues

### Tab content not updating

Check that `useSearchParams` is reading correctly:

```typescript
const [searchParams] = useSearchParams();
console.log('Tab param:', searchParams.get('tab'));
```

### Styles not matching GallerySettingsPanel

Ensure you're using exact class names:

```typescript
className={`
  px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
  border-b-2
  ${isActive
    ? 'border-primary text-primary'
    : 'border-transparent text-text-secondary hover:text-text-primary'
  }
`}
```

### Mobile tabs not scrolling

Add these classes to tab container:

```typescript
className="flex border-b border-border overflow-x-auto scrollbar-hide"
```

---

## Design References

- **Tab Pattern**: [GallerySettingsPanel.tsx:126-144](../../frontend/src/components/features/gallery/GallerySettingsPanel.tsx)
- **Filter Pills**: [GalleryToolbar.tsx:150-185](../../frontend/src/components/features/gallery/GalleryToolbar.tsx)
- **Settings Icons**: [SettingsLayout.tsx:48-99](../../frontend/src/components/layout/SettingsLayout.tsx)
- **Form Cards**: [ProfileSettingsPage.tsx:225-239](../../frontend/src/pages/settings/ProfileSettingsPage.tsx)
