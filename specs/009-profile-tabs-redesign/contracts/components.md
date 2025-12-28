# Component API Contracts: User Profile Tabbed Navigation

**Feature**: 009-profile-tabs-redesign
**Date**: 2025-12-28

## Overview

This document defines the component API contracts (props interfaces) for the new tabbed settings navigation.

---

## 1. Tabs Component (Reusable)

**File**: `frontend/src/components/ui/Tabs.tsx`

### Purpose
Generic, accessible tab navigation component following WAI-ARIA tabs pattern.

### Props Interface

```typescript
export interface TabItem<T extends string = string> {
  /** Unique identifier for this tab */
  id: T;
  /** Display label */
  label: string;
  /** Optional icon (Lucide component) */
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  /** Whether this tab represents a danger action */
  isDanger?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  /** Array of tab items */
  tabs: TabItem<T>[];
  /** Currently active tab ID */
  activeTab: T;
  /** Callback when tab selection changes */
  onTabChange: (tabId: T) => void;
  /** Accessible label for screen readers */
  ariaLabel: string;
  /** Additional CSS classes */
  className?: string;
  /** Tab size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show icons only on mobile (with labels visible on desktop) */
  iconsOnlyMobile?: boolean;
}
```

### Usage Example

```tsx
<Tabs
  tabs={[
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
  ]}
  activeTab="profile"
  onTabChange={(id) => setActiveTab(id)}
  ariaLabel="Settings sections"
/>
```

### Accessibility Contract

- `role="tablist"` on container
- `role="tab"` on each tab button
- `aria-selected` reflects active state
- `aria-controls` links to panel ID
- `tabIndex={0}` only on active tab
- Keyboard: Arrow Left/Right, Home, End, Enter/Space

---

## 2. TabPanel Component (Reusable)

**File**: `frontend/src/components/ui/TabPanel.tsx`

### Purpose
Accessible tab panel wrapper for content associated with a tab.

### Props Interface

```typescript
export interface TabPanelProps {
  /** Tab ID this panel belongs to */
  tabId: string;
  /** Whether this panel is currently active */
  isActive: boolean;
  /** Content to render */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}
```

### Usage Example

```tsx
<TabPanel tabId="profile" isActive={activeTab === 'profile'}>
  <ProfileTabContent />
</TabPanel>
```

### Accessibility Contract

- `role="tabpanel"`
- `id="panel-{tabId}"`
- `aria-labelledby="tab-{tabId}"`
- `tabIndex={0}` for keyboard focus
- `hidden` attribute when not active

---

## 3. SettingsTabs Component

**File**: `frontend/src/components/settings/SettingsTabs.tsx`

### Purpose
Settings-specific implementation of Tabs with predefined configuration.

### Props Interface

```typescript
import type { SettingsTabId } from '@/types/settings';

export interface SettingsTabsProps {
  /** Currently active tab */
  activeTab: SettingsTabId;
  /** Callback when tab changes */
  onTabChange: (tabId: SettingsTabId) => void;
  /** Optional CSS classes */
  className?: string;
}
```

### Internal Configuration

Component internally uses `SETTINGS_TAB_CONFIG` from data model.

### Usage Example

```tsx
<SettingsTabs
  activeTab={activeTab}
  onTabChange={handleTabChange}
/>
```

---

## 4. Tab Content Components

### Common Interface

All tab content components share this base interface:

```typescript
export interface BaseTabContentProps {
  /** Additional CSS classes */
  className?: string;
}
```

### 4.1 ProfileTabContent

**File**: `frontend/src/components/settings/ProfileTabContent.tsx`

```typescript
export interface ProfileTabContentProps extends BaseTabContentProps {
  // No additional props - uses useUserProfile() internally
}
```

**Internal State**:
- `displayName: string`
- `jobTitle: string`
- `phone: string`
- `bio: string`
- `timezone: string`
- `isSaving: boolean`
- `isDirty: boolean`

### 4.2 SecurityTabContent

**File**: `frontend/src/components/settings/SecurityTabContent.tsx`

```typescript
export interface SecurityTabContentProps extends BaseTabContentProps {
  // No additional props - uses useUserSecurity() internally
}
```

**Internal State**:
- `showPasswordModal: boolean`
- `show2FAModal: boolean`
- `sessions: UserSession[]`

### 4.3 NotificationsTabContent

