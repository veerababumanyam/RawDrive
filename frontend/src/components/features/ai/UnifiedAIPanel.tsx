/**
 * UnifiedAIPanel Component
 *
 * Compact, icon-based AI toolbar inspired by Gamma/Canva design.
 * Uses minimal space with icon buttons and tooltips.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Sparkles,
  BarChart3,
  Wand2,
  PenTool,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ScanFace,
  Users,
  Image as ImageIcon,
  Hash,
  BookOpen,
  MessageSquare,
  Tag,
  Eye,
  TrendingUp,
  Zap,
  Filter,
} from 'lucide-react';
import { AnalyzeSection } from './sections/AnalyzeSection';
import { CurateSection } from './sections/CurateSection';
import { CreateSection } from './sections/CreateSection';
import { DiscoverSection } from './sections/DiscoverSection';
import { CompactAIFilters } from './CompactAIFilters';
import { Modal, ModalBody, ModalHeader, ModalTitle } from '@/components/ui/Modal';
import { useQualityAnalysis } from '@/hooks/useQualityAnalysis';
import { useCurationSession } from '@/hooks/useCurationSession';
import type { AIFilterState } from '@/types/aiFilter';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnifiedAIPanelProps {
  workspaceId: string;
  galleryId: string;
  galleryName: string;
  totalPhotos: number;
  selectedAssetIds?: string[];
  onQualityAnalysisComplete?: () => void;
  onCurationComplete?: (selectedAssetIds: string[]) => void;
  // AI Filters props
  filters?: AIFilterState;
  onFiltersChange?: (filters: Partial<AIFilterState>) => void;
  onFiltersApply?: () => void;
  onFiltersReset?: () => void;
  filtersMatchCount?: number | null;
  filtersCountLoading?: boolean;
  filtersApplyLoading?: boolean;
  className?: string;
}

type SectionId = 'analyze' | 'curate' | 'create' | 'discover' | 'faces' | 'similarity' | 'search' | 'tags' | 'story' | 'captions' | 'hashtags' | 'filters';

interface AITool {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: number | string;
  status?: 'active' | 'completed' | 'error';
  category: 'analyze' | 'curate' | 'create' | 'discover';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const UnifiedAIPanel: React.FC<UnifiedAIPanelProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  selectedAssetIds = [],
  onQualityAnalysisComplete,
  onCurationComplete,
  filters,
  onFiltersChange,
  onFiltersApply,
  onFiltersReset,
  filtersMatchCount,
  filtersCountLoading = false,
  filtersApplyLoading = false,
  className = '',
}) => {
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const [hoveredTool, setHoveredTool] = useState<SectionId | null>(null);

  // Quality analysis hook
  const {
    results: qualityResults,
    summary: qualitySummary,
    progress: qualityProgress,
    isAnalyzing,
    isStarting: qualityStarting,
    hasResults: hasQualityResults,
    progressPercent: qualityProgressPercent,
    startAnalysis: startQualityAnalysis,
  } = useQualityAnalysis({
    workspaceId,
    galleryId,
    onComplete: () => {
      onQualityAnalysisComplete?.();
    },
  });

  // Curation session hook
  const {
    activeSession: curationSession,
    hasActiveSession,
    isCreating: curationCreating,
    isStarting: curationStarting,
  } = useCurationSession({
    workspaceId,
    galleryId,
    onComplete: (session) => {
      // TODO: Fetch selected asset IDs from completed session
      // For now, pass empty array as curation completion is handled elsewhere
      onCurationComplete?.([]);
    },
  });

  // Build tools with status indicators - all available AI services
  const tools: AITool[] = useMemo(() => {
    const baseTools: AITool[] = [
      // Analyze Category
      {
        id: 'analyze',
        label: 'Quality Analysis',
        icon: BarChart3,
        description: 'Quality scores, blur detection, technical analysis',
        status: isAnalyzing ? 'active' : hasQualityResults ? 'completed' : undefined,
        category: 'analyze',
      },
      {
        id: 'tags',
        label: 'Auto-Tagging',
        icon: Tag,
        description: 'Scene detection, object recognition, auto-tags',
        category: 'analyze',
      },
      // Curate Category
      {
        id: 'curate',
        label: 'Smart Curate',
        icon: Wand2,
        description: 'AI-powered photo selection',
        status: hasActiveSession && curationSession
          ? ['analyzing', 'grouping', 'curating'].includes(curationSession.status)
            ? 'active'
            : curationSession.status === 'completed'
              ? 'completed'
              : curationSession.status === 'failed'
                ? 'error'
                : undefined
          : undefined,
        category: 'curate',
      },
      // Create Category
      {
        id: 'create',
        label: 'Content',
        icon: PenTool,
        description: 'Stories, captions, hashtags',
        badge: selectedAssetIds.length > 0 ? selectedAssetIds.length : undefined,
        category: 'create',
      },
      {
        id: 'story',
        label: 'Gallery Story',
        icon: BookOpen,
        description: 'AI-written narrative for your gallery',
        category: 'create',
      },
      {
        id: 'captions',
        label: 'Captions',
        icon: MessageSquare,
        description: 'Generate captions for photos',
        badge: selectedAssetIds.length > 0 ? selectedAssetIds.length : undefined,
        category: 'create',
      },
      {
        id: 'hashtags',
        label: 'Hashtags',
        icon: Hash,
        description: 'Generate hashtags for social media',
        badge: selectedAssetIds.length > 0 ? selectedAssetIds.length : undefined,
        category: 'create',
      },
      // Discover Category
      {
        id: 'faces',
        label: 'Face Detection',
        icon: ScanFace,
        description: 'Detect and group faces',
        category: 'discover',
      },
      {
        id: 'similarity',
        label: 'Find Similar',
        icon: ImageIcon,
        description: 'Duplicate and similar photos',
        category: 'discover',
      },
      {
        id: 'search',
        label: 'Semantic Search',
        icon: Search,
        description: 'Search by description',
        category: 'discover',
      },
      // Filters
      {
        id: 'filters',
        label: 'AI Filters',
        icon: Filter,
        description: 'Quality, blur, technical scores',
        category: 'analyze',
      },
    ];
    return baseTools;
  }, [
    isAnalyzing,
    hasQualityResults,
    hasActiveSession,
    curationSession,
    selectedAssetIds.length,
  ]);

  const handleToolClick = useCallback((toolId: SectionId) => {
    // For specific tools, set them directly; for category tools, toggle
    const categoryMap: Record<SectionId, SectionId> = {
      analyze: 'analyze',
      tags: 'analyze',
      curate: 'curate',
      create: 'create',
      story: 'story',
      captions: 'captions',
      hashtags: 'hashtags',
      discover: 'discover',
      faces: 'discover',
      similarity: 'discover',
      search: 'discover',
      filters: 'filters',
    };

    const mappedId = categoryMap[toolId] || toolId;
    setActiveSection(activeSection === mappedId ? null : mappedId);
  }, [activeSection]);

  const handleCloseModal = useCallback(() => {
    setActiveSection(null);
  }, []);

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'active':
        return <Loader2 className="w-3 h-3 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  // Color mapping for different AI tool categories (Apple iOS inspired)
  // WCAG 2.1 AA compliant - ensures 4.5:1 contrast ratio for text/icons
  const getToolColor = (toolId: SectionId, isActive: boolean) => {
    if (isActive) {
      return 'bg-gradient-to-br from-primary/90 to-primary text-white shadow-lg shadow-primary/30 dark:from-primary dark:to-primary/90 dark:text-white';
    }

    const colorMap: Record<SectionId, string> = {
      analyze: 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-500/35 dark:to-blue-600/35 text-blue-600 dark:text-blue-300 hover:from-blue-500/30 hover:to-blue-600/30 dark:hover:from-blue-500/45 dark:hover:to-blue-600/45',
      tags: 'bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 dark:from-indigo-500/35 dark:to-indigo-600/35 text-indigo-600 dark:text-indigo-300 hover:from-indigo-500/30 hover:to-indigo-600/30 dark:hover:from-indigo-500/45 dark:hover:to-indigo-600/45',
      curate: 'bg-gradient-to-br from-purple-500/20 to-purple-600/20 dark:from-purple-500/35 dark:to-purple-600/35 text-purple-600 dark:text-purple-300 hover:from-purple-500/30 hover:to-purple-600/30 dark:hover:from-purple-500/45 dark:hover:to-purple-600/45',
      create: 'bg-gradient-to-br from-pink-500/20 to-pink-600/20 dark:from-pink-500/35 dark:to-pink-600/35 text-pink-600 dark:text-pink-300 hover:from-pink-500/30 hover:to-pink-600/30 dark:hover:from-pink-500/45 dark:hover:to-pink-600/45',
      story: 'bg-gradient-to-br from-rose-500/20 to-rose-600/20 dark:from-rose-500/35 dark:to-rose-600/35 text-rose-600 dark:text-rose-300 hover:from-rose-500/30 hover:to-rose-600/30 dark:hover:from-rose-500/45 dark:hover:to-rose-600/45',
      captions: 'bg-gradient-to-br from-orange-500/20 to-orange-600/20 dark:from-orange-500/35 dark:to-orange-600/35 text-orange-600 dark:text-orange-300 hover:from-orange-500/30 hover:to-orange-600/30 dark:hover:from-orange-500/45 dark:hover:to-orange-600/45',
      hashtags: 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 dark:from-amber-500/35 dark:to-amber-600/35 text-amber-600 dark:text-amber-300 hover:from-amber-500/30 hover:to-amber-600/30 dark:hover:from-amber-500/45 dark:hover:to-amber-600/45',
      discover: 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 dark:from-cyan-500/35 dark:to-cyan-600/35 text-cyan-600 dark:text-cyan-300 hover:from-cyan-500/30 hover:to-cyan-600/30 dark:hover:from-cyan-500/45 dark:hover:to-cyan-600/45',
      faces: 'bg-gradient-to-br from-teal-500/20 to-teal-600/20 dark:from-teal-500/35 dark:to-teal-600/35 text-teal-600 dark:text-teal-300 hover:from-teal-500/30 hover:to-teal-600/30 dark:hover:from-teal-500/45 dark:hover:to-teal-600/45',
      similarity: 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 dark:from-emerald-500/35 dark:to-emerald-600/35 text-emerald-600 dark:text-emerald-300 hover:from-emerald-500/30 hover:to-emerald-600/30 dark:hover:from-emerald-500/45 dark:hover:to-emerald-600/45',
      search: 'bg-gradient-to-br from-violet-500/20 to-violet-600/20 dark:from-violet-500/35 dark:to-violet-600/35 text-violet-600 dark:text-violet-300 hover:from-violet-500/30 hover:to-violet-600/30 dark:hover:from-violet-500/45 dark:hover:to-violet-600/45',
      filters: 'bg-gradient-to-br from-slate-500/20 to-slate-600/20 dark:from-slate-500/35 dark:to-slate-600/35 text-slate-600 dark:text-slate-300 hover:from-slate-500/30 hover:to-slate-600/30 dark:hover:from-slate-500/45 dark:hover:to-slate-600/45',
    };

    return colorMap[toolId] || 'bg-gradient-to-br from-gray-500/20 to-gray-600/20 dark:from-gray-500/35 dark:to-gray-600/35 text-gray-600 dark:text-gray-300 hover:from-gray-500/30 hover:to-gray-600/30 dark:hover:from-gray-500/45 dark:hover:to-gray-600/45';
  };

  return (
    <>
      {/* Compact Icon Toolbar - Apple iOS Glassmorphism - WCAG 2.1 AA compliant */}
      <div
        className={`
          flex items-center gap-2 p-2.5
          backdrop-blur-xl
          rounded-2xl
          border
          shadow-xl
          transition-all duration-300
          relative
          overflow-hidden
          ${className}
          bg-gradient-to-br
          from-white/70 via-white/60 to-white/50
          dark:from-slate-800/95 dark:via-slate-800/90 dark:to-slate-900/95
          border-white/20 dark:border-slate-600/60
          shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.5)]
        `}
      >
        {/* Subtle gradient overlay for depth - Light mode only */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-50 dark:opacity-0 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, transparent 100%)',
          }}
        />
        {/* Dark mode overlay for better visibility and WCAG compliance */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 dark:opacity-100 transition-opacity duration-300"
          style={{
            background: 'linear-gradient(135deg, rgba(30,41,59,0.95) 0%, rgba(15,23,42,0.90) 100%)',
          }}
        />

        {/* Content - positioned relative to overlay */}
        <div className="relative z-10 flex items-center gap-2 w-full">
          {/* AI Label Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 dark:from-primary/40 dark:to-primary/30 border border-primary/20 dark:border-primary/50 dark:border-opacity-70">
            <Sparkles className="w-4 h-4 text-primary dark:text-primary-300" />
            <span className="text-[11px] font-semibold text-primary dark:text-primary-300 hidden sm:inline tracking-tight">AI</span>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-gradient-to-b from-transparent via-border/50 to-transparent dark:via-slate-500/70" />

          {/* Tool Icons */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const categoryMap: Partial<Record<SectionId, SectionId>> = {
                analyze: 'analyze',
                tags: 'analyze',
                curate: 'curate',
                create: 'create',
                discover: 'discover',
                faces: 'discover',
                similarity: 'discover',
                search: 'discover',
              };
              const toolCategory = categoryMap[tool.id] || tool.id;
              const isActive = activeSection === tool.id || activeSection === toolCategory;
              const colorClass = getToolColor(tool.id, isActive);

              return (
                <div key={tool.id} className="relative group">
                  <button
                    onClick={() => handleToolClick(tool.id)}
                    onMouseEnter={() => setHoveredTool(tool.id)}
                    onMouseLeave={() => setHoveredTool(null)}
                    className={`
                    relative flex items-center justify-center
                    w-9 h-9 rounded-xl
                    transition-all duration-200 ease-out
                    ${colorClass}
                    ${isActive
                        ? 'scale-110 ring-2 ring-primary/30 dark:ring-primary/50 dark:ring-opacity-70'
                        : 'hover:scale-105 active:scale-95'
                      }
                    backdrop-blur-sm
                    border border-white/20 dark:border-slate-500/40 dark:border-opacity-60
                    shadow-md hover:shadow-lg dark:shadow-slate-900/50
                  `}
                    aria-label={tool.label}
                    title={tool.label}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white dark:text-white' : ''}`} />
                    {tool.badge && (
                      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-br from-red-500 to-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none shadow-lg ring-2 ring-white dark:ring-slate-900">
                        {typeof tool.badge === 'number' && tool.badge > 99 ? '99+' : tool.badge}
                      </span>
                    )}
                    {getStatusIcon(tool.status) && (
                      <span className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-700 rounded-full p-0.5 shadow-md ring-1 ring-border dark:ring-slate-600/50">
                        {getStatusIcon(tool.status)}
                      </span>
                    )}
                  </button>

                  {/* Enhanced Tooltip - iOS 18 style - Instant UX via JS, WCAG 2.1 AA compliant */}
                  <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 px-3.5 py-2.5 
                  backdrop-blur-2xl
                  bg-white/[0.98] dark:bg-slate-700/[0.98]
                  border border-slate-200/70 dark:border-slate-500/80
                  rounded-2xl text-xs
                  pointer-events-none
                  transition-opacity duration-[50ms] ease-linear z-50
                  shadow-[0_4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.45)]
                  min-w-[140px] max-w-[200px]
                  whitespace-normal
                  ${hoveredTool === tool.id ? 'opacity-100' : 'opacity-0'}
                `}>
                    <div className="font-semibold text-slate-900 dark:text-slate-50 mb-1 leading-tight">{tool.label}</div>
                    <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">{tool.description}</div>
                    {/* Arrow - iOS style with proper border matching */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                      <div className="w-2.5 h-2.5 bg-white/[0.98] dark:bg-slate-700/[0.98] border-r border-b border-slate-200/70 dark:border-slate-500/80 rotate-45" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal for Expanded Sections */}
      {activeSection && (
        <Modal
          isOpen={!!activeSection}
          onClose={handleCloseModal}
          size="lg"
        >
          <ModalHeader>
            <ModalTitle>
              {(() => {
                const tool = tools.find((t) => t.id === activeSection);
                if (tool) return tool.label;
                // Fallback for category-based sections
                if (activeSection === 'analyze' || activeSection === 'tags') return 'Quality Analysis';
                if (activeSection === 'discover' || activeSection === 'faces' || activeSection === 'similarity' || activeSection === 'search') return 'Discover';
                if (activeSection === 'create' || activeSection === 'story' || activeSection === 'captions' || activeSection === 'hashtags') {
                  const tool = tools.find((t) => t.id === activeSection);
                  return tool ? tool.label : 'Content';
                }
                return 'AI Tools';
              })()}
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            {(activeSection === 'analyze' || activeSection === 'tags') && (
              <AnalyzeSection
                workspaceId={workspaceId}
                galleryId={galleryId}
                totalPhotos={totalPhotos}
                qualityResults={qualityResults}
                qualitySummary={qualitySummary}
                qualityProgress={qualityProgress}
                isAnalyzing={isAnalyzing}
                isStarting={qualityStarting}
                hasResults={hasQualityResults}
                progressPercent={qualityProgressPercent}
                onStartAnalysis={async () => {
                  await startQualityAnalysis();
                }}
                expanded={true}
                onToggle={handleCloseModal}
              />
            )}
            {activeSection === 'curate' && (
              <CurateSection
                workspaceId={workspaceId}
                galleryId={galleryId}
                galleryName={galleryName}
                totalPhotos={totalPhotos}
                curationSession={curationSession}
                hasActiveSession={hasActiveSession}
                isCreating={curationCreating}
                isStarting={curationStarting}
                expanded={true}
                onToggle={handleCloseModal}
              />
            )}
            {(activeSection === 'create' || activeSection === 'story' || activeSection === 'captions' || activeSection === 'hashtags') && (
              <CreateSection
                workspaceId={workspaceId}
                galleryId={galleryId}
                galleryName={galleryName}
                totalPhotos={totalPhotos}
                selectedAssetIds={selectedAssetIds}
                expanded={true}
                onToggle={handleCloseModal}
                initialFeature={
                  activeSection === 'story' ? 'story' :
                    activeSection === 'captions' ? 'captions' :
                      activeSection === 'hashtags' ? 'hashtags' :
                        undefined
                }
              />
            )}
            {(activeSection === 'discover' || activeSection === 'faces' || activeSection === 'similarity' || activeSection === 'search') && (
              <DiscoverSection
                workspaceId={workspaceId}
                galleryId={galleryId}
                totalPhotos={totalPhotos}
                expanded={true}
                onToggle={handleCloseModal}
              />
            )}
            {activeSection === 'filters' && filters && onFiltersChange && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      <Filter className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-text-primary">AI Filters</h3>
                      <p className="text-sm text-text-secondary">Quality tiers, blur, and technical scores</p>
                    </div>
                  </div>
                </div>
                <CompactAIFilters
                  filters={filters}
                  onChange={onFiltersChange}
                  onApply={onFiltersApply}
                  onReset={onFiltersReset}
                  matchCount={filtersMatchCount}
                  countLoading={filtersCountLoading}
                  applyLoading={filtersApplyLoading}
                  defaultCollapsed={false}
                />
              </div>
            )}
          </ModalBody>
        </Modal>
      )}
    </>
  );
};

export default UnifiedAIPanel;
