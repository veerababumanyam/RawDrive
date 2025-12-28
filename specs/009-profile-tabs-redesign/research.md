# Research: User Profile Tabbed Navigation Redesign

**Feature**: 009-profile-tabs-redesign
**Date**: 2025-12-28
**Status**: Complete

## Research Tasks

1. WAI-ARIA Tabs Pattern - Accessibility requirements
2. Existing `GallerySettingsPanel` Implementation - Pattern to follow
3. Mobile Tab Navigation Patterns - Responsive design
4. Form State Preservation - State management across tabs
5. URL Query Parameter Routing - Deep-linking support

---

## 1. WAI-ARIA Tabs Pattern

### Decision
Follow the WAI-ARIA Authoring Practices tabbed interface pattern for full accessibility compliance.

### Rationale
WAI-ARIA tabs pattern is the established standard for accessible tabbed interfaces, ensuring compatibility with screen readers and keyboard-only navigation. RawDrive's WCAG 2.1 AA requirement mandates this approach.

### Implementation Details

**Required ARIA Attributes:**

```typescript
// Tab List container
<div role="tablist" aria-label="Settings sections">

// Individual Tab buttons
<button
  role="tab"
  id="tab-profile"
  aria-selected={activeTab === 'profile'}
  aria-controls="panel-profile"
  tabIndex={activeTab === 'profile' ? 0 : -1}
>
  Profile
</button>

// Tab Panel content
<div
  role="tabpanel"
  id="panel-profile"
  aria-labelledby="tab-profile"
  tabIndex={0}
  hidden={activeTab !== 'profile'}
>
  {/* Content */}
</div>
```

**Keyboard Navigation:**

| Key | Action |
|-----|--------|
| Tab | Move focus into/out of tab list |
| Arrow Left/Right | Move between tabs |
| Home | Move to first tab |
| End | Move to last tab |
| Enter/Space | Activate focused tab |

### Alternatives Considered
- Simple button group (rejected: not semantically tabs)
- Headless UI library (rejected: adds external dependency)

---

## 2. GallerySettingsPanel Implementation Analysis

### Decision
Replicate the exact tab styling from `GallerySettingsPanel` for visual consistency.

### Rationale
The existing implementation already follows RawDrive's design system and has been tested in production. Consistency reduces cognitive load for users.

### Pattern Extracted from [GallerySettingsPanel.tsx](../../frontend/src/components/features/gallery/GallerySettingsPanel.tsx#L126-L144)

**Tab Navigation Styling:**

```typescript
// Tab container
<div className="flex border-b border-border overflow-x-auto">

// Individual tabs
<button
  onClick={() => setActiveSection(section.id)}
  className={`
    px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
    border-b-2
    ${activeSection === section.id
      ? 'border-primary text-primary'
      : 'border-transparent text-text-secondary hover:text-text-primary'
    }
  `}
>
  {section.label}
</button>
```

**Key Styling Properties:**
- `px-6 py-4` - Padding for touch targets (meets 44px minimum height)
- `text-sm font-medium` - Typography
- `border-b-2` - Active indicator thickness
- `border-primary text-primary` - Active state colors
- `border-transparent` - Inactive state (no visible border)
- `overflow-x-auto` - Horizontal scroll for mobile
- `whitespace-nowrap` - Prevent text wrapping

### State Management Pattern:

```typescript
const [activeSection, setActiveSection] = useState<SectionType>('general');

// Reset state when panel opens
useEffect(() => {
  if (isOpen) {
    setUpdates({});
    setActiveSection('general');
  }
}, [isOpen]);
```

---

## 3. Mobile Tab Navigation Patterns

### Decision
Use horizontal scrollable tabs (same as `GalleryToolbar`) rather than dropdown selector.

### Rationale
- Maintains visual consistency with other scrollable elements in the app
- Users can see all available tabs at a glance
- Native scroll behavior is familiar
- Avoids additional click to open dropdown

### Implementation

```typescript
// Mobile-first container
<div
  className="flex border-b border-border overflow-x-auto scrollbar-hide"
  role="tablist"
>
  {tabs.map(tab => (
    <button
      key={tab.id}
      className={`
        flex-shrink-0 min-w-[44px] min-h-[44px]
        px-4 py-3 md:px-6 md:py-4
        text-sm font-medium
        // ... rest of styling
      `}
    >
      {/* Icon only on mobile, icon + label on desktop */}
      <span className="md:hidden">{tab.icon}</span>
      <span className="hidden md:inline">{tab.label}</span>
    </button>
  ))}
</div>
```

**Responsive Breakpoints:**
- Mobile (< 768px): Icons only or abbreviated labels, tighter padding
- Tablet (768px - 1024px): Full labels with moderate padding
- Desktop (> 1024px): Full labels with generous padding

