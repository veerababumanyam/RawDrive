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
import type { DesignSection, DesignSectionLock, DesignStudioCollaborator } from '../../../../types/design-studio-collaboration';
import { FONT_PAIRINGS } from '../../../../constants/fontPairings';
import { LockableControlSection } from './ControlLockIndicator';
import { ThemeSelector } from './ThemeSelector';
import { CoverStyleGrid } from './CoverStyleGrid';
import { useSubscription } from '../../../../hooks/useSubscription';
import { DesignStudioTooltip } from './DesignStudioTooltip';
import {
  Image as ImageIcon,
  Type as TypeIcon,
  Palette,
  LayoutGrid,
} from 'lucide-react';
import { GridLayoutSection } from './GridLayoutSection';
import { CoverPhotoSection } from './CoverPhotoSection';

interface DesignControlsPanelProps {
  config: GalleryDesignConfig;
  onChange: (updates: Partial<GalleryDesignConfig>) => void;
  saveStatus: DesignDraftStatus;
  lastSavedAt: Date | null;
  error?: string;
  lockedSections?: Map<DesignSection, DesignSectionLock>;
  galleryId?: string;
  workspaceId?: string;
  // Collaboration callbacks
  onSectionFocus?: (section: DesignSection) => void;
  onTypingChange?: (isTyping: boolean, field?: string) => void;
  onLockSection?: (section: DesignSection) => Promise<{ success: boolean; error?: string }>;
  onUnlockSection?: (section: DesignSection) => Promise<boolean>;
  collaborators?: DesignStudioCollaborator[];
  myUserId?: string;
}

