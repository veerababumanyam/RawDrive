import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { User, Shield, Bell, Lock, AlertCircle, Building2 } from 'lucide-react';
import { BasicProfileTab } from '../../components/settings/BasicProfileTab';
import SecuritySettingsPage from './SecuritySettingsPage';
import NotificationSettingsPage from './NotificationSettingsPage';
import PrivacySettingsPage from './PrivacySettingsPage';
import AccountSettingsPage from './AccountSettingsPage';
import { ScopeIndicator } from '../../components/settings/ScopeIndicator';
import { CrossLinkCard } from '../../components/settings/CrossLinkCard';
import { SettingsSectionDivider } from '../../components/settings/SettingsSectionDivider';

/* =============================================================================
   Account Settings Hub Component
   ============================================================================= */

/**
 * Account Settings Hub
 *
 * Tabbed interface for managing personal account settings with unified scope indicators.
 * Includes cross-links to related workspace settings for easy navigation.
 *
 * Tabs:
 * - Profile: Display name, email, phone, timezone, bio, avatar
 * - Security: Password, 2FA, active sessions
 * - Notifications: Email and in-app notification preferences
 * - Privacy: Data sharing, analytics, visibility preferences
 * - Account: Account deletion, export data
 *
 * Features:
 * - Scope indicator showing "Personal Settings" context
 * - Quick switcher to Workspace Settings
 * - Cross-links to related workspace settings
 */

type TabId = 'profile' | 'security' | 'notifications' | 'privacy' | 'account';

const AccountSettingsHub: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabId } = useParams<{ tabId: string }>();
  const navigate = useNavigate();

  // Initialize tab from URL path param, query param, or default
  const urlTab = tabId || searchParams.get('tab');
  const initialTab: TabId =
    urlTab && ['profile', 'security', 'notifications', 'privacy', 'account'].includes(urlTab)
      ? (urlTab as TabId)
      : 'profile';
  const [activeTab, setActiveTabState] = useState<TabId>(initialTab);

  // Sync state with URL
  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    if (tabId) {
      navigate(`/settings/${tab}`);
    } else {
      setSearchParams({ tab });
    }
  };

  // Listen for URL changes
  useEffect(() => {
    const queryTab = searchParams.get('tab');
    const urlTab = (tabId as string) || queryTab;
    const currentTab = (urlTab as TabId);
    const validTabs: TabId[] = ['profile', 'security', 'notifications', 'privacy', 'account'];

    if (currentTab && validTabs.includes(currentTab) && currentTab !== activeTab) {
      setActiveTabState(currentTab);
    }
  }, [searchParams, tabId, activeTab, navigate, setSearchParams]);

  const tabs = [
    { id: 'profile' as TabId, label: 'Profile', icon: User },
    { id: 'security' as TabId, label: 'Security', icon: Shield },
    { id: 'notifications' as TabId, label: 'Notifications', icon: Bell },
    { id: 'privacy' as TabId, label: 'Privacy', icon: Lock },
    { id: 'account' as TabId, label: 'Account', icon: AlertCircle },
  ];

  // Tab content components
  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return <BasicProfileTab />;
      case 'security':
        return (
          <>
            <SecuritySettingsPage />
            <SettingsSectionDivider label="Related Settings" />
            <CrossLinkCard
              title="Workspace Security Policies"
              description="Configure 2FA requirements and session timeouts for all team members"
              icon={<Building2 size={16} />}
              path="/workspace/settings?tab=security"
            />
          </>
        );
      case 'notifications':
        return (
          <>
            <NotificationSettingsPage />
            <SettingsSectionDivider label="Related Settings" />
            <CrossLinkCard
              title="Workspace Notifications"
              description="Manage team-wide notification rules and quiet hours"
              icon={<Building2 size={16} />}
              path="/workspace/settings?tab=notifications"
            />
          </>
        );
      case 'privacy':
        return <PrivacySettingsPage />;
      case 'account':
        return <AccountSettingsPage />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Main Content Column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col h-auto py-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                    Settings
                  </h1>
                  <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                    Manage your account, security, notifications, and preferences.
                  </p>
                </div>
              </div>

              {/* Scope Indicator */}
              <div className="mb-4">
                <ScopeIndicator scope="personal" showSwitcher />
              </div>

              {/* Tabs */}
              <div className="flex space-x-1 overflow-x-auto no-scrollbar border-b border-white/10">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-all duration-200 whitespace-nowrap relative
                        ${
                          isActive
                            ? 'text-text-primary'
                            : 'text-text-secondary hover:text-text-primary'
                        }
                      `}
                    >
                      <Icon size={16} />
                      <span>{tab.label}</span>
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-primary/80 to-transparent rounded-t-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSettingsHub;
