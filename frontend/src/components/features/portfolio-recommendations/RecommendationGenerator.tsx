/**
 * Recommendation Generator Panel
 *
 * Form to generate new portfolio recommendations with various options.
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Users,
  Calendar,
  Image,
  Star,
  Settings,
  Loader2,
  ChevronDown,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  useGenerateRecommendations,
  useFindSimilarAssets,
  useSeasonalRecommendations,
} from '../../../hooks/usePortfolioRecommendations';
import type {
  RecommendationType,
  SceneCategory,
  Season,
  GenerateRecommendationsRequest,
  SeasonalRequest,
} from '../../../services/portfolioRecommendationService';

/* =============================================================================
   Types
   ============================================================================= */

interface RecommendationGeneratorProps {
  workspaceId: string;
  galleryIds?: string[];
  clientId?: string;
  onSuccess?: (recommendationId: string) => void;
  onCancel?: () => void;
}

type GeneratorMode = 'quick' | 'advanced';

/* =============================================================================
   Constants
   ============================================================================= */

const RECOMMENDATION_TYPES: { value: RecommendationType; label: string; description: string }[] = [
  { value: 'hero_shots', label: 'Hero Shots', description: 'Best overall photos from your portfolio' },
  { value: 'similar_style', label: 'Similar Style', description: 'Photos matching a specific style' },
  { value: 'personalized', label: 'Personalized', description: 'Based on client preferences' },
  { value: 'seasonal_picks', label: 'Seasonal', description: 'Themed for current season' },
  { value: 'trending_shots', label: 'Trending', description: 'Currently popular styles' },
  { value: 'quick_delivery', label: 'Quick Delivery', description: 'Fast turnaround recommendations' },
];

const SCENE_CATEGORIES: { value: SceneCategory; label: string }[] = [
  { value: 'ceremony', label: 'Ceremony' },
  { value: 'reception', label: 'Reception' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'detail', label: 'Detail' },
  { value: 'candid', label: 'Candid' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'group', label: 'Group' },
  { value: 'couple', label: 'Couple' },
  { value: 'family', label: 'Family' },
  { value: 'food', label: 'Food' },
  { value: 'venue', label: 'Venue' },
  { value: 'other', label: 'Other' },
];

const SEASONS: { value: Season; label: string }[] = [
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'fall', label: 'Fall' },
  { value: 'winter', label: 'Winter' },
];

const PURPOSES = [
  'Portfolio showcase',
  'Client gallery',
  'Social media',
  'Album design',
  'Marketing materials',
  'Website hero',
  'Print collection',
];

/* =============================================================================
   Main Component
   ============================================================================= */