export const DesignControlsPanel: React.FC<DesignControlsPanelProps> = ({
  config,
  onChange,
  saveStatus,
  lastSavedAt: _lastSavedAt,
  error,
  lockedSections = new Map(),
  galleryId,
  workspaceId,
  onSectionFocus,
  onTypingChange,
  onLockSection,
  onUnlockSection,
  collaborators = [],
  myUserId,
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
      case 'ArrowUp': {
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[prevIndex]);
        break;
      }
      case 'ArrowRight':
      case 'ArrowDown': {
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex]);
        break;
      }
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
    <div data-testid="design-controls-panel" className="h-full flex flex-col bg-transparent text-gray-900 dark:text-white font-sans">
      {/* Header Section - Enhanced Contrast */}
      <div className="px-6 py-6 sm:py-8 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/40 backdrop-blur-3xl flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold tracking-tight text-gray-900 dark:text-white drop-shadow-lg">Appearance</h2>
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-400/20 rounded-full border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-[0.2em]">Syncing</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-100 dark:bg-red-500/20 rounded-full border border-red-300 dark:border-red-500/30">
                <span className="w-1.5 h-1.5 bg-red-600 dark:bg-red-500 rounded-full" />
                <span className="text-[9px] font-black text-red-600 dark:text-red-500 uppercase tracking-[0.2em]">Error</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-600 dark:text-white/50 font-semibold tracking-wide bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-md inline-block">Visual Identity Engine</p>
      </div>

      {/* Tab Navigation - Responsive Capsule Segmented Control */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <div
          role="tablist"
          aria-label="Design control sections"
          className="flex bg-gray-100 dark:bg-black/20 backdrop-blur-md rounded-[1.25rem] p-1 sm:p-1.5 border border-gray-200 dark:border-white/5 gap-0.5 sm:gap-0"
        >
          {[
            { tab: 'cover' as DesignSection, label: 'Cover', icon: <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" /> },
            { tab: 'typography' as DesignSection, label: 'Type', icon: <TypeIcon className="w-4 h-4 sm:w-5 sm:h-5" /> },
            { tab: 'theme' as DesignSection, label: 'Theme', icon: <Palette className="w-4 h-4 sm:w-5 sm:h-5" /> },
            { tab: 'grid' as DesignSection, label: 'Grid', icon: <LayoutGrid className="w-4 h-4 sm:w-5 sm:h-5" /> },
          ].map(({ tab, label, icon }) => (
            <DesignStudioTooltip key={tab} content={label} position="bottom">
              <button
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                onClick={() => {
                  setActiveTab(tab);
                  onSectionFocus?.(tab);
                }}
                onKeyDown={(e) => handleTabKeyDown(e, tab)}
                className={`flex-1 flex flex-col items-center justify-center py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-lg sm:rounded-xl transition-all duration-300 relative min-w-0 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black ${activeTab === tab
                  ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
                  : 'text-gray-600 dark:text-white/40 hover:text-gray-900 dark:hover:text-white/70 hover:bg-gray-200 dark:hover:bg-white/5 hover:scale-[1.01]'
                  }`}
              >
                <div className="flex items-center justify-center h-5 sm:h-6 mb-0.5 sm:mb-1">
                  {icon}
                </div>
                {/* Label hidden on mobile, visible on small screens and up */}
                <span className="hidden sm:inline text-[8px] sm:text-[9px] font-semibold tracking-wide truncate w-full text-center leading-tight">{label}</span>
                {/* Short label visible only on mobile (icon-only fallback handled by tooltip) */}
                <span className="sm:hidden text-[7px] font-semibold tracking-widest truncate w-full text-center leading-tight opacity-0 h-0" aria-hidden="true">{label.substring(0, 1)}</span>
                {activeTab === tab && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            </DesignStudioTooltip>
          ))}
        </div>
      </div>

      {/* Tab Content - Cross-browser compatible scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent' }}>
        {activeTab === 'cover' && (
          <LockableControlSection
            isLocked={lockedSections.has('cover')}
            lockedByUser={lockedSections.get('cover')?.lockedByUserName}
            section="cover"
          >
            <div className="space-y-8">
              {/* Cover Photo Configuration (T007-T011) */}
              {galleryId && workspaceId && (
                <CoverPhotoSection
                  config={config.cover}
                  galleryId={galleryId}
                  workspaceId={workspaceId}
                  onChange={(updates) => onChange({ cover: { ...config.cover, ...updates } })}
                  disabled={lockedSections.has('cover')}
                />
              )}

              {/* Cover Style Selection */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Gallery cover mode</h3>
                  <DesignStudioTooltip content="Choose how your gallery cover looks - the first impression visitors see">
                    <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
                  </DesignStudioTooltip>
                </div>
                <CoverStyleGrid
                  selectedStyle={config.cover?.style || 'classic'}
                  onSelectStyle={(styleId) => onChange({ cover: { ...config.cover, style: styleId as CoverStyleId } })}
                  category={coverCategory}
                  onCategoryChange={setCoverCategory}
                  isPremiumUser={isPaid}
                  onPremiumStyleBlocked={handlePremiumStyleBlocked}
                />
              </div>
            </div>
          </LockableControlSection>
        )}

        {activeTab === 'typography' && (
          <LockableControlSection
            isLocked={lockedSections.has('typography')}
            lockedByUser={lockedSections.get('typography')?.lockedByUserName}
            section="typography"
          >
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-[10px] font-semibold text-gray-700 dark:text-white/60 tracking-wide">Font curation</h3>
                  <DesignStudioTooltip content="Select typography that reflects your visual identity">
                    <span className="text-[9px] text-gray-500 dark:text-white/40 cursor-help">ⓘ</span>
                  </DesignStudioTooltip>
                </div>
                <div className="space-y-3">
                  {Object.values(FONT_PAIRINGS).map((pairing) => (
                    <button
                      key={pairing.id}
                      onClick={() => onChange({ typography: { pairingId: pairing.id as FontPairingId } })}
                      className={`group w-full text-left px-5 py-4 rounded-2xl border transition-all duration-300 ${config.typography.pairingId === pairing.id
                        ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                        : 'border-gray-300 dark:border-white/5 bg-gray-100 dark:bg-white/[0.02] hover:bg-gray-200 dark:hover:bg-white/[0.05] hover:border-gray-400 dark:hover:border-white/10'
                        }`}
                    >
                      <div className={`text-sm font-bold transition-colors ${config.typography.pairingId === pairing.id ? 'text-cyan-400' : 'text-gray-900 dark:text-white/80 group-hover:text-gray-950 dark:group-hover:text-white'}`}>
                        {pairing.name}
                      </div>
                      <div className="text-[11px] text-gray-600 dark:text-white/40 mt-1 leading-relaxed">{pairing.description}</div>
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
            lockedByUser={lockedSections.get('theme')?.lockedByUserName}
            section="theme"
          >
            <div className="py-2">
              <ThemeSelector
                selectedTheme={config.theme.id}
                selectedMode={config.theme.mode}
                selectedAccentOverride={config.theme.accentColorOverride}
                onThemeChange={(themeId) => onChange({ theme: { ...config.theme, id: themeId, accentColorOverride: undefined } })}
                onModeChange={(mode) => onChange({ theme: { ...config.theme, mode } })}
                onAccentChange={(accent) => onChange({ theme: { ...config.theme, accentColorOverride: accent } })}
                disabled={lockedSections.has('theme')}
              />
            </div>
          </LockableControlSection>
        )}

        {activeTab === 'grid' && (
          <LockableControlSection
            isLocked={lockedSections.has('grid')}
            lockedByUser={lockedSections.get('grid')?.lockedByUserName}
            section="grid"
          >
            <div className="py-2">
              <GridLayoutSection
                config={config.grid}
                onChange={(updates) => onChange({ grid: { ...config.grid, ...updates } })}
                disabled={lockedSections.has('grid')}
              />
            </div>
          </LockableControlSection>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 m-2 text-xs text-red-700 dark:text-red-200 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-700 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Premium Upgrade Prompt */}
      {upgradePrompt?.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#1e293b] rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">✨</div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Premium Feature</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center mb-4">
              <strong>{upgradePrompt.styleName}</strong> is a premium cover style.
              Upgrade to unlock all {12} premium styles and enhance your galleries.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setUpgradePrompt(null)}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Maybe Later
              </button>
              <button
                onClick={handleUpgradeClick}
                disabled={isCheckingOut}
                className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-cyan-600 dark:bg-cyan-500 text-white hover:opacity-90 transition-opacity disabled:opacity-50"
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
