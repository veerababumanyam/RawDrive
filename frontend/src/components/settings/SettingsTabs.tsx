/**
 * SettingsTabs Component
 *
 * Settings-specific implementation of Tabs with predefined configuration.
 * Uses the reusable Tabs component with settings tab definitions.
 */

import {
  User,
} from 'lucide-react';
import { Tabs, type TabItem } from '../ui/Tabs';
import type { SettingsTabId, SettingsTabConfig } from '../../types/settings';

/**
 * Full tab configuration array with icons and descriptions
 * Consolidated to single profile tab - public visibility is controlled via toggle within the profile
 */
export const SETTINGS_TAB_CONFIG: SettingsTabConfig[] = [
  {
    id: 'profile',
    label: 'Profile',
    icon: User,
    description: 'Manage your profile and public visibility',
  },
];

export interface SettingsTabsProps {
  /** Currently active tab */
  activeTab: SettingsTabId;
  /** Callback when tab changes */
  onTabChange: (tabId: SettingsTabId) => void;
  /** Optional CSS classes */
  className?: string;
}

export function SettingsTabs({
  activeTab,
  onTabChange,
  className = '',
}: SettingsTabsProps) {
  // Convert SettingsTabConfig to TabItem for the Tabs component
  // Cast the icon type to match TabItem interface
  const tabItems: TabItem<SettingsTabId>[] = SETTINGS_TAB_CONFIG.map((config) => ({
    id: config.id,
    label: config.label,
    icon: config.icon as React.ComponentType<{ size?: number; className?: string }>,
    isDanger: config.isDanger,
  }));

  return (
    <Tabs<SettingsTabId>
      tabs={tabItems}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel="Settings sections"
      className={`bg-surface ${className}`}
      size="md"
      iconsOnlyMobile
    />
  );
}

export default SettingsTabs;
