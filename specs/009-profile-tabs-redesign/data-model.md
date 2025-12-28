# Data Model: User Profile Tabbed Navigation Redesign

**Feature**: 009-profile-tabs-redesign
**Date**: 2025-12-28
**Status**: Complete

## Overview

This feature is **frontend-only** and does not introduce new database entities. The data model documents component state interfaces and TypeScript types for the new tabbed navigation system.

---

## Component State Models

### 1. Tab Identifiers

```typescript
/**
 * Valid tab identifiers for user settings
 * Matches the existing settings pages
 */
export type SettingsTabId =
  | 'profile'
  | 'security'
  | 'notifications'
  | 'privacy'
  | 'ai'
  | 'subscription'
  | 'account';

/**
 * Array of valid tab IDs for validation
 */
export const SETTINGS_TABS: SettingsTabId[] = [
  'profile',
  'security',
  'notifications',
  'privacy',
  'ai',
  'subscription',
  'account',
];

/**
 * Default tab when none specified
 */
export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'profile';
```

### 2. Tab Configuration

```typescript
import { LucideIcon } from 'lucide-react';

/**
 * Configuration for a single settings tab
 */
export interface SettingsTabConfig {
  /** Unique identifier */
  id: SettingsTabId;

  /** Display label */
  label: string;

  /** Icon component from Lucide */
  icon: LucideIcon;

  /** Description shown below label (optional) */
  description?: string;

  /** Whether this tab has danger zone styling */
  isDanger?: boolean;
}

/**
 * Full tab configuration array
 */
export const SETTINGS_TAB_CONFIG: SettingsTabConfig[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your personal information and avatar',
  },
  {
    id: 'security',
    label: 'Security',
    icon: Shield,
    description: 'Password, two-factor authentication, and sessions',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    description: 'Email and in-app notification preferences',
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: Lock,
    description: 'Data export and privacy controls',
  },
  {
    id: 'ai',
    label: 'AI & Gemini',
    icon: Sparkles,
    description: 'Configure Gemini API key and model preferences',
  },
  {
    id: 'subscription',
    label: 'Subscription',
    icon: CreditCard,
    description: 'Manage your plan, usage, and billing',
  },
  {
    id: 'account',
    label: 'Account',
    icon: Trash2,
    description: 'Delete account',
    isDanger: true,
  },
];
```

### 3. Tabs Component Props

```typescript
/**
 * Props for the reusable Tabs component (ui/Tabs.tsx)
 * Generic implementation for any tabbed interface
 */
export interface TabsProps<T extends string> {
  /** Array of tab configurations */
  tabs: Array<{
    id: T;
    label: string;
    icon?: LucideIcon;
    isDanger?: boolean;
  }>;

  /** Currently active tab ID */
  activeTab: T;

  /** Callback when tab changes */
  onTabChange: (tabId: T) => void;

  /** Accessible label for the tab list */
  ariaLabel?: string;

  /** Additional CSS classes for the container */
  className?: string;
}
```

### 4. Settings Tabs Component Props

```typescript
/**
 * Props for the SettingsTabs component
 * Settings-specific wrapper around Tabs
 */
export interface SettingsTabsProps {
  /** Currently active tab */
  activeTab: SettingsTabId;

  /** Callback when tab changes */
  onTabChange: (tabId: SettingsTabId) => void;
}
```

### 5. Tab Content Component Props

```typescript
/**
 * Common props interface for all tab content components
 * Each tab content component may extend this with specific props
 */
export interface TabContentProps {
  /** Whether the tab is currently visible */
  isActive: boolean;
}

/**
 * Profile tab specific props
 * Uses existing useUserProfile hook internally
 */
export interface ProfileTabContentProps extends TabContentProps {
  // No additional props - uses hooks internally
}

/**
 * Security tab specific props
 * Uses existing useUserSecurity hook internally
 */
export interface SecurityTabContentProps extends TabContentProps {
  // No additional props - uses hooks internally
}

// Similar interfaces for other tabs...
// NotificationsTabContentProps
// PrivacyTabContentProps
// AITabContentProps
// SubscriptionTabContentProps
// AccountTabContentProps
```

