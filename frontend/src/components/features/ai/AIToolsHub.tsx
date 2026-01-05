/**
 * AIToolsHub Component
 *
 * Unified slide-out panel providing access to all AI features for a gallery.
 * Organizes AI capabilities into logical tabs: Analyze, Curate, Create.
 *
 * Feature: 024-ai-tools-hub
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Sparkles,
  BarChart3,
  Wand2,
  PenTool,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AnalyzeTab } from './tabs/AnalyzeTab';
import { CurateTab } from './tabs/CurateTab';
import { CreateTab } from './tabs/CreateTab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIToolsTab = 'analyze' | 'curate' | 'create';

export interface AIToolsHubProps {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Callback to close the panel */
  onClose: () => void;
  /** Workspace ID */
  workspaceId: string;
  /** Gallery ID */
  galleryId: string;
  /** Gallery name for display */
  galleryName: string;
  /** Total photo count in gallery */
  totalPhotos: number;
  /** Initial tab to show */
  initialTab?: AIToolsTab;
  /** Currently selected asset IDs (for batch operations) */
  selectedAssetIds?: string[];
  /** Callback when quality analysis completes */
  onQualityAnalysisComplete?: () => void;
  /** Callback when curation completes with selected asset IDs */
  onCurationComplete?: (selectedAssetIds: string[]) => void;
}

interface TabConfig {
  id: AIToolsTab;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TABS: TabConfig[] = [
  {
    id: 'analyze',
    label: 'Analyze',
    icon: <BarChart3 className="w-4 h-4" />,
    description: 'Quality scores, blur detection, tagging health',
  },
  {
    id: 'curate',
    label: 'Curate',
    icon: <Wand2 className="w-4 h-4" />,
    description: 'AI-powered photo selection',
  },
  {
    id: 'create',
    label: 'Create',
    icon: <PenTool className="w-4 h-4" />,
    description: 'Stories, captions, hashtags',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AIToolsHub: React.FC<AIToolsHubProps> = ({
  isOpen,
  onClose,
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  initialTab = 'analyze',
  selectedAssetIds = [],
  onQualityAnalysisComplete,
  onCurationComplete,
}) => {
  const [activeTab, setActiveTab] = useState<AIToolsTab>(initialTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when panel is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleTabChange = useCallback((tab: AIToolsTab) => {
    setActiveTab(tab);
  }, []);

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  if (!isOpen) return null;

  const panelWidth = isCollapsed ? 'w-16' : 'w-[480px]';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-full ${panelWidth} bg-surface border-l border-border z-50 flex flex-col shadow-2xl transition-all duration-300 ease-in-out`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Tools Hub"
      >
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-12 bg-surface border border-border rounded-l-lg flex items-center justify-center hover:bg-surface-hover transition-colors z-10"
          aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
        >
          {isCollapsed ? (
            <ChevronLeft className="w-4 h-4 text-text-secondary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-secondary" />
          )}
        </button>

        {isCollapsed ? (
          /* Collapsed view - icon strip */
          <div className="flex flex-col items-center py-4 gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary mb-4">
              <Sparkles className="w-5 h-5" />
            </div>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsCollapsed(false);
                }}
                className={`p-3 rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
                title={tab.label}
                aria-label={tab.label}
              >
                {tab.icon}
              </button>
            ))}
          </div>
        ) : (
          /* Expanded view */
          <>
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">AI Tools</h2>
                  <p className="text-sm text-text-secondary truncate max-w-[280px]">
                    {galleryName} ({totalPhotos} photos)
                  </p>
                </div>
              </div>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                aria-label="Close AI Tools"
                className="rounded-full"
              >
                <X className="w-5 h-5" />
              </AppButton>
            </header>

            {/* Tab Navigation */}
            <nav className="px-4 py-2 border-b border-border shrink-0">
              <div className="flex gap-1 bg-background/50 rounded-lg p-1">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-surface text-text-primary shadow-sm'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'
                    }`}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`tab-panel-${tab.id}`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </nav>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'analyze' && (
                <div
                  id="tab-panel-analyze"
                  role="tabpanel"
                  aria-labelledby="tab-analyze"
                >
                  <AnalyzeTab
                    workspaceId={workspaceId}
                    galleryId={galleryId}
                    totalPhotos={totalPhotos}
                    onAnalysisComplete={onQualityAnalysisComplete}
                  />
                </div>
              )}

              {activeTab === 'curate' && (
                <div
                  id="tab-panel-curate"
                  role="tabpanel"
                  aria-labelledby="tab-curate"
                >
                  <CurateTab
                    workspaceId={workspaceId}
                    galleryId={galleryId}
                    galleryName={galleryName}
                    totalPhotos={totalPhotos}
                    onCurationComplete={onCurationComplete}
                  />
                </div>
              )}

              {activeTab === 'create' && (
                <div
                  id="tab-panel-create"
                  role="tabpanel"
                  aria-labelledby="tab-create"
                >
                  <CreateTab
                    workspaceId={workspaceId}
                    galleryId={galleryId}
                    galleryName={galleryName}
                    totalPhotos={totalPhotos}
                    selectedAssetIds={selectedAssetIds}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default AIToolsHub;
