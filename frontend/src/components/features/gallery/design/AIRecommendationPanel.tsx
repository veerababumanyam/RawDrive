/**
 * AI Recommendation Panel Component
 *
 * Displays AI-powered design recommendations for gallery covers, themes, and fonts.
 * Shows:
 * - Top 5 recommended cover styles with reasoning
 * - Best matching theme with explanation
 * - Recommended font pairing
 * - Analysis summary (colors, composition, aspect ratios)
 *
 * Features:
 * - Loading state with spinner
 * - Error handling with retry
 * - Apply recommendation flow
 * - Empty state when no data
 *
 * Feature: Enhancement 4 - AI Recommendations
 */

import React, { useState } from 'react';
import galleryDesignService from '../../../../services/galleryDesignService';
import { AppButton } from '../../../ui/AppButton';
import { Alert, AlertDescription } from '../../../ui/Alert';
import { Loader } from 'lucide-react';

interface AIRecommendationPanelProps {
  galleryId: string;
  onApplyStyle?: (styleId: string) => void;
  onApplyTheme?: (themeId: string) => void;
  onApplyFont?: (pairingId: string) => void;
}

interface RecommendedStyle {
  style_id: string;
  score: number;
  reasoning: string;
}

interface RecommendedTheme {
  theme_id: string;
  score: number;
  reasoning: string;
}

interface RecommendedFontPairing {
  pairing_id: string;
  score: number;
  reasoning: string;
}

interface AnalysisSummary {
  total_photos: number;
  sample_size: number;
  dominant_colors: Array<[number, number, number]>;
  avg_brightness: number;
  avg_saturation: number;
  aspect_ratio_breakdown: {
    portrait: number;
    landscape: number;
    square: number;
  };
  color_temperature: {
    warm_percentage: number;
    cool_percentage: number;
  };
  scene_categories: Record<string, number>;
}

interface Recommendations {
  gallery_id: string;
  recommended_styles: RecommendedStyle[];
  recommended_theme: RecommendedTheme;
  recommended_font_pairing: RecommendedFontPairing;
  analysis_summary: AnalysisSummary;
  cached: boolean;
  generated_at: string;
}

