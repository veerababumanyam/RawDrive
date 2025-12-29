/**
 * GeminiSetupModal Component
 * Modal that prompts users to configure their Gemini API key when attempting
 * to use AI features without one configured.
 * Feature: 003-user-gemini-settings, 010-ai-powered-features
 */

import React, { useState, useCallback, useEffect } from 'react';
import { X, Sparkles, ExternalLink, Key, Check, Loader2, AlertCircle } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { geminiSettingsService } from '@/services/geminiSettingsService';
import type { UserGeminiSettings, KeyValidationResult } from '@/types/geminiSettings';

interface GeminiSetupModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when setup is complete */
  onSetupComplete?: () => void;
  /** Feature name that triggered the modal */
  featureName?: string;
}

export const GeminiSetupModal: React.FC<GeminiSetupModalProps> = ({
  isOpen,
  onClose,
  onSetupComplete,
  featureName = 'AI features',
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserGeminiSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Load current settings on mount
  useEffect(() => {
    if (!isOpen) return;

    const loadSettings = async () => {
      try {
        setLoading(true);
        const data = await geminiSettingsService.getSettings();
        setSettings(data);
        // If already has key, close and continue
        if (data.has_api_key) {
          onSetupComplete?.();
          onClose();
        }
      } catch {
        // User might not have settings yet, that's okay
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [isOpen, onClose, onSetupComplete]);

  const handleValidate = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    setValidating(true);
    setError(null);
    setValidated(false);

    try {
      const result: KeyValidationResult = await geminiSettingsService.validateKey(apiKey.trim());
      if (result.valid) {
        setValidated(true);
      } else {
        setError(result.error?.message || 'Invalid API key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate key');
    } finally {
      setValidating(false);
    }
  }, [apiKey]);

  const handleSave = useCallback(async () => {
    if (!validated) {
      await handleValidate();
      return;
    }

    setSaving(true);
    try {
      await geminiSettingsService.updateSettings({ api_key: apiKey.trim() });
      onSetupComplete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setSaving(false);
    }
  }, [apiKey, validated, handleValidate, onSetupComplete, onClose]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setValidated(false);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isProcessing = validating || saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gemini-setup-title"
    >
      <div className="relative w-full max-w-md bg-surface rounded-card border border-border shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-accent/10">
              <Sparkles className="w-6 h-6 text-accent" />
            </div>
            <h2 id="gemini-setup-title" className="text-xl font-semibold text-text-primary">
              Set Up AI Features
            </h2>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            To use <strong>{featureName}</strong>, you need to configure your Google Gemini API key.
            Your key is stored securely and used only for AI features in your workspace.
          </p>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : settings?.has_api_key ? (
            <div className="flex items-center gap-3 p-4 bg-success/5 border border-success/20 rounded-lg">
              <Check className="w-5 h-5 text-success flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">API key already configured</p>
                <p className="text-xs text-text-secondary">You can update it in Settings &gt; AI Settings</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* API Key input */}
              <div className="space-y-2">
                <label htmlFor="gemini-api-key" className="block text-sm font-medium text-text-primary">
                  Gemini API Key
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-text-tertiary" />
                  </div>
                  <input
                    type={showKey ? 'text' : 'password'}
                    id="gemini-api-key"
                    value={apiKey}
                    onChange={handleKeyChange}
                    placeholder="AIza..."
                    className={`
                      block w-full pl-10 pr-12 py-2.5 text-sm
                      bg-background border rounded-lg
                      text-text-primary placeholder-text-tertiary
                      focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${error ? 'border-error' : 'border-border'}
                    `}
                    disabled={isProcessing}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text-secondary"
                    disabled={isProcessing}
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Validation status */}
              {validated && !error && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <Check className="w-4 h-4" />
                  <span>API key validated successfully</span>
                </div>
              )}

              {/* Error display */}
              {error && (
                <div className="flex items-start gap-2 p-3 bg-error/5 border border-error/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-error">{error}</p>
                  </div>
                </div>
              )}

              {/* Help link */}
              <p className="text-xs text-text-tertiary">
                Get your free API key from{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover inline-flex items-center gap-1"
                >
                  Google AI Studio
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <AppButton variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </AppButton>
          {!settings?.has_api_key && (
            <>
              {!validated ? (
                <AppButton
                  variant="outline"
                  onClick={handleValidate}
                  disabled={!apiKey.trim() || isProcessing}
                >
                  {validating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Validating...
                    </>
                  ) : (
                    'Validate Key'
                  )}
                </AppButton>
              ) : (
                <AppButton variant="primary" onClick={handleSave} disabled={isProcessing}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save & Continue'
                  )}
                </AppButton>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeminiSetupModal;
