/**
 * PhotoAnalysisPanel Component
 * Displays AI-powered photo analysis results with quality scoring and suggestions
 * Feature: AI-powered photo features (US1)
 */

import React, { useState, useCallback } from 'react';
import { Sparkles, Star, Palette, Sun, Heart, Lightbulb, Target, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useToast } from '../../ui/Toast';
import { PhotoAnalysisService } from '../../../services/photoAnalysisService';
import type { PhotoAnalysisResult } from '../../../types/aiFeatures';

interface PhotoAnalysisPanelProps {
  workspaceId: string;
  assetId: string;
  photoUrl: string;
  onAnalysisComplete?: (result: PhotoAnalysisResult) => void;
  initialAnalysis?: PhotoAnalysisResult | null;
}

const QualityBadge: React.FC<{ score: number }> = ({ score }) => {
  const getQualityLabel = (score: number) => {
    if (score >= 90) return { label: 'Excellent', color: 'text-success bg-success/10' };
    if (score >= 75) return { label: 'Good', color: 'text-accent bg-accent/10' };
    if (score >= 60) return { label: 'Fair', color: 'text-warning bg-warning/10' };
    if (score >= 40) return { label: 'Needs Work', color: 'text-orange-500 bg-orange-500/10' };
    return { label: 'Poor', color: 'text-error bg-error/10' };
  };

  const { label, color } = getQualityLabel(score);
  const stars = Math.round(score / 20);

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${color}`}>
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${i <= stars ? 'fill-current' : 'opacity-30'}`}
          />
        ))}
      </div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
};

const ScoreBar: React.FC<{ label: string; value: number; icon: React.ReactNode }> = ({ label, value, icon }) => {
  const getColor = (value: number) => {
    if (value >= 80) return 'bg-success';
    if (value >= 60) return 'bg-accent';
    if (value >= 40) return 'bg-warning';
    return 'bg-error';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-text-secondary">
          {icon}
          {label}
        </span>
        <span className="font-medium text-text-primary">{value}%</span>
      </div>
      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(value)} transition-all duration-500`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

const ColorSwatch: React.FC<{ color: string }> = ({ color }) => (
  <div
    className="w-8 h-8 rounded-lg border border-border shadow-sm"
    style={{ backgroundColor: color }}
    title={color}
  />
);

export const PhotoAnalysisPanel: React.FC<PhotoAnalysisPanelProps> = ({
  workspaceId,
  assetId,
  photoUrl,
  onAnalysisComplete,
  initialAnalysis,
}) => {
  const [analysis, setAnalysis] = useState<PhotoAnalysisResult | null>(initialAnalysis || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();

  const handleAnalyze = useCallback(async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await PhotoAnalysisService.analyzePhoto(workspaceId, assetId, {
        photo_url: photoUrl,
      });

      setAnalysis(result);
      onAnalysisComplete?.(result);
      addToast({ message: 'Photo analyzed successfully', variant: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze photo';

      // Check for AI not configured error
      if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
        setError('AI features require a Gemini API key. Configure it in Settings > AI & Gemini.');
      } else {
        setError(errorMessage);
      }

      addToast({ message: 'Analysis failed', variant: 'error' });
    } finally {
      setIsAnalyzing(false);
    }
  }, [workspaceId, assetId, photoUrl, onAnalysisComplete, addToast]);

  // Not analyzed yet - show CTA
  if (!analysis && !isAnalyzing && !error) {
    return (
      <AppCard padding="md" className="text-center">
        <Sparkles className="w-12 h-12 mx-auto mb-4 text-accent opacity-60" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          AI Photo Analysis
        </h3>
        <p className="text-sm text-text-secondary mb-4">
          Get quality scores, color analysis, mood detection, and improvement suggestions
        </p>
        <AppButton
          variant="primary"
          onClick={handleAnalyze}
          leftIcon={<Sparkles className="w-4 h-4" />}
        >
          Analyze Photo
        </AppButton>
      </AppCard>
    );
  }

  // Loading state
  if (isAnalyzing) {
    return (
      <AppCard padding="md" className="text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 text-accent animate-spin" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Analyzing Photo...
        </h3>
        <p className="text-sm text-text-secondary">
          This may take a few seconds
        </p>
      </AppCard>
    );
  }

  // Error state
  if (error) {
    return (
      <AppCard padding="md" className="text-center">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-error opacity-60" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Analysis Failed
        </h3>
        <p className="text-sm text-text-secondary mb-4">{error}</p>
        <AppButton
          variant="outline"
          onClick={handleAnalyze}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Try Again
        </AppButton>
      </AppCard>
    );
  }

  // Guard for null analysis
  if (!analysis) {
    return null;
  }

  // Analysis results
  return (
    <div className="space-y-4">
      {/* Header with Quality Badge */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            Photo Analysis
          </h3>
          <QualityBadge score={analysis.quality_score} />
        </div>

        {/* Description */}
        <p className="text-sm text-text-secondary mb-4">
          {analysis.description}
        </p>

        {/* Quality Scores */}
        <div className="space-y-3">
          <ScoreBar
            label="Sharpness"
            value={analysis.sharpness}
            icon={<Target className="w-4 h-4" />}
          />
          <ScoreBar
            label="Exposure"
            value={analysis.exposure}
            icon={<Sun className="w-4 h-4" />}
          />
          <ScoreBar
            label="Composition"
            value={analysis.composition}
            icon={<Star className="w-4 h-4" />}
          />
        </div>
      </AppCard>

      {/* Colors & Mood */}
      <AppCard padding="md">
        <div className="grid grid-cols-2 gap-4">
          {/* Dominant Colors */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-1.5">
              <Palette className="w-4 h-4 text-accent" />
              Dominant Colors
            </h4>
            <div className="flex gap-2 flex-wrap">
              {analysis.dominant_colors.map((color, i) => (
                <ColorSwatch key={i} color={color} />
              ))}
            </div>
          </div>

          {/* Lighting & Mood */}
          <div>
            <h4 className="text-sm font-medium text-text-primary mb-2 flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-accent" />
              Mood & Lighting
            </h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-secondary capitalize">{analysis.lighting}</span>
              </div>
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm text-text-secondary capitalize">{analysis.mood}</span>
              </div>
            </div>
          </div>
        </div>
      </AppCard>

      {/* Improvements */}
      {analysis.improvements.length > 0 && (
        <AppCard padding="md">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-warning" />
            Suggestions for Improvement
          </h4>
          <ul className="space-y-2">
            {analysis.improvements.map((suggestion, i) => (
              <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                <span className="w-5 h-5 flex-shrink-0 rounded-full bg-warning/10 text-warning text-xs flex items-center justify-center">
                  {i + 1}
                </span>
                {suggestion}
              </li>
            ))}
          </ul>
        </AppCard>
      )}

      {/* Best For */}
      {analysis.best_for.length > 0 && (
        <AppCard padding="md">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
            <Target className="w-4 h-4 text-success" />
            Best For
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.best_for.map((use, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-success/10 text-success text-xs rounded-full capitalize"
              >
                {use}
              </span>
            ))}
          </div>
        </AppCard>
      )}

      {/* Re-analyze Button */}
      <div className="flex justify-end">
        <AppButton
          variant="ghost"
          size="sm"
          onClick={handleAnalyze}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Re-analyze
        </AppButton>
      </div>
    </div>
  );
};

export default PhotoAnalysisPanel;