export const AIRecommendationPanel: React.FC<AIRecommendationPanelProps> = ({
  galleryId,
  onApplyStyle,
  onApplyTheme,
  onApplyFont,
}) => {
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAnalysis, setExpandedAnalysis] = useState(false);

  const handleGetRecommendations = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await galleryDesignService.getAIRecommendations(galleryId);
      setRecommendations(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate recommendations';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRecommendations(null);
    handleGetRecommendations();
  };

  // Empty state - no recommendations generated yet
  if (!recommendations && !loading && !error) {
    return (
      <div className="space-y-4 p-6 bg-bg-secondary rounded-lg border border-border-default">
        <div className="flex items-center gap-3">
          <div className="text-2xl">✨</div>
          <h3 className="font-semibold text-text-primary">AI Design Recommendations</h3>
        </div>
        <p className="text-sm text-text-secondary">
          Get AI-powered suggestions for cover styles, themes, and fonts based on your gallery photos.
        </p>
        <AppButton onClick={handleGetRecommendations} fullWidth leftIcon={<span>🤖</span>}>
          Get Recommendations
        </AppButton>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4 p-6 bg-bg-secondary rounded-lg border border-border-default">
        <div className="flex items-center gap-3">
          <Loader className="w-5 h-5 animate-spin text-accent-primary" />
          <span className="text-sm text-text-secondary">Analyzing your gallery photos...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <AppButton onClick={handleRetry} variant="secondary" fullWidth>
          Try Again
        </AppButton>
      </div>
    );
  }

  // Recommendations loaded
  if (recommendations) {
    return (
      <div className="space-y-6">
        {/* Header with refresh */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <span>✨</span> AI Recommendations
          </h3>
          <AppButton
            onClick={handleGetRecommendations}
            variant="ghost"
            size="sm"
            disabled={loading}
          >
            Refresh
          </AppButton>
        </div>

        {/* Cache indicator */}
        {recommendations.cached && (
          <div className="px-3 py-2 bg-bg-tertiary rounded text-xs text-text-secondary">
            📦 From cache ({new Date(recommendations.generated_at).toLocaleTimeString()})
          </div>
        )}

        {/* Recommended Styles Card */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-text-primary">Recommended Cover Styles</h4>
          <div className="space-y-2">
            {recommendations.recommended_styles.map((style, idx) => (
              <div
                key={style.style_id}
                className="p-3 bg-bg-tertiary rounded-lg border border-border-default hover:border-accent-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-accent-primary">#{idx + 1}</span>
                      <span className="font-medium text-sm text-text-primary capitalize">
                        {style.style_id}
                      </span>
                      <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent-primary rounded-full transition-all"
                          style={{ width: `${style.score * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-text-secondary font-medium">
                        {Math.round(style.score * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {style.reasoning}
                    </p>
                  </div>
                  <AppButton
                    onClick={() => onApplyStyle?.(style.style_id)}
                    variant="secondary"
                    size="sm"
                    className="flex-shrink-0"
                  >
                    Apply
                  </AppButton>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recommended Theme Card */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-text-primary">Recommended Theme</h4>
          <div className="p-4 bg-bg-tertiary rounded-lg border border-border-default">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-text-primary capitalize">
                    {recommendations.recommended_theme.theme_id}
                  </span>
                  <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden min-w-[80px]">
                    <div
                      className="h-full bg-accent-primary rounded-full"
                      style={{
                        width: `${recommendations.recommended_theme.score * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary font-medium">
                    {Math.round(recommendations.recommended_theme.score * 100)}%
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {recommendations.recommended_theme.reasoning}
                </p>
              </div>
              <AppButton
                onClick={() => onApplyTheme?.(recommendations.recommended_theme.theme_id)}
                variant="secondary"
                size="sm"
                className="flex-shrink-0"
              >
                Apply
              </AppButton>
            </div>
          </div>
        </div>

        {/* Recommended Font Pairing Card */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-text-primary">Recommended Font Pairing</h4>
          <div className="p-4 bg-bg-tertiary rounded-lg border border-border-default">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-text-primary capitalize">
                    {recommendations.recommended_font_pairing.pairing_id}
                  </span>
                  <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden min-w-[80px]">
                    <div
                      className="h-full bg-accent-primary rounded-full"
                      style={{
                        width: `${recommendations.recommended_font_pairing.score * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary font-medium">
                    {Math.round(recommendations.recommended_font_pairing.score * 100)}%
                  </span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  {recommendations.recommended_font_pairing.reasoning}
                </p>
              </div>
              <AppButton
                onClick={() => onApplyFont?.(recommendations.recommended_font_pairing.pairing_id)}
                variant="secondary"
                size="sm"
                className="flex-shrink-0"
              >
                Apply
              </AppButton>
            </div>
          </div>
        </div>

        {/* Analysis Summary (Collapsible) */}
        <div className="border-t border-border-default pt-4">
          <button
            onClick={() => setExpandedAnalysis(!expandedAnalysis)}
            className="w-full text-left flex items-center gap-2 py-2 px-3 hover:bg-bg-secondary rounded transition-colors"
          >
            <span className="text-xs font-medium text-text-secondary uppercase">
              Analysis Summary
            </span>
            <span className={`transition-transform ml-auto ${expandedAnalysis ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {expandedAnalysis && (
            <div className="mt-3 space-y-3 px-3">
              {/* Photo Statistics */}
              <div className="text-xs space-y-1">
                <p className="text-text-secondary font-medium">Photo Analysis</p>
                <p className="text-text-tertiary">
                  Total photos: {recommendations.analysis_summary.total_photos} •
                  Sample size: {recommendations.analysis_summary.sample_size}
                </p>
              </div>

              {/* Aspect Ratios */}
              <div className="text-xs space-y-1">
                <p className="text-text-secondary font-medium">Aspect Ratios</p>
                <div className="flex gap-2 text-text-tertiary">
                  <span>
                    📸 Portrait: {recommendations.analysis_summary.aspect_ratio_breakdown.portrait}
                  </span>
                  <span>
                    🏔️ Landscape:{' '}
                    {recommendations.analysis_summary.aspect_ratio_breakdown.landscape}
                  </span>
                  <span>
                    ⬜ Square: {recommendations.analysis_summary.aspect_ratio_breakdown.square}
                  </span>
                </div>
              </div>

              {/* Color Temperature */}
              <div className="text-xs space-y-1">
                <p className="text-text-secondary font-medium">Color Temperature</p>
                <div className="flex gap-2 text-text-tertiary">
                  <span>
                    🔥 Warm:{' '}
                    {Math.round(
                      recommendations.analysis_summary.color_temperature.warm_percentage * 100
                    )}
                    %
                  </span>
                  <span>
                    ❄️ Cool:{' '}
                    {Math.round(
                      recommendations.analysis_summary.color_temperature.cool_percentage * 100
                    )}
                    %
                  </span>
                </div>
              </div>

              {/* Dominant Colors */}
              {recommendations.analysis_summary.dominant_colors.length > 0 && (
                <div className="text-xs space-y-2">
                  <p className="text-text-secondary font-medium">Dominant Colors</p>
                  <div className="flex gap-1">
                    {recommendations.analysis_summary.dominant_colors.slice(0, 3).map((color, idx) => (
                      <div
                        key={idx}
                        className="w-8 h-8 rounded border border-border-default"
                        style={{
                          backgroundColor: `rgb(${color[0]}, ${color[1]}, ${color[2]})`,
                        }}
                        title={`RGB(${color[0]}, ${color[1]}, ${color[2]})`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Scene Categories */}
              {Object.keys(recommendations.analysis_summary.scene_categories).length > 0 && (
                <div className="text-xs space-y-1">
                  <p className="text-text-secondary font-medium">Detected Scene Categories</p>
                  <div className="text-text-tertiary">
                    {Object.entries(recommendations.analysis_summary.scene_categories)
                      .map(([category, count]) => `${category} (${count})`)
                      .join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default AIRecommendationPanel;
