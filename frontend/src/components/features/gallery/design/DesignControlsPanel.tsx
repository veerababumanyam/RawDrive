/**
 * Design Controls Panel - Gallery Design Studio Left Sidebar
 *
 * Simplified version focusing on collaboration features (lock indicators).
 * Full control sections will be implemented in Phase 2.
 *
 * Current Features:
 * - Tab navigation between 4 design sections
 * - Save status indicators
 * - Collaboration lock indicators (showing when sections are locked)
 * - Error handling
 *
 * TODO (Phase 2):
 * - Implement CoverStylesSection with upload and style grid
 * - Implement TypographySection with font pairings
 * - Implement ThemeSection with color themes
 * - Implement GridLayoutSection with layout options
 */

import React, { useState, useCallback } from 'react';
import { GalleryDesignConfig, DesignDraftStatus, FontPairingId, CoverStyleId } from '../../../../types/gallery-design';
import { FONT_PAIRINGS } from '../../../../constants/fontPairings';
import { LockableControlSection } from './ControlLockIndicator';
import { ThemeSelector } from './ThemeSelector';
import { CoverStyleGrid } from './CoverStyleGrid';
import { useSubscription } from '../../../../hooks/useSubscription';

type DesignSection = 'cover' | 'typography' | 'theme' | 'grid';

interface DesignControlsPanelProps {
  config: GalleryDesignConfig;
  onChange: (updates: Partial<GalleryDesignConfig>) => void;
  saveStatus: DesignDraftStatus;
  lastSavedAt: Date | null;
  error?: string;
  lockedSections?: Map<DesignSection, { locked_by_user_name?: string }>;
}

