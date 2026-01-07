/**
 * General Settings Page
 *
 * User preferences including language selection, appearance, and notifications.
 * Uses centralized design system classes for consistent styling.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Palette, Bell, Shield, Settings, Keyboard, X } from 'lucide-react';
import { LanguageSelector } from '../../../components/settings/LanguageSelector';

const GeneralSettingsPage: React.FC = () => {
    const { t } = useTranslation('settings');
    const [showKeyboardModal, setShowKeyboardModal] = useState(false);

    return (
        <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Page Header */}
            <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex-1 min-w-0">
                            <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                                <div className="section-header-icon icon-container-accent">
                                    <Settings className="w-5 h-5" />
                                </div>
                                {t('title')}
                            </h1>
                            <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                                {t('description', { defaultValue: 'Manage your account preferences and settings' })}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <main className="max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
                {/* Settings Sections */}
                <div className="space-y-6 sm:space-y-8">
                    {/* Language & Region */}
                    <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="icon-container icon-container-lg icon-container-primary rounded-xl shadow-lg">
                                <Globe size={22} />
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
                    <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="icon-container icon-container-lg icon-container-accent rounded-xl shadow-lg">
                                <Palette size={22} />
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
                            <button className="group flex-1 glass-list-item p-4 rounded-xl border-2 border-primary bg-primary/5 text-center transition-all hover:shadow-lg">
                                <div className="w-full h-8 rounded-lg bg-white border border-gray-200 mb-2 shadow-sm group-hover:shadow-md transition-shadow"></div>
                                <span className="text-sm font-medium text-text-primary">{t('appearance.lightTheme')}</span>
                            </button>
                            <button className="group flex-1 glass-list-item p-4 rounded-xl border-2 border-border hover:border-primary/50 text-center transition-all hover:shadow-lg">
                                <div className="w-full h-8 rounded-lg bg-gray-800 border border-gray-700 mb-2 shadow-sm group-hover:shadow-md transition-shadow"></div>
                                <span className="text-sm font-medium text-text-primary">{t('appearance.darkTheme')}</span>
                            </button>
                            <button className="group flex-1 glass-list-item p-4 rounded-xl border-2 border-border hover:border-primary/50 text-center transition-all hover:shadow-lg">
                                <div className="w-full h-8 rounded-lg bg-gradient-to-r from-white to-gray-800 border border-gray-300 mb-2 shadow-sm group-hover:shadow-md transition-shadow"></div>
                                <span className="text-sm font-medium text-text-primary">{t('appearance.systemTheme')}</span>
                            </button>
                        </div>
                    </section>

                    {/* Notifications */}
                    <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="icon-container icon-container-lg icon-container-warning rounded-xl shadow-lg">
                                <Bell size={22} />
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

                        <div className="space-y-1">
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
                    <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="icon-container icon-container-lg icon-container-error rounded-xl shadow-lg">
                                <Shield size={22} />
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

                        <div className="space-y-1">
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

                    {/* Keyboard Shortcuts */}
                    <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
                        <div className="flex items-start gap-4 mb-6">
                            <div className="icon-container icon-container-lg icon-container-success rounded-xl shadow-lg">
                                <Keyboard size={22} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-text-primary">
                                    Keyboard Shortcuts
                                </h2>
                                <p className="text-sm text-text-secondary mt-0.5">
                                    Speed up your workflow with keyboard shortcuts
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between py-3 px-3 -mx-3 rounded-xl bg-surface-hover/50">
                            <div>
                                <div className="font-medium text-text-primary">View all shortcuts</div>
                                <div className="text-sm text-text-tertiary">Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-surface-hover border border-border rounded">?</kbd> anywhere to open</div>
                            </div>
                            <button
                                onClick={() => setShowKeyboardModal(true)}
                                className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-600 transition-colors shadow-sm"
                            >
                                Open Shortcuts
                            </button>
                        </div>
                    </section>
                </div>
            </main>

            {/* Keyboard Shortcuts Modal */}
            {showKeyboardModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowKeyboardModal(false)}>
                    <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-gradient">Keyboard Shortcuts</h2>
                            <button onClick={() => setShowKeyboardModal(false)} className="p-2 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <ShortcutRow keys={['?']} description="Show this help" />
                            <ShortcutRow keys={['G', 'D']} description="Go to Dashboard" />
                            <ShortcutRow keys={['G', 'G']} description="Go to Galleries" />
                            <ShortcutRow keys={['G', 'C']} description="Go to Clients" />
                            <ShortcutRow keys={['G', 'P']} description="Go to People" />
                            <ShortcutRow keys={['N']} description="Create New Gallery" />
                            <ShortcutRow keys={['/', 'Ctrl', 'K']} description="Search" />
                            <ShortcutRow keys={['Esc']} description="Close modal / Cancel" />
                        </div>
                        <p className="text-xs text-text-tertiary mt-6 text-center">Press <kbd className="px-1 py-0.5 text-xs font-mono bg-surface-hover border border-border rounded">Esc</kbd> to close</p>
                    </div>
                </div>
            )}
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
        <div className="group row-hover flex items-center justify-between py-4 px-3 -mx-3 rounded-xl">
            <div>
                <div className="font-medium text-text-primary group-hover:text-primary transition-colors">{label}</div>
                <div className="text-sm text-text-tertiary">{description}</div>
            </div>
            <button
                onClick={() => setChecked(!checked)}
                className={`
                    relative w-12 h-6 rounded-full transition-all duration-300 shadow-inner
                    ${checked
                        ? 'bg-gradient-to-r from-primary to-accent shadow-primary/20'
                        : 'bg-gray-300 dark:bg-gray-600'}
                `}
                role="switch"
                aria-checked={checked}
            >
                <span
                    className={`
                        absolute top-1 w-4 h-4 rounded-full bg-white shadow-md
                        transition-all duration-300
                        ${checked ? 'left-7 shadow-primary/30' : 'left-1'}
                    `}
                />
            </button>
        </div>
    );
});

interface ShortcutRowProps {
    keys: string[];
    description: string;
}

const ShortcutRow: React.FC<ShortcutRowProps> = ({ keys, description }) => (
    <div className="flex items-center justify-between py-2">
        <span className="text-text-secondary">{description}</span>
        <div className="flex items-center gap-1">
            {keys.map((key, i) => (
                <React.Fragment key={key}>
                    <kbd className="px-2 py-1 text-xs font-mono font-semibold bg-surface-hover border border-border rounded shadow-sm text-text-primary">{key}</kbd>
                    {i < keys.length - 1 && <span className="text-text-tertiary">+</span>}
                </React.Fragment>
            ))}
        </div>
    </div>
);

export default GeneralSettingsPage;