### 6. User Settings Page State

```typescript
/**
 * State interface for UserSettingsPage component
 */
export interface UserSettingsPageState {
  /** Current active tab from URL params */
  activeTab: SettingsTabId;

  /** Whether any tab has unsaved changes (for navigation warning) */
  hasUnsavedChanges: boolean;
}
```

---

## Existing Entities (No Changes)

The following existing entities are used by the tab content components but are **not modified** by this feature:

### UserProfile (from useUserProfile hook)

```typescript
interface UserProfile {
  user_id: string;
  email: string;
  email_verified: boolean;
  display_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  bio: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}
```

### UserSecurity (from useUserSecurity hook)

```typescript
interface UserSecuritySettings {
  two_factor_enabled: boolean;
  backup_codes_remaining: number;
  password_last_changed: string | null;
  sessions: UserSession[];
}

interface UserSession {
  session_id: string;
  device_info: string;
  ip_address: string;
  last_active: string;
  is_current: boolean;
}
```

### NotificationPreferences (from useNotifications hook)

```typescript
interface NotificationPreferences {
  email_notifications: boolean;
  marketing_emails: boolean;
  gallery_updates: boolean;
  client_activity: boolean;
  system_alerts: boolean;
}
```

### GeminiSettings (from useGeminiSettings hook)

```typescript
interface GeminiSettings {
  api_key_configured: boolean;
  selected_model_id: string | null;
  usage_this_month: number;
  usage_limit: number;
}
```

---

## State Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│                     UserSettingsPage                             │
├─────────────────────────────────────────────────────────────────┤
│  URL: /settings?tab={activeTab}                                  │
│                                                                  │
│  State:                                                          │
│  - activeTab: SettingsTabId (from useSearchParams)              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    SettingsTabs                              ││
│  │  Props: activeTab, onTabChange                               ││
│  │                                                              ││
│  │  [Profile] [Security] [Notifications] [Privacy] ...          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Tab Content (conditional render)                ││
│  │                                                              ││
│  │  {activeTab === 'profile' && <ProfileTabContent />}         ││
│  │  {activeTab === 'security' && <SecurityTabContent />}       ││
│  │  {activeTab === 'notifications' && <NotificationsTab... />} ││
│  │  ... etc                                                     ││
│  │                                                              ││
│  │  Each tab content uses its own hooks:                        ││
│  │  - ProfileTabContent → useUserProfile()                     ││
│  │  - SecurityTabContent → useUserSecurity()                   ││
│  │  - etc.                                                      ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules

### Tab ID Validation

```typescript
/**
 * Validates a tab ID from URL parameters
 * @param tabId - The tab ID to validate
 * @returns Valid SettingsTabId or default
 */
export function validateTabId(tabId: string | null): SettingsTabId {
  if (tabId && SETTINGS_TABS.includes(tabId as SettingsTabId)) {
    return tabId as SettingsTabId;
  }
  return DEFAULT_SETTINGS_TAB;
}
```

### URL Parameter Schema

```typescript
/**
 * Expected URL query parameters for settings page
 */
export interface SettingsUrlParams {
  tab?: SettingsTabId;
}
```

---

## Type Exports

All types should be exported from a central location:

```typescript
// frontend/src/types/settings.ts

export type { SettingsTabId } from './settings';
export type { SettingsTabConfig } from './settings';
export type { SettingsTabsProps } from './settings';
export type { TabContentProps } from './settings';
export type { UserSettingsPageState } from './settings';

export { SETTINGS_TABS } from './settings';
export { DEFAULT_SETTINGS_TAB } from './settings';
export { SETTINGS_TAB_CONFIG } from './settings';
export { validateTabId } from './settings';
```
