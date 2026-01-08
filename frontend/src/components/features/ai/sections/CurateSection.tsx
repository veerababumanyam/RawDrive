/**
 * CurateSection Component
 *
 * Section for AI-powered photo curation with smart selection.
 *
 * Feature: AI Services Consolidation
 */

import React, { useState, useCallback } from 'react';
import {
  Wand2,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Target,
  Star,
  FolderPlus,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { FeatureCard } from '../FeatureCard';
import { useCurationSession } from '@/hooks/useCurationSession';
import type { CurationSession, CurationSessionCreateRequest } from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CurateSectionProps {
  workspaceId: string;
  galleryId: string;
  galleryName: string;
  totalPhotos: number;
  curationSession: CurationSession | null;
  hasActiveSession: boolean;
  isCreating: boolean;
  isStarting: boolean;
  expanded: boolean;
  onToggle: () => void;
}

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

const TARGET_COUNT_OPTIONS = [10, 25, 50, 100, 200];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CurateSection: React.FC<CurateSectionProps> = ({
  workspaceId,
  galleryId,
  galleryName,
  totalPhotos,
  curationSession,
  hasActiveSession,
  isCreating,
  isStarting,
  expanded,
  onToggle,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('wedding');
  const [targetCount, setTargetCount] = useState(50);

  const {
    createSession,
    startSession,
    pauseSession,
    deleteSession,
    isPausing,
    canStart,
    canPause,
  } = useCurationSession({
    workspaceId,
    galleryId,
  });

  const getPresetConfig = useCallback(() => {
    const preset = BUILT_IN_PRESETS.find((p) => p.id === selectedPreset);
    return preset?.config || {};
  }, [selectedPreset]);

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

  const handleResumeSession = useCallback(async () => {
    if (!curationSession) return;
    try {
      await startSession(curationSession.session_id);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [curationSession, startSession]);

  const handlePauseSession = useCallback(async () => {
    if (!curationSession) return;
    try {
      await pauseSession(curationSession.session_id);
    } catch (error) {
      console.error('Failed to pause session:', error);
    }
  }, [curationSession, pauseSession]);

  const handleCancelSession = useCallback(async () => {
    if (!curationSession) return;
    try {
      await deleteSession(curationSession.session_id);
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  }, [curationSession, deleteSession]);

  // Determine status
  const isRunning = curationSession
    ? ['analyzing', 'grouping', 'curating'].includes(curationSession.status)
    : false;
  const status: 'idle' | 'active' | 'completed' | 'error' = isRunning
    ? 'active'
    : curationSession?.status === 'completed'
    ? 'completed'
    : curationSession?.status === 'failed'
    ? 'error'
    : 'idle';

  const progress = curationSession?.progress?.percent || 0;
  const description = curationSession
    ? `${curationSession.target_count} photos targeted`
    : 'AI-powered photo selection';

  return (
    <FeatureCard
      title="Curate"
      description={description}
      icon={<Wand2 className="w-4 h-4" />}
      status={status}
      progress={isRunning ? progress : undefined}
      error={curationSession?.status === 'failed' ? curationSession.error_message : undefined}
      expanded={expanded}
      onToggle={onToggle}
      primaryAction={
        hasActiveSession && curationSession ? (
          isRunning && canPause ? (
            {
              label: 'Pause',
              onClick: handlePauseSession,
              loading: isPausing,
              icon: <Pause className="w-4 h-4" />,
            }
          ) : canStart ? (
            {
              label: 'Resume',
              onClick: handleResumeSession,
              loading: isStarting,
              icon: <Play className="w-4 h-4" />,
            }
          ) : undefined
        ) : (
          {
            label: 'Start Smart Curation',
            onClick: handleStartCuration,
            loading: isCreating || isStarting,
            icon: <Wand2 className="w-4 h-4" />,
            disabled: totalPhotos < 5,
          }
        )
      }
      secondaryActions={
        hasActiveSession && curationSession
          ? [
              {
                label: 'Cancel',
                onClick: handleCancelSession,
                icon: <XCircle className="w-4 h-4" />,
              },
            ]
          : undefined
      }
    >
      {hasActiveSession && curationSession ? (
        <div className="space-y-4">
          {/* Active Session Info */}
          <div className="bg-background/50 rounded-lg p-4 border border-border/50">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary capitalize">{curationSession.status}...</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-text-secondary text-center">
                {curationSession.progress.analyzed_count} analyzed
                {curationSession.progress.selected_count
                  ? ` / ${curationSession.progress.selected_count} selected`
                  : ''}
              </p>
            </div>
          </div>

          {/* Results Preview */}
          {curationSession.status === 'completed' && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium text-emerald-600">Curation Complete</span>
              </div>
              <p className="text-sm text-text-secondary mb-4">
                Selected {curationSession.progress.selected_count || 0} photos based on your criteria.
              </p>
              <div className="flex gap-2">
                <AppButton
                  variant="primary"
                  size="sm"
                  leftIcon={<FolderPlus className="w-4 h-4" />}
                >
                  Create Sub-Gallery
                </AppButton>
                <AppButton variant="outline" size="sm" leftIcon={<Star className="w-4 h-4" />}>
                  Add to Favorites
                </AppButton>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Preset Selection */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary mb-3">Choose a Style</h4>
            <div className="space-y-2">
              {BUILT_IN_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedPreset === preset.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border bg-background/50 hover:border-accent hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        selectedPreset === preset.id
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface text-text-secondary'
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
                    {selectedPreset === preset.id && (
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Target Count */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-text-secondary">Target Photos</h4>
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
          </div>

          {totalPhotos < 5 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-600">
                Need at least 5 photos for curation
              </p>
            </div>
          )}
        </div>
      )}
    </FeatureCard>
  );
};
