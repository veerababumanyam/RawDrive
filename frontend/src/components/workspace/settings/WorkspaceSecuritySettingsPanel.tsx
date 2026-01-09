import React, { useState } from 'react';
import { Shield, Smartphone, Clock, Database, BarChart3, Search } from 'lucide-react';
import { useWorkspaceSecuritySettings, useWorkspacePrivacySettings } from '../../../hooks/useWorkspaceSettings';
import { Loader2 } from 'lucide-react';

interface WorkspaceSecuritySettingsPanelProps {
    workspaceId: string;
}

export const WorkspaceSecuritySettingsPanel: React.FC<WorkspaceSecuritySettingsPanelProps> = ({ workspaceId }) => {
    const { settings, loading, error, update } = useWorkspaceSecuritySettings(workspaceId);
    const { settings: privacySettings, loading: privacyLoading, error: privacyError, update: updatePrivacy } = useWorkspacePrivacySettings(workspaceId);
    const [updating, setUpdating] = useState(false);

    const handleToggle2FA = async () => {
        if (!settings) return;
        setUpdating(true);
        try {
            await update({ require_2fa: !settings.require_2fa });
        } finally {
            setUpdating(false);
        }
    };

    const handleSessionTimeoutChange = async (minutes: number) => {
        if (!settings) return;
        setUpdating(true);
        try {
            await update({ session_timeout_minutes: minutes });
        } finally {
            setUpdating(false);
        }
    };

    const handlePrivacyToggle = async (key: 'analytics_enabled' | 'public_profile_enabled' | 'gdpr_compliance_mode' | 'search_engine_indexing_enabled') => {
        if (!privacySettings) return;
        setUpdating(true);
        try {
            await updatePrivacy({ [key]: !privacySettings[key] });
        } finally {
            setUpdating(false);
        }
    };

    if ((loading || privacyLoading) && (!settings || !privacySettings)) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
            </div>
        );
    }

    if ((error && !settings) || (privacyError && !privacySettings)) {
        return <div className="text-error">Failed to load settings</div>;
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-3">
                    <Shield className="w-7 h-7 text-accent" />
                    Security & Privacy Settings
                </h1>
                <p className="text-text-secondary mt-1">
                    Manage access controls, security policies, and privacy settings for your workspace.
                </p>
            </div>

            <div className="space-y-6">
                {/* 2FA Section */}
                <div className="bg-surface rounded-2xl border border-border p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg h-fit">
                                <Smartphone className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-text-primary">Two-Factor Authentication</h3>
                                <p className="text-sm text-text-secondary mt-1">
                                    Require all workspace members to use 2FA for their accounts.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                role="switch"
                                aria-checked={settings?.require_2fa}
                                aria-label={settings?.require_2fa ? 'Disable 2FA requirement' : 'Enable 2FA requirement'}
                                onClick={handleToggle2FA}
                                disabled={updating}
                                className={`
                                    relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
                                    border-2 border-transparent transition-colors duration-200 ease-in-out
                                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                                    disabled:cursor-not-allowed disabled:opacity-50
                                    ${settings?.require_2fa ? 'bg-primary' : 'bg-border'}
                                `}
                            >
                                <span
                                    className={`
                                        pointer-events-none inline-block h-5 w-5 transform rounded-full
                                        bg-white shadow ring-0 transition duration-200 ease-in-out
                                        ${settings?.require_2fa ? 'translate-x-5' : 'translate-x-0'}
                                    `}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Session Timeout */}
                <div className="bg-surface rounded-2xl border border-border p-6">
                    <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                            <div className="p-2 bg-primary/10 rounded-lg h-fit">
                                <Clock className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-text-primary">Session Timeout</h3>
                                <p className="text-sm text-text-secondary mt-1">
                                    Automatically log out inactive users after a set period.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                disabled={updating}
                                value={settings?.session_timeout_minutes || 1440}
                                onChange={(e) => handleSessionTimeoutChange(parseInt(e.target.value))}
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary focus:ring-primary sm:text-sm bg-surface-hover text-text-primary p-2 border"
                            >
                                <option value={15}>15 Minutes</option>
                                <option value={30}>30 Minutes</option>
                                <option value={60}>1 Hour</option>
                                <option value={1440}>24 Hours</option>
                                <option value={10080}>7 Days</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Privacy Settings Section */}
                <div className="bg-surface rounded-2xl border border-border p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Shield className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-text-primary">Privacy & Data Collection</h3>
                            <p className="text-sm text-text-secondary mt-1">
                                Control how your workspace data is collected and used.
                            </p>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <ToggleRow
                            label="Analytics Data Collection"
                            description="Allow collection of anonymous usage data to improve the platform."
                            icon={<BarChart3 className="w-5 h-5" />}
                            checked={!!privacySettings?.analytics_enabled}
                            onChange={() => handlePrivacyToggle('analytics_enabled')}
                            disabled={updating}
                        />
                        <ToggleRow
                            label="GDPR Compliance Mode"
                            description="Enable strict data protection features for GDPR compliance."
                            icon={<Database className="w-5 h-5" />}
                            checked={!!privacySettings?.gdpr_compliance_mode}
                            onChange={() => handlePrivacyToggle('gdpr_compliance_mode')}
                            disabled={updating}
                        />
                        <ToggleRow
                            label="Search Engine Indexing"
                            description="Allow search engines (Google, Bing, etc.) to index and display your company profile in search results."
                            icon={<Search className="w-5 h-5" />}
                            checked={!!privacySettings?.search_engine_indexing_enabled}
                            onChange={() => handlePrivacyToggle('search_engine_indexing_enabled')}
                            disabled={updating}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
};

interface ToggleRowProps {
    label: string;
    description: string;
    icon: React.ReactNode;
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ label, description, icon, checked, onChange, disabled }) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
        <div className="flex items-start gap-3 flex-1">
            <div className="text-text-tertiary mt-0.5">{icon}</div>
            <div className="flex-1">
                <div className="font-medium text-text-primary">{label}</div>
                <div className="text-sm text-text-secondary mt-0.5">{description}</div>
            </div>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={checked ? `Disable ${label.toLowerCase()}` : `Enable ${label.toLowerCase()}`}
            onClick={onChange}
            disabled={disabled}
            className={`
                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
                border-2 border-transparent transition-colors duration-200 ease-in-out
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
                disabled:cursor-not-allowed disabled:opacity-50
                ${checked ? 'bg-primary' : 'bg-border'}
            `}
        >
            <span
                className={`
                    pointer-events-none inline-block h-5 w-5 transform rounded-full
                    bg-white shadow ring-0 transition duration-200 ease-in-out
                    ${checked ? 'translate-x-5' : 'translate-x-0'}
                `}
            />
        </button>
    </div>
);
