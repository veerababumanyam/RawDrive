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
import { DesignStudioTooltip } from './DesignStudioTooltip';
import {
  Image as ImageIcon,
  Type as TypeIcon,
  Palette,
  LayoutGrid,
  Construction
} from 'lucide-react';

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
    <div className="h-full flex flex-col bg-transparent text-white font-sans">
      {/* Header Section - Enhanced Contrast */}
      <div className="px-6 py-8 border-b border-white/10 bg-black/40 backdrop-blur-3xl rounded-t-[2.5rem]">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-black tracking-tight text-white drop-shadow-lg uppercase">Appearance</h2>
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && (
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-400/20 rounded-full border border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.2em]">Syncing</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500/20 rounded-full border border-red-500/30">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                <span className="text-[9px] font-black text-red-500 uppercase tracking-[0.2em]">Error</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-white/50 font-bold uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md inline-block">Visual Identity Engine</p>
      </div>

      {/* Tab Navigation - Capsule Segmented Control */}
      <div className="px-6 py-4">
        <div
          role="tablist"
          aria-label="Design control sections"
          className="flex bg-black/20 backdrop-blur-md rounded-[1.25rem] p-1.5 border border-white/5"
        >
          {[
            { tab: 'cover' as DesignSection, label: 'Cover', icon: <ImageIcon className="w-4 h-4" /> },
            { tab: 'typography' as DesignSection, label: 'Type', icon: <TypeIcon className="w-4 h-4" /> },
            { tab: 'theme' as DesignSection, label: 'Theme', icon: <Palette className="w-4 h-4" /> },
            { tab: 'grid' as DesignSection, label: 'Grid', icon: <LayoutGrid className="w-4 h-4" /> },
          ].map(({ tab, label, icon }) => (
            <DesignStudioTooltip key={tab} content={label} position="bottom">
              <button
                role="tab"
                id={`tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`panel-${tab}`}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(e) => handleTabKeyDown(e, tab)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl transition-all duration-300 relative min-w-0 ${activeTab === tab
                  ? 'bg-white text-[#0a1628] shadow-lg scale-[1.02]'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
              >
                {icon}
                <span className="text-[9px] font-bold uppercase tracking-widest truncate w-full text-center px-1">{label}</span>
                {activeTab === tab && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            </DesignStudioTooltip>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto px-6 py-2 scrollbar-thin scrollbar-white/10">
        {activeTab === 'cover' && (
          <LockableControlSection
            isLocked={lockedSections.has('cover')}
            lockedByUser={lockedSections.get('cover')?.locked_by_user_name}
            section="cover"
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Gallery Cover Mode</h3>
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
            lockedByUser={lockedSections.get('typography')?.locked_by_user_name}
            section="typography"
          >
            <div className="space-y-6">
              <div>
                <h3 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Font Curation</h3>
                <div className="space-y-3">
                  {Object.values(FONT_PAIRINGS).map((pairing) => (
                    <button
                      key={pairing.id}
                      onClick={() => onChange({ typography: { pairingId: pairing.id as FontPairingId } })}
                      className={`group w-full text-left px-5 py-4 rounded-2xl border transition-all duration-300 ${config.typography.pairingId === pairing.id
                        ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10'
                        }`}
                    >
                      <div className={`text-sm font-bold transition-colors ${config.typography.pairingId === pairing.id ? 'text-cyan-400' : 'text-white/80 group-hover:text-white'}`}>
                        {pairing.name}
                      </div>
                      <div className="text-[11px] text-white/40 mt-1 leading-relaxed">{pairing.description}</div>
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
            <div className="py-2">
              <ThemeSelector
                selectedTheme={config.theme.id}
                selectedMode={config.theme.mode}
                onThemeChange={(themeId) => onChange({ theme: { ...config.theme, id: themeId } })}
                onModeChange={(mode) => onChange({ theme: { ...config.theme, mode } })}
                disabled={lockedSections.has('theme')}
              />
            </div>
          </LockableControlSection>
        )}

        {activeTab === 'grid' && (
          <LockableControlSection
            isLocked={lockedSections.has('grid')}
            lockedByUser={lockedSections.get('grid')?.locked_by_user_name}
            section="grid"
          >
            <div className="py-8 flex flex-col items-center justify-center text-center opacity-40">
              <Construction className="w-10 h-10 text-white/40 mb-4" />
              <h3 className="text-sm font-bold text-white uppercase tracking-widest mb-2">Grid Engine</h3>
              <p className="text-xs text-white/60">Layout orchestration arriving in Phase 2.</p>
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
