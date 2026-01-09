import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowRight } from 'lucide-react';

interface Props {
    workspaceId: string;
}

export const WorkspaceAccountTabContent: React.FC<Props> = ({ workspaceId }) => {
    const { t } = useTranslation('settings');

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h2 className="text-lg font-semibold text-text-primary mb-1">
                    Account Management
                </h2>
                <p className="text-sm text-text-secondary">
                    Manage your workspace account settings and preferences.
                </p>
            </div>

            <div className="bg-surface border border-border/50 rounded-xl p-6">
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Shield className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-semibold text-text-primary mb-1">Workspace Deletion</h3>
                        <p className="text-sm text-text-secondary mb-4">
                            Workspace deletion and security settings have been moved to the Security tab for better organization.
                        </p>
                        <a
                            href="/workspace/settings?tab=security"
                            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
                        >
                            Go to Security Settings
                            <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
