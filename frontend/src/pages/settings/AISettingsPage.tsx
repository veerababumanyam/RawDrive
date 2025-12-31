/**
 * AI Settings Page
 * User Story 1 & 2: Configure Gemini API Key and Select Model
 * Feature: 003-user-gemini-settings (T019, T028)
 * Feature: 010-ai-powered-features (T080 - AI feature toggles)
 *
 * Allows users to:
 * - Configure their Gemini API key
 * - Select preferred model from admin-managed catalogue
 * - View connection status
 * - Enable/disable specific AI features
 * - Revoke API key
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Key,
  Cpu,
  Loader2,
  AlertCircle,
  Check,
  XCircle,
  ExternalLink,
  Trash2,
  ToggleLeft,
} from 'lucide-react';
import { useGeminiSettingsPage, useAIFeatureToggles } from '../../hooks/useGeminiSettings';
import GeminiApiKeyForm from '../../components/settings/GeminiApiKeyForm';
import GeminiModelSelector from '../../components/settings/GeminiModelSelector';
import AIFeatureTogglesSection from '../../components/settings/AIFeatureTogglesSection';
import { AppButton } from '../../components/ui/AppButton';
import type { GeminiSettingsStatus, AIFeatureToggles } from '../../types/geminiSettings';

/* =============================================================================
   Status Badge Component
   ============================================================================= */

