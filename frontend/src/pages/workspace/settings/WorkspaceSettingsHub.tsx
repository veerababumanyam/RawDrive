import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Sparkles, Shield, Bell, Webhook, CreditCard, ScanFace } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { CompanyProfileForm, type ProfileFormChangeData } from '../../../components/features/settings/CompanyProfileForm';
import { CompanyProfilePreview } from '../../../components/features/settings/CompanyProfilePreview';
import type { CompanyProfile, CompanyVisibilityConfig } from '../../../types/companyProfile';
import type { Theme, ThemeCustomization } from '../../../types/profileEditor';
import { WorkspaceAISettingsPanel } from '../../../components/workspace/settings/WorkspaceAISettingsPanel';
import { WorkspaceSecuritySettingsPanel } from '../../../components/workspace/settings/WorkspaceSecuritySettingsPanel';
import { WorkspaceNotificationSettingsPanel } from '../../../components/workspace/settings/WorkspaceNotificationSettingsPanel';
import { WebhooksSettingsPanel } from '../../../components/workspace/settings/WebhooksSettingsPanel';
import { BiometricSettingsPanel } from '../../../components/workspace/settings/BiometricSettingsPanel';

import { WorkspaceSubscriptionTabContent } from '../../../components/workspace/settings/WorkspaceSubscriptionTabContent';

// Extended profile type for preview with theme data
interface PreviewProfile extends Partial<CompanyProfile> {
    _theme?: Theme | null;
    _themeCustomization?: Partial<ThemeCustomization> | null;
}

type TabId = 'profile' | 'subscription' | 'ai' | 'security' | 'biometrics' | 'notifications' | 'webhooks';

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
    const initialTab: TabId = (normalizedTab && ['profile', 'subscription', 'ai', 'security', 'biometrics', 'notifications', 'webhooks'].includes(normalizedTab))
        ? (normalizedTab as TabId)
        : 'profile';
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
        const validTabs: TabId[] = ['profile', 'subscription', 'ai', 'security', 'biometrics', 'notifications', 'webhooks'];
        
        if (currentTab && validTabs.includes(currentTab) && currentTab !== activeTab) {
            setActiveTabState(currentTab);
        }
    }, [searchParams, tabId, activeTab, navigate, setSearchParams]);

    // Preview state
    const [previewProfile, setPreviewProfile] = useState<PreviewProfile | null>(null);
    const [visibility, setVisibility] = useState<Partial<CompanyVisibilityConfig>>({});

    const workspaceId = user?.workspace_id;

    if (!workspaceId) {
        return <div className="p-8 text-center text-text-secondary">No workspace selected.</div>;
    }

    const handleProfileChange = (data: ProfileFormChangeData) => {
        const profile: PreviewProfile = {
            name: data.name,
            tagline: data.tagline,
            slug: data.slug,
            logo_url: data._previewLogoUrl || data.logo_url,
            brand_color: data.brand_color,
            email: data.email,
            phone: data.phone,
            website: data.website,
            address_structured: data.address_structured,
            socials: data.socials || {},
            custom_links: data.custom_links || [],
            _theme: data._theme,
            _themeCustomization: data._themeCustomization,
        };
        setPreviewProfile(profile);
        setVisibility(data.company_visibility || {});
    };

    const tabs = [
        { id: 'profile' as TabId, label: 'Company Profile', icon: Building2 },
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
                                        Manage your workspace profile, preferences, and security.
                                    </p>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex space-x-1 overflow-x-auto no-scrollbar border-b border-border/50">
                                {tabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`
                                                flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap
                                                ${isActive
                                                    ? 'bg-surface text-primary border-b-2 border-primary'
                                                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover/50'}
                                            `}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-primary' : ''}`} />
                                            {tab.label}
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
                            {activeTab === 'profile' && (
                                <CompanyProfileForm onProfileChange={handleProfileChange} />
                            )}
                            {activeTab === 'subscription' && <WorkspaceSubscriptionTabContent workspaceId={workspaceId} />}
                            {activeTab === 'ai' && <WorkspaceAISettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'security' && <WorkspaceSecuritySettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'biometrics' && <BiometricSettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'notifications' && <WorkspaceNotificationSettingsPanel workspaceId={workspaceId} />}
                            {activeTab === 'webhooks' && <WebhooksSettingsPanel workspaceId={workspaceId} />}
                        </div>
                    </div>
                </main>
            </div>

            {/* Preview Panel - Only for Profile Tab */}
            {activeTab === 'profile' && (
                <div className="hidden lg:flex lg:flex-col w-[450px] border-l border-border/50 bg-gradient-to-br from-surface-hover/50 to-surface/30 backdrop-blur-sm overflow-hidden transition-all">
                    <div className="p-4 border-b border-border/50 glass-premium">
                        <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-gradient-to-r from-primary to-accent animate-pulse" />
                            Live Preview
                        </h2>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <CompanyProfilePreview
                            profile={previewProfile}
                            visibility={visibility}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkspaceSettingsHub;
