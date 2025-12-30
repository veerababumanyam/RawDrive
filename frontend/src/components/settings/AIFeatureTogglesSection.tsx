/**
 * AI Feature Toggles Section
 * Allows users to enable/disable specific AI features.
 * Feature: 010-ai-powered-features
 * Task: T080
 */

import React from 'react';
import {
  Camera,
  FileText,
  Hash,
  BookOpen,
  Wand2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type {
  AIFeatureToggles,
  AIFeatureTogglesResponse,
} from '../../types/geminiSettings';

/* =============================================================================
   Feature Toggle Item Component
   ============================================================================= */

interface FeatureToggleItemProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const FeatureToggleItem: React.FC<FeatureToggleItemProps> = ({
  icon,
  name,
  description,
  enabled,
  onToggle,
  disabled = false,
  loading = false,
}) => (
  <div
    className={`flex items-start gap-4 p-4 rounded-xl border transition-all ${
      disabled
        ? 'bg-surface-hover/50 border-border opacity-60'
        : enabled
        ? 'bg-success/5 border-success/20 hover:border-success/40'
        : 'bg-surface border-border hover:border-border-focus'
    }`}
  >
    <div
      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        enabled ? 'bg-success/10 text-success' : 'bg-surface-hover text-text-tertiary'
      }`}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="font-medium text-text-primary">{name}</h4>
      <p className="text-sm text-text-secondary mt-0.5">{description}</p>
    </div>
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={`${enabled ? 'Disable' : 'Enable'} ${name}`}
      onClick={onToggle}
      disabled={disabled || loading}
      className="ai-toggle shrink-0"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-text-tertiary" />
      ) : (
        <span className="ai-toggle-thumb" />
      )}
    </button>
  </div>
);

/* =============================================================================
   Feature Configuration
   ============================================================================= */

interface FeatureConfig {
  key: keyof AIFeatureToggles;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const FEATURE_CONFIGS: FeatureConfig[] = [
  {
    key: 'photo_analysis',
    name: 'Photo Analysis',
    description: 'AI-powered quality assessment, tags, colors, lighting, and improvement suggestions',
    icon: <Camera className="w-5 h-5" />,
  },
  {
    key: 'captions',
    name: 'Caption Generation',
    description: 'Generate professional, casual, or poetic captions for your photos',
    icon: <FileText className="w-5 h-5" />,
  },
  {
    key: 'hashtags',
    name: 'Hashtag Generation',
    description: 'Generate categorized hashtags optimized for social media engagement',
    icon: <Hash className="w-5 h-5" />,
  },
  {
    key: 'gallery_story',
    name: 'Gallery Stories',
    description: 'AI-written narratives and descriptions for photo galleries and albums',
    icon: <BookOpen className="w-5 h-5" />,
  },
  {
    key: 'smart_curation',
    name: 'Smart Curation',
    description: 'AI-powered selection of best photos based on quality and diversity',
    icon: <Wand2 className="w-5 h-5" />,
  },
];

/* =============================================================================
   AI Feature Toggles Section
   ============================================================================= */

interface AIFeatureTogglesSectionProps {
  featureToggles: AIFeatureTogglesResponse | null;
  onToggle: (feature: keyof AIFeatureToggles) => Promise<void>;
  loading?: boolean;
  error?: Error | null;
  togglingFeature?: keyof AIFeatureToggles | null;
}

const AIFeatureTogglesSection: React.FC<AIFeatureTogglesSectionProps> = ({
  featureToggles,
  onToggle,
  loading = false,
  error = null,
  togglingFeature = null,
}) => {
  const hasApiKey = featureToggles?.has_api_key ?? false;
  const apiStatus = featureToggles?.api_status ?? 'not_configured';
  const toggles = featureToggles?.toggles;

  // Loading skeleton
  if (loading && !featureToggles) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-20 bg-surface-hover rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="w-10 h-10 text-error mb-3" />
        <p className="text-text-secondary">
          Failed to load feature settings. Please try again.
        </p>
      </div>
    );
  }

  // Disabled state (no API key)
  if (!hasApiKey || apiStatus !== 'connected') {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-warning/5 border border-warning/20 rounded-lg">
          <p className="text-sm text-warning">
            Configure your Gemini API key above to enable AI features.
          </p>
        </div>
        <div className="space-y-3 opacity-50 pointer-events-none">
          {FEATURE_CONFIGS.map((feature) => (
            <FeatureToggleItem
              key={feature.key}
              icon={feature.icon}
              name={feature.name}
              description={feature.description}
              enabled={false}
              onToggle={() => {}}
              disabled
            />
          ))}
        </div>
      </div>
    );
  }

  // Normal state with toggles
  return (
    <div className="space-y-3">
      {FEATURE_CONFIGS.map((feature) => (
        <FeatureToggleItem
          key={feature.key}
          icon={feature.icon}
          name={feature.name}
          description={feature.description}
          enabled={toggles?.[feature.key] ?? true}
          onToggle={() => onToggle(feature.key)}
          loading={togglingFeature === feature.key}
        />
      ))}
    </div>
  );
};

export default AIFeatureTogglesSection;
