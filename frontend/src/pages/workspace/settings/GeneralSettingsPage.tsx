/**
 * General Settings Page
 * 
 * User preferences including language selection, appearance, and notifications.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Palette, Bell, Shield } from 'lucide-react';
import { LanguageSelector } from '../../../components/settings/LanguageSelector';

const GeneralSettingsPage: React.FC = () => {
    const { t } = useTranslation('settings');

    return (
        <div className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-text-primary">
                    {t('title')}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                    {t('description', { defaultValue: 'Manage your account preferences and settings' })}
                </p>
            </div>

            {/* Settings Sections */}
            <div className="space-y-8">
                {/* Language & Region */}
                <section className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-primary/10">
                            <Globe size={24} className="text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">
                                {t('language.title')}
                            </h2>
                            <p className="text-sm text-text-secondary mt-0.5">
                                {t('language.description')}
                            </p>
                        </div>
                    </div>

                    <LanguageSelector />
                </section>

                {/* Appearance */}
                <section className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-accent/10">
                            <Palette size={24} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">
                                {t('appearance.title')}
                            </h2>
                            <p className="text-sm text-text-secondary mt-0.5">
                                {t('appearance.description')}
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button className="flex-1 p-4 rounded-xl border-2 border-primary bg-primary/5 text-center transition-all hover:shadow-md">
                            <div className="w-full h-8 rounded-lg bg-white border border-gray-200 mb-2"></div>
                            <span className="text-sm font-medium text-text-primary">{t('appearance.lightTheme')}</span>
                        </button>
                        <button className="flex-1 p-4 rounded-xl border-2 border-border hover:border-primary/50 text-center transition-all hover:shadow-md">
                            <div className="w-full h-8 rounded-lg bg-gray-800 border border-gray-700 mb-2"></div>
                            <span className="text-sm font-medium text-text-primary">{t('appearance.darkTheme')}</span>
                        </button>
                        <button className="flex-1 p-4 rounded-xl border-2 border-border hover:border-primary/50 text-center transition-all hover:shadow-md">
                            <div className="w-full h-8 rounded-lg bg-gradient-to-r from-white to-gray-800 border border-gray-300 mb-2"></div>
                            <span className="text-sm font-medium text-text-primary">{t('appearance.systemTheme')}</span>
                        </button>
                    </div>
                </section>

                {/* Notifications */}
                <section className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-warning/10">
                            <Bell size={24} className="text-warning" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">
                                {t('notifications.title')}
                            </h2>
                            <p className="text-sm text-text-secondary mt-0.5">
                                {t('notifications.description')}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <ToggleRow
                            label={t('notifications.email')}
                            description={t('notifications.emailDescription', { defaultValue: 'Receive important updates via email' })}
                            defaultChecked={true}
                        />
                        <ToggleRow
                            label={t('notifications.galleryViews')}
                            description={t('notifications.galleryViewsDescription', { defaultValue: 'Get notified when someone views your gallery' })}
                            defaultChecked={true}
                        />
                        <ToggleRow
                            label={t('notifications.downloads')}
                            description={t('notifications.downloadsDescription', { defaultValue: 'Get notified when photos are downloaded' })}
                            defaultChecked={false}
                        />
                        <ToggleRow
                            label={t('notifications.comments')}
                            description={t('notifications.commentsDescription', { defaultValue: 'Get notified about new comments' })}
                            defaultChecked={true}
                        />
                    </div>
                </section>

                {/* Privacy */}
                <section className="bg-surface rounded-2xl border border-border p-6 shadow-sm">
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-3 rounded-xl bg-error/10">
                            <Shield size={24} className="text-error" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-text-primary">
                                {t('privacy.title')}
                            </h2>
                            <p className="text-sm text-text-secondary mt-0.5">
                                {t('privacy.description')}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <ToggleRow
                            label={t('privacy.publicProfile')}
                            description={t('privacy.publicProfileDescription', { defaultValue: 'Allow others to view your public profile' })}
                            defaultChecked={true}
                        />
                        <ToggleRow
                            label={t('privacy.analytics')}
                            description={t('privacy.analyticsDescription', { defaultValue: 'Help improve RawDrive with anonymous usage data' })}
                            defaultChecked={true}
                        />
                    </div>
                </section>
            </div>
        </div>
    );
};

interface ToggleRowProps {
    label: string;
    description: string;
    defaultChecked?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = React.memo(({ label, description, defaultChecked = false }) => {
    const [checked, setChecked] = React.useState(defaultChecked);

    return (
        <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
            <div>
                <div className="font-medium text-text-primary">{label}</div>
                <div className="text-sm text-text-tertiary">{description}</div>
            </div>
            <button
                onClick={() => setChecked(!checked)}
                className={`
          relative w-12 h-6 rounded-full transition-colors duration-200
          ${checked ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}
        `}
                role="switch"
                aria-checked={checked}
            >
                <span
                    className={`
            absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm
            transition-transform duration-200
            ${checked ? 'left-7' : 'left-1'}
          `}
                />
            </button>
        </div>
    );
});

export default GeneralSettingsPage;