**File**: `frontend/src/components/settings/NotificationsTabContent.tsx`

```typescript
export interface NotificationsTabContentProps extends BaseTabContentProps {
  // No additional props - uses useNotifications() internally
}
```

**Internal State**:
- `preferences: NotificationPreferences`
- `isSaving: boolean`

### 4.4 PrivacyTabContent

**File**: `frontend/src/components/settings/PrivacyTabContent.tsx`

```typescript
export interface PrivacyTabContentProps extends BaseTabContentProps {
  // No additional props - uses usePrivacySettings() internally
}
```

**Internal State**:
- `isExporting: boolean`
- `exportProgress: number`

### 4.5 AITabContent

**File**: `frontend/src/components/settings/AITabContent.tsx`

```typescript
export interface AITabContentProps extends BaseTabContentProps {
  // No additional props - uses useGeminiSettings() internally
}
```

**Internal State**:
- `apiKey: string`
- `selectedModel: string`
- `showApiKeyModal: boolean`

### 4.6 SubscriptionTabContent

**File**: `frontend/src/components/settings/SubscriptionTabContent.tsx`

```typescript
export interface SubscriptionTabContentProps extends BaseTabContentProps {
  // No additional props - uses useSubscription() internally
}
```

**Internal State**:
- `currentPlan: Plan`
- `billingHistory: Invoice[]`
- `paymentMethods: PaymentMethod[]`

### 4.7 AccountTabContent

**File**: `frontend/src/components/settings/AccountTabContent.tsx`

```typescript
export interface AccountTabContentProps extends BaseTabContentProps {
  // No additional props - uses useAccount() internally
}
```

**Internal State**:
- `showDeleteModal: boolean`
- `deleteConfirmation: string`
- `isDeleting: boolean`

**Visual Contract**:
- Uses danger zone styling (red/destructive colors)
- Requires confirmation before destructive actions

---

## 5. UserSettingsPage

**File**: `frontend/src/pages/settings/UserSettingsPage.tsx`

### Props Interface

```typescript
// Page component - no props (uses router/context)
export interface UserSettingsPageProps {
  // None - reads from URL params via useSearchParams
}
```

### Hooks Used

```typescript
const [searchParams, setSearchParams] = useSearchParams();
```

### State Derived

```typescript
const activeTab = validateTabId(searchParams.get('tab'));
```

### Event Handlers

```typescript
const handleTabChange = (tabId: SettingsTabId) => {
  setSearchParams({ tab: tabId }, { replace: true });
};
```

---

## Component Hierarchy

```text
UserSettingsPage
└── div (page container)
    ├── header
    │   ├── h1 "Settings"
    │   └── p "Manage your account preferences"
    │
    ├── SettingsTabs
    │   └── Tabs (generic)
    │       └── [Tab buttons with icons/labels]
    │
    └── div (content area)
        └── {activeTab === 'profile' && <ProfileTabContent />}
        └── {activeTab === 'security' && <SecurityTabContent />}
        └── {activeTab === 'notifications' && <NotificationsTabContent />}
        └── {activeTab === 'privacy' && <PrivacyTabContent />}
        └── {activeTab === 'ai' && <AITabContent />}
        └── {activeTab === 'subscription' && <SubscriptionTabContent />}
        └── {activeTab === 'account' && <AccountTabContent />}
```

---

## CSS Classes Contract

### Tab Container

```css
/* Horizontal scrollable on mobile */
.settings-tabs {
  @apply flex border-b border-border overflow-x-auto;
}
```

### Tab Button

```css
/* Base state */
.settings-tab {
  @apply px-4 py-3 md:px-6 md:py-4;
  @apply text-sm font-medium;
  @apply border-b-2 border-transparent;
  @apply text-text-secondary;
  @apply transition-colors whitespace-nowrap;
  @apply min-w-[44px] min-h-[44px]; /* Touch target */
}

/* Active state */
.settings-tab--active {
  @apply border-primary text-primary;
}

/* Hover state */
.settings-tab:hover:not(.settings-tab--active) {
  @apply text-text-primary;
}

/* Danger tab (Account) */
.settings-tab--danger.settings-tab--active {
  @apply border-error text-error;
}
```

### Content Area

```css
.settings-content {
  @apply py-6;
  @apply max-w-3xl; /* Readable width */
}
```
