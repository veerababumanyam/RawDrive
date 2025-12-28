/**
 * UserSettingsPage
 *
 * Container page for all user settings with tabbed navigation.
 * Uses URL query parameters (?tab=security) for tab state.
 * Replaces the old SettingsLayout sidebar navigation.
 */

import { useSearchParams } from 'react-router-dom';
import { Settings } from 'lucide-react';
import {
  SettingsTabs,
  ProfileTabContent,
  SecurityTabContent,
  NotificationsTabContent,
  PrivacyTabContent,
  AITabContent,
  SubscriptionTabContent,
  AccountTabContent,
} from '../../components/settings';
import { TabPanel } from '../../components/ui/TabPanel';
import { validateTabId, type SettingsTabId } from '../../types/settings';

export function UserSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read and validate tab from URL
  const tabParam = searchParams.get('tab');
  const activeTab = validateTabId(tabParam);

  // Update URL when tab changes
  const handleTabChange = (tabId: SettingsTabId) => {
    setSearchParams({ tab: tabId }, { replace: true });
  };

  return (
    <div className="min-h-full">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-primary/10">
            <Settings size={24} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
            <p className="text-text-secondary">
              Manage your account preferences and settings
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <SettingsTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        className="mb-6"
      />

      {/* Tab Content */}
      <div className="py-2">
        <TabPanel tabId="profile" isActive={activeTab === 'profile'}>
          <ProfileTabContent />
        </TabPanel>

        <TabPanel tabId="security" isActive={activeTab === 'security'}>
          <SecurityTabContent />
        </TabPanel>

        <TabPanel tabId="notifications" isActive={activeTab === 'notifications'}>
          <NotificationsTabContent />
        </TabPanel>

        <TabPanel tabId="privacy" isActive={activeTab === 'privacy'}>
          <PrivacyTabContent />
        </TabPanel>

        <TabPanel tabId="ai" isActive={activeTab === 'ai'}>
          <AITabContent />
        </TabPanel>

        <TabPanel tabId="subscription" isActive={activeTab === 'subscription'}>
          <SubscriptionTabContent />
        </TabPanel>

        <TabPanel tabId="account" isActive={activeTab === 'account'}>
          <AccountTabContent />
        </TabPanel>
      </div>
    </div>
  );
}

export default UserSettingsPage;
