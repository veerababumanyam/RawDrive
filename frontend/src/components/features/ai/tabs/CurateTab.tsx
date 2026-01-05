/**
 * CurateTab Component
 *
 * Tab content for AI-powered photo curation including:
 * - Smart curation with presets
 * - Session management (create, start, pause, resume)
 * - Progress visualization
 * - Results preview with apply actions
 *
 * Feature: 024-ai-tools-hub
 */

import React, { useState, useCallback } from 'react';
import {
  Wand2,
  Play,
  Pause,
  Settings,
  History,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Star,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { useCurationSession } from '@/hooks/useCurationSession';
import type {
  CurationSession,
  CurationSessionCreateRequest,
  CurationStatus,
} from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurateTabProps {
  workspaceId: string;
  galleryId: string;
  galleryName: string;
  totalPhotos: number;
  onCurationComplete?: (selectedAssetIds: string[]) => void;
}

// Preset configurations
interface CurationPreset {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  config: Partial<CurationSessionCreateRequest>;
}

const BUILT_IN_PRESETS: CurationPreset[] = [
  {
    id: 'wedding',
    name: 'Wedding Highlights',
    description: 'Best moments, expressions, and couple shots',
    icon: <Sparkles className="w-4 h-4" />,
    config: {
      quality_threshold: 0.7,
      similarity_threshold: 0.8,
      include_expression_analysis: true,
      include_diversity: true,
    },
  },
  {
    id: 'portrait',
    name: 'Portrait Selection',
    description: 'Sharp faces, good expressions, flattering angles',
    icon: <Target className="w-4 h-4" />,
    config: {
      quality_threshold: 0.75,
      similarity_threshold: 0.85,
      include_expression_analysis: true,
      include_diversity: false,
    },
  },
  {
    id: 'event',
    name: 'Event Coverage',
    description: 'Diverse moments covering the full event',
    icon: <Star className="w-4 h-4" />,
    config: {
      quality_threshold: 0.6,
      similarity_threshold: 0.7,
      include_expression_analysis: false,
      include_diversity: true,
    },
  },
];

// Target count options
const TARGET_COUNT_OPTIONS = [10, 25, 50, 100, 200];

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

interface PresetCardProps {
  preset: CurationPreset;
  isSelected: boolean;
  onSelect: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, isSelected, onSelect }) => (
  <button
    onClick={onSelect}
    className={`w-full text-left p-3 rounded-lg border transition-all ${
      isSelected
        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
        : 'border-border bg-background/50 hover:border-accent hover:bg-surface-hover'
    }`}
  >
    <div className="flex items-start gap-3">
      <div
        className={`p-2 rounded-lg ${
          isSelected ? 'bg-primary/10 text-primary' : 'bg-surface text-text-secondary'
        }`}
      >
        {preset.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{preset.name}</p>
        <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
          {preset.description}
        </p>
      </div>
      {isSelected && (
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
      )}
    </div>
  </button>
);

interface SessionHistoryItemProps {
  session: CurationSession;
  onSelect: () => void;
}

const SessionHistoryItem: React.FC<SessionHistoryItemProps> = ({ session, onSelect }) => {
  const statusColors: Record<CurationStatus, string> = {
    pending: 'text-gray-500',
    analyzing: 'text-blue-500',
    grouping: 'text-purple-500',
    curating: 'text-orange-500',
    completed: 'text-green-500',
    failed: 'text-red-500',
  };

  const StatusIcon = session.status === 'completed'
    ? CheckCircle2
    : session.status === 'failed'
    ? XCircle
    : Clock;

  return (
    <button
      onClick={onSelect}
      className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-background/50 hover:bg-surface-hover transition-colors text-left"
    >
      <StatusIcon className={`w-5 h-5 ${statusColors[session.status]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">
          {session.name || `Session ${session.session_id.slice(0, 8)}`}
        </p>
        <p className="text-xs text-text-secondary">
          {session.target_count} photos targeted
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-text-tertiary" />
    </button>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CurateTab: React.FC<CurateTabProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  onCurationComplete,
}) => {
  // Local state
  const [selectedPreset, setSelectedPreset] = useState<string>('wedding');
  const [targetCount, setTargetCount] = useState(50);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Session hook
  const {
    activeSession,
    sessions,
    createSession,
    startSession,
    pauseSession,
    deleteSession,
    isCreating,
    isStarting,
    isPausing,
    hasActiveSession,
    canStart,
    canPause,
  } = useCurationSession({
    workspaceId,
    galleryId,
    onComplete: () => {
      onCurationComplete?.([]);
    },
  });

  // Get selected preset config
  const getPresetConfig = useCallback(() => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === selectedPreset);
    return preset?.config || {};
  }, [selectedPreset]);

  // Start new curation
  const handleStartCuration = useCallback(async () => {
    try {
      const presetConfig = getPresetConfig();
      await createSession({
        name: `${galleryName} Curation`,
        target_count: targetCount,
        auto_start: true,
        ...presetConfig,
      });
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  }, [createSession, galleryName, targetCount, getPresetConfig]);

  // Resume/start existing session
  const handleResumeSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await startSession(activeSession.session_id);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [activeSession, startSession]);

  // Pause session
  const handlePauseSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await pauseSession(activeSession.session_id);
    } catch (error) {
      console.error('Failed to pause session:', error);
    }
  }, [activeSession, pauseSession]);

  // Cancel/delete session
  const handleCancelSession = useCallback(async () => {
    if (!activeSession) return;
    try {
      await deleteSession(activeSession.session_id);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [activeSession, deleteSession]);

  // Active session view
  if (hasActiveSession && activeSession) {
    const isRunning = ['analyzing', 'grouping', 'curating'].includes(activeSession.status);
    const progress = activeSession.progress;

    return (
      <div className="p-4 space-y-6">
        {/* Active Session Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Wand2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">
                {activeSession.name || 'Smart Curation'}
              </h3>
              <p className="text-sm text-text-secondary">
                Selecting {activeSession.target_count} photos
              </p>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-background/50 rounded-lg p-4 border border-border/50">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary capitalize">{activeSession.status}...</span>
              <span className="font-medium">{progress.percent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="text-sm text-text-secondary text-center">
              {progress.analyzed_count} analyzed
              {progress.selected_count ? ` / ${progress.selected_count} selected` : ''}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          {canPause && isRunning && (
            <AppButton
              variant="outline"
              className="flex-1"
              onClick={handlePauseSession}
              isLoading={isPausing}
              leftIcon={<Pause className="w-4 h-4" />}
            >
              Pause
            </AppButton>
          )}
          {canStart && !isRunning && (
            <AppButton
              variant="primary"
              className="flex-1"
              onClick={handleResumeSession}
              isLoading={isStarting}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Resume
            </AppButton>
          )}
          <AppButton
            variant="ghost"
            onClick={handleCancelSession}
            className="text-error hover:bg-error/10"
          >
            <XCircle className="w-4 h-4" />
          </AppButton>
        </div>

        {/* Results Preview (when completed) */}
        {activeSession.status === 'completed' && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-600">
                Curation Complete
              </span>
            </div>
            <p className="text-sm text-text-secondary mb-4">
              Selected {progress.selected_count || 0} photos based on your criteria.
            </p>
            <div className="flex gap-2">
              <AppButton
                variant="primary"
                size="sm"
                leftIcon={<FolderPlus className="w-4 h-4" />}
              >
                Create Sub-Gallery
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                leftIcon={<Star className="w-4 h-4" />}
              >
                Add to Favorites
              </AppButton>
            </div>
          </div>
        )}

        {/* Error State */}
        {activeSession.status === 'failed' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-500" />
              <span className="text-sm font-medium text-red-600">
                Curation Failed
              </span>
            </div>
            <p className="text-sm text-text-secondary">
              {activeSession.error_message || 'An unknown error occurred'}
            </p>
            <AppButton
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleCancelSession}
            >
              Dismiss
            </AppButton>
          </div>
        )}
      </div>
    );
  }

  // New curation view
  return (
    <div className="p-4 space-y-6">
      {/* Preset Selection */}
      <section>
        <h3 className="text-sm font-medium text-text-secondary mb-3">Choose a Style</h3>
        <div className="space-y-2">
          {BUILT_IN_PRESETS.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPreset === preset.id}
              onSelect={() => setSelectedPreset(preset.id)}
            />
          ))}
        </div>
      </section>

      {/* Target Count */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-secondary">Target Photos</h3>
          <span className="text-sm font-bold text-primary">{targetCount}</span>
        </div>
        <div className="flex gap-2">
          {TARGET_COUNT_OPTIONS.map((count) => (
            <button
              key={count}
              onClick={() => setTargetCount(count)}
              disabled={count > totalPhotos}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                targetCount === count
                  ? 'bg-primary text-white'
                  : count > totalPhotos
                  ? 'bg-surface text-text-tertiary cursor-not-allowed'
                  : 'bg-surface hover:bg-surface-hover text-text-primary'
              }`}
            >
              {count}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary mt-2">
          {totalPhotos} photos available in gallery
        </p>
      </section>

      {/* Advanced Settings Toggle */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
      >
        <Settings className="w-4 h-4" />
        <span>Advanced Settings</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
        />
      </button>

      {showSettings && (
        <div className="bg-background/50 rounded-lg p-4 border border-border/50 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-text-secondary">Quality Threshold</label>
              <span className="text-sm font-medium text-text-primary">70%</span>
            </div>
            <input
              type="range"
              min="40"
              max="90"
              defaultValue="70"
              className="w-full"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm text-text-secondary">Similarity Threshold</label>
              <span className="text-sm font-medium text-text-primary">80%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              defaultValue="80"
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Start Button */}
      <AppButton
        variant="primary"
        fullWidth
        onClick={handleStartCuration}
        isLoading={isCreating || isStarting}
        loadingText="Starting..."
        leftIcon={<Wand2 className="w-4 h-4" />}
        disabled={totalPhotos < 5}
      >
        Start Smart Curation
      </AppButton>

      {totalPhotos < 5 && (
        <p className="text-xs text-text-tertiary text-center">
          Need at least 5 photos for curation
        </p>
      )}

      {/* Session History */}
      {sessions.length > 0 && (
        <section>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors mb-3"
          >
            <History className="w-4 h-4" />
            <span>Recent Sessions ({sessions.length})</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </button>

          {showHistory && (
            <div className="space-y-2">
              {sessions.slice(0, 5).map((session) => (
                <SessionHistoryItem
                  key={session.session_id}
                  session={session}
                  onSelect={() => {
                    console.log('Selected session:', session);
                  }}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CurateTab;