### Alternatives Considered
- Dropdown selector on mobile (rejected: hides options, inconsistent with app)
- Bottom sheet (rejected: over-engineered for this use case)
- Segmented control (rejected: limited to 3-4 options, we have 7 tabs)

---

## 4. Form State Preservation Across Tabs

### Decision
Each tab content component manages its own form state independently using existing hooks.

### Rationale
- Existing settings pages already have form state management via `useUserSettings`, `useGeminiSettings`, etc.
- Refactoring to global state would be over-engineering
- Each section can save independently (per-section save pattern)
- Tab components will be mounted/unmounted on switch (standard React pattern)

### Implementation Pattern

```typescript
// Each tab content component uses its own hooks
const ProfileTabContent: React.FC = () => {
  const { profile, updateProfile, loading } = useUserProfile();
  const [formState, setFormState] = useState(profile);

  // Local form state initialized from hook data
  useEffect(() => {
    if (profile) setFormState(profile);
  }, [profile]);

  // Component handles its own save
  const handleSave = async () => {
    await updateProfile(formState);
  };

  return (/* form JSX */);
};
```

**State Preservation Options:**
1. **Option A: Unmount tabs on switch** (SELECTED)
   - Simpler implementation
   - Fresh state on each visit
   - Hooks re-fetch data automatically

2. **Option B: Keep all tabs mounted** (NOT SELECTED)
   - Uses more memory
   - Complex hidden state management
   - Potential stale data issues

### Unsaved Changes Warning

```typescript
// Each tab manages its own "dirty" state
const [isDirty, setIsDirty] = useState(false);

// Optional: Warn before navigating away
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [isDirty]);
```

---

## 5. URL Query Parameter Routing

### Decision
Use React Router's `useSearchParams` hook for tab state in URL query parameters.

### Rationale
- Enables deep-linking to specific tabs (bookmarkable)
- Browser back/forward navigation works
- Shareable URLs
- No additional libraries needed

### Implementation

```typescript
import { useSearchParams } from 'react-router-dom';

type TabId = 'profile' | 'security' | 'notifications' | 'privacy' | 'ai' | 'subscription' | 'account';

const VALID_TABS: TabId[] = ['profile', 'security', 'notifications', 'privacy', 'ai', 'subscription', 'account'];
const DEFAULT_TAB: TabId = 'profile';

const UserSettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read tab from URL, default to 'profile'
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = VALID_TABS.includes(tabParam as TabId)
    ? (tabParam as TabId)
    : DEFAULT_TAB;

  // Update URL when tab changes
  const handleTabChange = (newTab: TabId) => {
    setSearchParams({ tab: newTab }, { replace: true });
  };

  return (
    <SettingsTabs
      activeTab={activeTab}
      onTabChange={handleTabChange}
    />
  );
};
```

**URL Format:**
- `/settings` → Profile tab (default)
- `/settings?tab=profile` → Profile tab (explicit)
- `/settings?tab=security` → Security tab
- `/settings?tab=invalid` → Profile tab (fallback)

### Router Configuration Change

```typescript
// OLD - Multiple routes
export const userSettingsRoutes: RouteObject[] = [
  {
    path: '/settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <ProfileSettingsPage /> },
      { path: 'profile', element: <ProfileSettingsPage /> },
      { path: 'security', element: <SecuritySettingsPage /> },
      // ... 7 routes total
    ],
  },
];

// NEW - Single route with query params
export const userSettingsRoutes: RouteObject[] = [
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <WorkspaceLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <UserSettingsPage /> },
    ],
  },
];
```

---

## Summary of Decisions

| Area | Decision | Pattern/Reference |
|------|----------|-------------------|
| Accessibility | WAI-ARIA tabs pattern | WCAG 2.1 AA standard |
| Visual Design | Match `GallerySettingsPanel` | border-b-2, primary color active |
| Mobile | Horizontal scrollable tabs | Same as `GalleryToolbar` |
| Form State | Per-component state via hooks | Existing `useUserProfile`, etc. |
| Routing | URL query parameters | `?tab=security` |
| Tab Icons | Lucide React icons | Same as `SettingsLayout` nav items |

---

## Component Icon Reference

From existing `SettingsLayout`:

| Tab | Icon | Lucide Component |
|-----|------|-----------------|
| Profile | User | `<User size={20} />` |
| Security | Shield | `<Shield size={20} />` |
| Notifications | Bell | `<Bell size={20} />` |
| Privacy | Lock | `<Lock size={20} />` |
| AI & Gemini | Sparkles | `<Sparkles size={20} />` |
| Subscription | CreditCard | `<CreditCard size={20} />` |
| Account | Trash2 | `<Trash2 size={20} />` (danger styling) |