export const RecommendationGenerator: React.FC<RecommendationGeneratorProps> = ({
  workspaceId,
  galleryIds,
  clientId,
  onSuccess,
  onCancel,
}) => {
  const { addToast } = useToast();

  // Form state
  const [mode, setMode] = useState<GeneratorMode>('quick');
  const [selectedType, setSelectedType] = useState<RecommendationType>('hero_shots');
  const [selectedCategories, setSelectedCategories] = useState<SceneCategory[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<Season | undefined>();
  const [purpose, setPurpose] = useState<string>('');
  const [limit, setLimit] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Mutations
  const generateRecommendationsMutation = useGenerateRecommendations(workspaceId);
  const seasonalRecommendationsMutation = useSeasonalRecommendations(workspaceId);

  const isPending = generateRecommendationsMutation.isPending;
  const isLoadingSeasonal = seasonalRecommendationsMutation.isPending;

  // Toggle category selection
  const toggleCategory = useCallback((category: SceneCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  // Handle generation
  const handleGenerate = useCallback(() => {
    if (selectedType === 'seasonal_picks' && selectedSeason) {
      const request: SeasonalRequest = {
        target_season: selectedSeason,
        gallery_ids: galleryIds,
        limit,
        occasion_type: purpose || undefined,
      };

      seasonalRecommendationsMutation.mutate(request, {
        onSuccess: (result) => {
          addToast({
            variant: 'success',
            message: `Generated ${result.items.length} seasonal recommendations`,
          });
          onSuccess?.(result.recommendation_id);
        },
        onError: (error) => {
          addToast({
            variant: 'error',
            message: error instanceof Error ? error.message : 'Failed to generate recommendations',
          });
        },
      });
      return;
    }

    const request: GenerateRecommendationsRequest = {
      recommendation_type: selectedType,
      source_gallery_ids: galleryIds,
      client_id: clientId,
      limit,
      filter_criteria: selectedCategories.length > 0 ? {
        scene_categories: selectedCategories,
      } : undefined,
    };

    generateRecommendationsMutation.mutate(request, {
      onSuccess: (result) => {
        addToast({
          variant: 'success',
          message: `Generated ${result.items.length} recommendations`,
        });
        onSuccess?.(result.recommendation_id);
      },
      onError: (error) => {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to generate recommendations',
        });
      },
    });
  }, [
    selectedType,
    selectedSeason,
    selectedCategories,
    galleryIds,
    clientId,
    limit,
    purpose,
    generateRecommendationsMutation,
    seasonalRecommendationsMutation,
    addToast,
    onSuccess,
  ]);

  const isLoading = isPending || isLoadingSeasonal;

  return (
    <div className="bg-surface-secondary rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            <h3 className="font-semibold text-text-primary">Generate Recommendations</h3>
          </div>
          <div className="flex gap-1 p-1 rounded-lg bg-surface-tertiary">
            <button
              onClick={() => setMode('quick')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                mode === 'quick'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Quick
            </button>
            <button
              onClick={() => setMode('advanced')}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                mode === 'advanced'
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Advanced
            </button>
          </div>
        </div>
        <p className="text-sm text-text-tertiary mt-1">
          {mode === 'quick'
            ? 'Get AI-powered recommendations with one click'
            : 'Customize your recommendation criteria'}
        </p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Recommendation Type */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Recommendation Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RECOMMENDATION_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selectedType === type.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <p className="text-sm font-medium text-text-primary">{type.label}</p>
                <p className="text-xs text-text-tertiary mt-0.5">{type.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Season (for seasonal type) */}
        <AnimatePresence>
          {selectedType === 'seasonal_picks' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <label className="block text-sm font-medium text-text-primary mb-2">
                Season
              </label>
              <div className="flex gap-2">
                {SEASONS.map((season) => (
                  <button
                    key={season.value}
                    onClick={() => setSelectedSeason(season.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-all ${
                      selectedSeason === season.value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    {season.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Advanced Options */}
        {mode === 'advanced' && (
          <>
            {/* Scene Categories */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Scene Categories (optional)
              </label>
              <div className="flex flex-wrap gap-2">
                {SCENE_CATEGORIES.map((category) => (
                  <button
                    key={category.value}
                    onClick={() => toggleCategory(category.value)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                      selectedCategories.includes(category.value)
                        ? 'bg-primary text-white'
                        : 'bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary/80'
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Purpose (optional)
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface-tertiary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select purpose...</option>
                {PURPOSES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            {/* Limit */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Number of Recommendations
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                  className="flex-1"
                />
                <span className="w-12 text-center text-sm font-medium text-text-primary">
                  {limit}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Info box */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <div className="flex gap-2">
            <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
            <div className="text-xs text-text-secondary">
              <p>
                Recommendations are generated using AI analysis of your portfolio's visual style,
                engagement metrics, and client preferences.
              </p>
              {galleryIds && galleryIds.length > 0 && (
                <p className="mt-1">
                  Analyzing {galleryIds.length} selected {galleryIds.length === 1 ? 'gallery' : 'galleries'}.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        {onCancel && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </AppButton>
        )}
        <AppButton
          variant="primary"
          size="sm"
          leftIcon={isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          onClick={handleGenerate}
          disabled={isLoading || (selectedType === 'seasonal_picks' && !selectedSeason)}
          className="ml-auto"
        >
          {isLoading ? 'Generating...' : 'Generate Recommendations'}
        </AppButton>
      </div>
    </div>
  );
};

export default RecommendationGenerator;
