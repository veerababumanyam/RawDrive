import React, { useEffect, useState } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, Shield, Bell, Webhook, CreditCard, ScanFace, Palette, User } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { WorkspaceAISettingsPanel } from '../../../components/workspace/settings/WorkspaceAISettingsPanel';
import { WorkspaceSecuritySettingsPanel } from '../../../components/workspace/settings/WorkspaceSecuritySettingsPanel';
import { WorkspaceNotificationSettingsPanel } from '../../../components/workspace/settings/WorkspaceNotificationSettingsPanel';
import { WebhooksSettingsPanel } from '../../../components/workspace/settings/WebhooksSettingsPanel';
import { BiometricSettingsPanel } from '../../../components/workspace/settings/BiometricSettingsPanel';
import { WorkspaceSubscriptionTabContent } from '../../../components/workspace/settings/WorkspaceSubscriptionTabContent';
import { ScopeIndicator } from '../../../components/settings/ScopeIndicator';
import { CrossLinkCard } from '../../../components/settings/CrossLinkCard';
import { SettingsSectionDivider } from '../../../components/settings/SettingsSectionDivider';

// NOTE: Company profile management has been moved to /workspace/branding
// This hub now handles only technical workspace settings

type TabId = 'subscription' | 'ai' | 'security' | 'biometrics' | 'notifications' | 'webhooks';

const WorkspaceSettingsHub: React.FC = () => {
    const { t } = useTranslation('settings');
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const { tabId } = useParams<{ tabId: string }>();
    const navigate = useNavigate();

    // Initialize tab from URL path param, query param, or default
    // Redirect 'account' tab to 'security' since deletion was moved there
    const urlTab = tabId || searchParams.get('tab');
    const normalizedTab = urlTab === 'account' ? 'security' : urlTab;
    const initialTab: TabId = (normalizedTab && ['subscription', 'ai', 'security', 'biometrics', 'notifications', 'webhooks'].includes(normalizedTab))
        ? (normalizedTab as TabId)
        : 'subscription';
    const [activeTab, setActiveTabState] = useState<TabId>(initialTab);

    // Sync state with URL
    const setActiveTab = (tab: TabId) => {
        setActiveTabState(tab);
        // Prefer query params for internal navigation to avoid routing complexity conflicts
        // unless we want to commit to path-based routing.
        // For now, let's standardize on query params for navigation actions
        // but normalize path params if they exist.
        if (tabId) {
            // If we are on a path-based route, navigate to the new path
            navigate(`/workspace/settings/${tab}`);
        } else {
            setSearchParams({ tab });
        }
    };

    // Listen for URL changes and handle account tab redirect
    useEffect(() => {
        const queryTab = searchParams.get('tab');
        const urlTab = (tabId as string) || queryTab;

        // Redirect 'account' tab to 'security' since deletion was moved there
        if (urlTab === 'account') {
            if (tabId) {
                navigate('/workspace/settings/security', { replace: true });
            } else {
                setSearchParams({ tab: 'security' }, { replace: true });
            }
            setActiveTabState('security');
            return;
        }

        const currentTab = (urlTab as TabId);
        const validTabs: TabId[] = ['subscription', 'ai', 'security', 'biometrics', 'notifications', 'webhooks'];

        if (currentTab && validTabs.includes(currentTab) && currentTab !== activeTab) {
            setActiveTabState(currentTab);
        }
    }, [searchParams, tabId, activeTab, navigate, setSearchParams]);

    const workspaceId = user?.workspace_id;

    if (!workspaceId) {
        return <div className="p-8 text-center text-text-secondary">No workspace selected.</div>;
    }

    const tabs = [
        { id: 'subscription' as TabId, label: 'Subscription', icon: CreditCard },
        { id: 'ai' as TabId, label: 'AI & Intelligence', icon: Sparkles },
        { id: 'security' as TabId, label: 'Security & Privacy', icon: Shield },
        { id: 'biometrics' as TabId, label: 'Biometrics', icon: ScanFace },
        { id: 'notifications' as TabId, label: 'Notifications', icon: Bell },
        { id: 'webhooks' as TabId, label: 'Webhooks', icon: Webhook },
    ];

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
                                        Workspace Settings
                                    </h1>
                                    <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                        Manage your workspace preferences, security, and integrations.
                                    </p>
                                </div>
                            </div>

                            {/* Scope Indicator */}
                            <div className="mb-4">
                                <ScopeIndicator scope="workspace" showSwitcher />

                                {/* Quick Links to Related Pages */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    <CrossLinkCard
                                        title="Workspace Branding"
                                        description="Manage company profile, logo, and brand identity"
                                        icon={<Palette size={16} />}
                                        path="/workspace/branding"
                                    />
                                </div>
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
                                                ${isActive
                                                    ? 'text-primary'
                                                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}
                                            `}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : 'text-text-tertiary group-hover:text-text-secondary'}`} />
                                            {tab.label}
                                            {isActive && (
                                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_-2px_8px_rgba(var(--primary-rgb),0.5)]" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content Area */}
                <main className="flex-1 overflow-auto">
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                        <div className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6 min-h-[500px]">
                            {activeTab === 'subscription' && <WorkspaceSubscriptionTabContent workspaceId={workspaceId} />}
                            {activeTab === 'ai' && <WorkspaceAISettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'security' && (
                                <>
                                    <WorkspaceSecuritySettingsPanel workspaceId={workspaceId} />
                                    <SettingsSectionDivider label="Related Settings" />
                                    <CrossLinkCard
                                        title="Personal Security Settings"
                                        description="Manage your password, 2FA, and active sessions"
                                        icon={<User size={16} />}
                                        path="/settings?tab=security"
                                    />
                                </>
                            )}
                            {activeTab === 'biometrics' && <BiometricSettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'notifications' && (
                                <>
                                    <WorkspaceNotificationSettingsPanel workspaceId={workspaceId} />
                                    <SettingsSectionDivider label="Related Settings" />
                                    <CrossLinkCard
                                        title="Personal Notification Preferences"
                                        description="Customize your individual notification settings"
                                        icon={<User size={16} />}
                                        path="/settings?tab=notifications"
                                    />
                                </>
                            )}
                            {activeTab === 'webhooks' && <WebhooksSettingsPanel workspaceId={workspaceId} />}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default WorkspaceSettingsHub;