export const DesignControlsPanel: React.FC<DesignControlsPanelProps> = ({
  config,
  onChange,
  saveStatus,
  lastSavedAt,
  error,
  lockedSections = new Map(),
}) => {
  const [activeTab, setActiveTab] = useState<DesignSection>('cover');
  const [coverCategory, setCoverCategory] = useState<'all' | 'basic' | 'text' | 'advanced' | 'premium'>('all');
  const [upgradePrompt, setUpgradePrompt] = useState<{ show: boolean; styleName: string } | null>(null);

  // Get subscription status to check if user is premium
  const { isPaid, createCheckout, isCheckingOut } = useSubscription();

  // Handle premium style blocked
  const handlePremiumStyleBlocked = useCallback((styleId: string, styleName: string) => {
    setUpgradePrompt({ show: true, styleName });
  }, []);

  // Handle upgrade click
  const handleUpgradeClick = useCallback(async () => {
    try {
      await createCheckout({ plan_id: 'professional', success_url: window.location.href, cancel_url: window.location.href });
    } catch (e) {
      console.error('Checkout failed:', e);
    }
  }, [createCheckout]);

  // Handle keyboard navigation for tabs (Arrow keys, Home, End)
  const handleTabKeyDown = (e: React.KeyboardEvent, currentTab: DesignSection) => {
    const tabs: DesignSection[] = ['cover', 'typography', 'theme', 'grid'];
    const currentIndex = tabs.indexOf(currentTab);

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIndex]);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex]);
        break;
      case 'Home':
        e.preventDefault();
        setActiveTab(tabs[0]);
        break;
      case 'End':
        e.preventDefault();
        setActiveTab(tabs[tabs.length - 1]);
        break;
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Status Bar */}
      <div className="px-4 py-3 border-b border-border-default">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm text-text-primary">Controls</h2>
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <div className="text-xs text-accent-primary flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-accent-primary rounded-full animate-pulse" />
                Saving...
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="text-xs text-green-600">✓ Saved</div>
            )}
            {error && (
              <div className="text-xs text-red-600">⚠ Error</div>
            )}
          </div>
        </div>
        {lastSavedAt && (
          <div className="text-xs text-text-tertiary">
            {lastSavedAt.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div role="tablist" aria-label="Design control sections" className="flex gap-0 px-2 pt-2 border-b border-border-default">
        {[
          { tab: 'cover' as DesignSection, label: 'Cover', icon: '🖼️' },
          { tab: 'typography' as DesignSection, label: 'Typography', icon: '✍️' },
          { tab: 'theme' as DesignSection, label: 'Theme', icon: '🎨' },
          { tab: 'grid' as DesignSection, label: 'Grid', icon: '⊞' },
        ].map(({ tab, label, icon }) => (
          <button
            key={tab}
            role="tab"
            id={`tab-${tab}`}
            aria-selected={activeTab === tab}
            aria-controls={`panel-${tab}`}
            onClick={() => setActiveTab(tab)}
            onKeyDown={(e) => handleTabKeyDown(e, tab)}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-t border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-accent-primary text-accent-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <span aria-hidden="true">{icon}</span>
            <div className="text-xs mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'cover' && (
          <LockableControlSection
            isLocked={lockedSections.has('cover')}
            lockedByUser={lockedSections.get('cover')?.locked_by_user_name}
            section="cover"
          >
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-text-primary mb-2">Cover Styles</h3>
              <CoverStyleGrid
                selectedStyle={config.cover?.style || 'classic'}
                onSelectStyle={(styleId) => onChange({ cover: { ...config.cover, style: styleId as CoverStyleId } })}
                category={coverCategory}
                onCategoryChange={setCoverCategory}
                isPremiumUser={isPaid}
                onPremiumStyleBlocked={handlePremiumStyleBlocked}
              />
            </div>
          </LockableControlSection>
        )}

        {activeTab === 'typography' && (
          <LockableControlSection
            isLocked={lockedSections.has('typography')}
            lockedByUser={lockedSections.get('typography')?.locked_by_user_name}
            section="typography"
          >
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-text-primary mb-3">Font Pairing</h3>
                <div className="space-y-2">
                  {Object.values(FONT_PAIRINGS).map((pairing) => (
                    <button
                      key={pairing.id}
                      onClick={() => onChange({ typography: { pairingId: pairing.id as FontPairingId } })}
                      className={`w-full text-left px-3 py-2 rounded border text-xs transition-colors ${
                        config.typography.pairingId === pairing.id
                          ? 'border-accent-primary bg-accent-primary/10 text-accent-primary font-medium'
                          : 'border-border-default hover:border-accent-primary/50'
                      }`}
                    >
                      <div className="font-medium">{pairing.name}</div>
                      <div className="text-text-secondary text-xs">{pairing.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </LockableControlSection>
        )}

        {activeTab === 'theme' && (
          <LockableControlSection
            isLocked={lockedSections.has('theme')}
            lockedByUser={lockedSections.get('theme')?.locked_by_user_name}
            section="theme"
          >
            <ThemeSelector
              selectedTheme={config.theme.id}
              selectedMode={config.theme.mode}
              onThemeChange={(themeId) => onChange({ theme: { ...config.theme, id: themeId } })}
              onModeChange={(mode) => onChange({ theme: { ...config.theme, mode } })}
              disabled={lockedSections.has('theme')}
            />
          </LockableControlSection>
        )}

        {activeTab === 'grid' && (
          <LockableControlSection
            isLocked={lockedSections.has('grid')}
            lockedByUser={lockedSections.get('grid')?.locked_by_user_name}
            section="grid"
          >
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-sm text-text-primary mb-2">Grid Layout</h3>
                <p className="text-xs text-text-secondary">Grid layout options will be implemented in Phase 2.</p>
              </div>
            </div>
          </LockableControlSection>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 m-2 text-xs text-red-700 bg-red-50 rounded border border-red-200">
          {error}
        </div>
      )}

      {/* Premium Upgrade Prompt */}
      {upgradePrompt?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">✨</div>
              <h3 className="text-lg font-semibold text-text-primary">Premium Feature</h3>
            </div>
            <p className="text-sm text-text-secondary text-center mb-4">
              <strong>{upgradePrompt.styleName}</strong> is a premium cover style.
              Upgrade to unlock all {12} premium styles and enhance your galleries.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setUpgradePrompt(null)}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-border-default text-text-secondary hover:bg-bg-secondary transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={handleUpgradeClick}
                disabled={isCheckingOut}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-accent-primary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isCheckingOut ? 'Loading...' : 'Upgrade Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DesignControlsPanel;