interface StatusBadgeProps {
  status: GeminiSettingsStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const config = {
    connected: {
      icon: Check,
      text: 'Connected',
      className: 'bg-success/10 text-success border-success/20',
    },
    not_configured: {
      icon: AlertCircle,
      text: 'Not Configured',
      className: 'bg-warning/10 text-warning border-warning/20',
    },
    validation_failed: {
      icon: XCircle,
      text: 'Connection Failed',
      className: 'bg-error/10 text-error border-error/20',
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${config.className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.text}
    </span>
  );
};

/* =============================================================================
   Section Card Component
   ============================================================================= */

interface SectionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  icon,
  title,
  description,
  children,
  badge,
}) => (
  <div className="bg-surface rounded-2xl border border-border overflow-hidden">
    <div className="px-6 py-4 border-b border-border bg-surface-hover/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            {icon}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">{title}</h3>
            <p className="text-sm text-text-secondary">{description}</p>
          </div>
        </div>
        {badge}
      </div>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

/* =============================================================================
   AI Settings Page
   ============================================================================= */

const AISettingsPage: React.FC = () => {
  const {
    settings,
    models,
    loading,
    settingsLoading,
    modelsLoading,
    settingsError,
    updateSettings,
    validateKey,
    revokeKey,
    updateModelSelection,
  } = useGeminiSettingsPage();

  const {
    featureToggles,
    loading: togglesLoading,
    error: togglesError,
    toggleFeature,
    refetch: refetchToggles,
  } = useAIFeatureToggles();

  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [togglingFeature, setTogglingFeature] = useState<keyof AIFeatureToggles | null>(null);

  // Handle feature toggle
  const handleToggleFeature = useCallback(
    async (feature: keyof AIFeatureToggles) => {
      setTogglingFeature(feature);
      try {
        await toggleFeature(feature);
      } finally {
        setTogglingFeature(null);
      }
    },
    [toggleFeature]
  );

  // Handle saving API key
  const handleSaveKey = useCallback(
    async (apiKey: string) => {
      await updateSettings({ api_key: apiKey });
      // Refetch feature toggles since they depend on API key status
      await refetchToggles();
    },
    [updateSettings, refetchToggles]
  );

  // Handle revoking API key
  const handleRevoke = useCallback(async () => {
    setRevoking(true);
    try {
      await revokeKey();
      setShowRevokeConfirm(false);
      // Refetch feature toggles since they depend on API key status
      await refetchToggles();
    } finally {
      setRevoking(false);
    }
  }, [revokeKey, refetchToggles]);

  // Loading state
  if (settingsLoading && !settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Error state
  if (settingsError && !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <AlertCircle className="w-12 h-12 text-error mb-4" />
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          Failed to load settings
        </h3>
        <p className="text-text-secondary mb-4">
          {settingsError.message || 'An error occurred while loading your settings.'}
        </p>
        <AppButton variant="outline" onClick={() => window.location.reload()}>
          Try Again
        </AppButton>
      </div>
    );
  }

  const status = settings?.status || 'not_configured';
  const hasApiKey = settings?.has_api_key || false;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-accent" />
          AI & Gemini Settings
        </h1>
        <p className="text-text-secondary mt-1">
          Configure your Gemini API key and model preferences for AI-powered features.
        </p>
      </div>

      {/* Status overview */}
      {hasApiKey && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <StatusBadge status={status} />
              {settings?.api_key_masked && (
                <span className="text-sm text-text-secondary font-mono">
                  {settings.api_key_masked}
                </span>
              )}
            </div>
            {settings?.last_validated_at && (
              <p className="text-xs text-text-tertiary">
                Last validated:{' '}
                {new Date(settings.last_validated_at).toLocaleDateString()}
              </p>
            )}
          </div>

          {settings?.validation_error && (
            <div className="mt-3 p-3 bg-error/5 border border-error/20 rounded-lg">
              <p className="text-sm text-error">{settings.validation_error}</p>
            </div>
          )}
        </div>
      )}

      {/* API Key Section */}
      <SectionCard
        icon={<Key className="w-5 h-5 text-primary" />}
        title="API Key"
        description="Your personal Gemini API key for AI features"
        badge={hasApiKey ? <StatusBadge status={status} /> : undefined}
      >
        <GeminiApiKeyForm
          onSave={handleSaveKey}
          onValidate={validateKey}
          loading={loading}
          hasExistingKey={hasApiKey}
          maskedKey={settings?.api_key_masked}
        />
      </SectionCard>

      {/* Model Selection Section */}
      <SectionCard
        icon={<Cpu className="w-5 h-5 text-primary" />}
        title="Model Selection"
        description="Choose your preferred Gemini model"
      >
        <GeminiModelSelector
          models={models}
          settings={settings}
          onSelect={updateModelSelection}
          loading={loading}
          modelsLoading={modelsLoading}
          disabled={!hasApiKey}
        />
      </SectionCard>

      {/* AI Feature Toggles Section */}
      <SectionCard
        icon={<ToggleLeft className="w-5 h-5 text-primary" />}
        title="AI Features"
        description="Enable or disable specific AI-powered features"
      >
        <AIFeatureTogglesSection
          featureToggles={featureToggles}
          onToggle={handleToggleFeature}
          loading={togglesLoading}
          error={togglesError}
          togglingFeature={togglingFeature}
        />
      </SectionCard>

      {/* Revoke Key Section */}
      {hasApiKey && (
        <SectionCard
          icon={<Trash2 className="w-5 h-5 text-error" />}
          title="Revoke API Key"
          description="Remove your stored API key"
        >
          {!showRevokeConfirm ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Revoking your API key will disable AI features until you configure a new key.
                Your model preference will be preserved.
              </p>
              <AppButton
                variant="outline"
                onClick={() => setShowRevokeConfirm(true)}
                className="border-error/50 text-error hover:bg-error/5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Revoke API Key
              </AppButton>
            </div>
          ) : (
            <div className="p-4 bg-error/5 border border-error/20 rounded-lg space-y-4">
              <p className="text-sm text-text-primary">
                Are you sure you want to revoke your API key? This action cannot be undone.
              </p>
              <div className="flex items-center gap-3">
                <AppButton
                  variant="destructive"
                  onClick={handleRevoke}
                  disabled={revoking}
                >
                  {revoking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Revoking...
                    </>
                  ) : (
                    'Yes, Revoke Key'
                  )}
                </AppButton>
                <AppButton
                  variant="outline"
                  onClick={() => setShowRevokeConfirm(false)}
                  disabled={revoking}
                >
                  Cancel
                </AppButton>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Help Section */}
      <div className="bg-surface rounded-xl border border-border p-6">
        <h3 className="font-semibold text-text-primary mb-3">Need Help?</h3>
        <ul className="space-y-2 text-sm text-text-secondary">
          <li className="flex items-start gap-2">
            <span className="text-accent">1.</span>
            <span>
              Get your API key from{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary-hover inline-flex items-center gap-1"
              >
                Google AI Studio
                <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">2.</span>
            <span>Paste your API key above and click "Validate Key"</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">3.</span>
            <span>Once validated, click "Save API Key" to store it securely</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-accent">4.</span>
            <span>Optionally select a preferred model from the catalogue</span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default AISettingsPage;
