/**
 * SettingsTabs Component
 *
 * Settings-specific implementation of Tabs with predefined configuration.
 * Uses the reusable Tabs component with settings tab definitions.
 */

import {
  User,
  Shield,
  Bell,
  Lock,
  Sparkles,
  CreditCard,
  Trash2,
} from 'lucide-react';
import { Tabs, type TabItem } from '../ui/Tabs';
import type { SettingsTabId, SettingsTabConfig } from '../../types/settings';

/**
 * Full tab configuration array with icons and descriptions
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
