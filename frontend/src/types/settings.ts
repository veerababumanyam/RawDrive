/**
 * Settings Tab Types and Configuration
 *
 * Centralized type definitions for the user settings tabbed navigation.
 * Used by UserSettingsPage, SettingsTabs, and tab content components.
 */

import type { LucideIcon } from 'lucide-react';

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
 * Default tab when none specified or invalid
 */
export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'profile';

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
 * Validates a tab ID from URL parameters
 * @param tabId - The tab ID to validate (from URL query string)
 * @returns Valid SettingsTabId or default 'profile'
 */
export function validateTabId(tabId: string | null): SettingsTabId {
  if (tabId && SETTINGS_TABS.includes(tabId as SettingsTabId)) {
    return tabId as SettingsTabId;
  }
  return DEFAULT_SETTINGS_TAB;
}

/**
 * Props interface for tab content components
 */
export interface TabContentProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * State interface for UserSettingsPage component
 */
export interface UserSettingsPageState {
  /** Current active tab from URL params */
  activeTab: SettingsTabId;
  /** Whether any tab has unsaved changes (for navigation warning) */
  hasUnsavedChanges: boolean;
}
