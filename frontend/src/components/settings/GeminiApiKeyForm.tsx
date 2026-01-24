/**
 * GeminiApiKeyForm Component
 * Form for entering and validating a Gemini API key.
 * Feature: 003-user-gemini-settings
 *
 * Key requirements from FR-005:
 * - Does NOT clear input on validation failure
 * - Shows clear error messages with hints
 * - Provides link to Google AI Studio
 */

import React, { useState, useCallback } from 'react';
import { Eye, EyeOff, Key, Loader2, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { GEMINI_ERROR_MESSAGES, type GeminiErrorCode, type KeyValidationResult } from '../../types/geminiSettings';

interface GeminiApiKeyFormProps {
  /** Called when key is validated and should be saved */
  onSave: (apiKey: string) => Promise<void>;
  /** Validate the API key before saving */
  onValidate: (apiKey: string) => Promise<KeyValidationResult>;
  /** Current loading state */
  loading?: boolean;
  /** Whether user already has a key configured */
  hasExistingKey?: boolean;
  /** Masked key display (e.g., "AIza...XYZ1") */
  maskedKey?: string | null;
}

export const GeminiApiKeyForm: React.FC<GeminiApiKeyFormProps> = ({
  onSave,
  onValidate,
  loading = false,
  hasExistingKey = false,
  maskedKey,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ code: GeminiErrorCode; message: string; hint?: string } | null>(null);
  const [validated, setValidated] = useState(false);

  const handleValidate = useCallback(async () => {
    if (!apiKey.trim()) {
      setError({
        code: 'INVALID_KEY',
        message: 'Please enter an API key',
        hint: 'You can get one from Google AI Studio',
      });
      return;
    }

    setValidating(true);
    setError(null);
    setValidated(false);

    try {
      const result = await onValidate(apiKey.trim());

      if (result.valid) {
        setValidated(true);
      } else if (result.error) {
        // Use error from API or fall back to local mapping
        const errorInfo = GEMINI_ERROR_MESSAGES[result.error.error as GeminiErrorCode] || {
          message: result.error.message,
          hint: result.error.hint,
        };
        setError({
          code: result.error.error as GeminiErrorCode,
          message: errorInfo.message || result.error.message,
          hint: errorInfo.hint || result.error.hint,
        });
        // FR-005: Do NOT clear input on validation failure
      }
    } catch {
      setError({
        code: 'NETWORK_ERROR',
        message: GEMINI_ERROR_MESSAGES.NETWORK_ERROR.message,
        hint: GEMINI_ERROR_MESSAGES.NETWORK_ERROR.hint,
      });
    } finally {
      setValidating(false);
    }
  }, [apiKey, onValidate]);

  const handleSave = useCallback(async () => {
    // If not validated and not empty, try to validate first
    if (!validated && apiKey.trim()) {
      setValidating(true);
      setError(null);
      setValidated(false);

      try {
        const result = await onValidate(apiKey.trim());

        if (result.valid) {
          setValidated(true);
          // Continue to save
        } else {
          // Validation failed, show error and stop
          if (result.error) {
            const errorInfo = GEMINI_ERROR_MESSAGES[result.error.error as GeminiErrorCode] || {
              message: result.error.message,
              hint: result.error.hint,
            };
            setError({
              code: result.error.error as GeminiErrorCode,
              message: errorInfo.message || result.error.message,
              hint: errorInfo.hint || result.error.hint,
            });
          } else {
            // Fallback error
            setError({
              code: 'INVALID_KEY',
              message: 'Invalid API key',
            });
          }
          setValidating(false);
          return;
        }
      } catch {
        setError({
          code: 'NETWORK_ERROR',
          message: GEMINI_ERROR_MESSAGES.NETWORK_ERROR.message,
          hint: GEMINI_ERROR_MESSAGES.NETWORK_ERROR.hint,
        });
        setValidating(false);
        return;
      }
      setValidating(false);
    } else if (!apiKey.trim()) {
      return;
    }

    // Proceed to save
    setSaving(true);
    try {
      await onSave(apiKey.trim());
      setApiKey('');
      setValidated(false);
    } catch {
      setError({
        code: 'NETWORK_ERROR',
        message: 'Failed to save API key',
        hint: 'Please try again',
      });
    } finally {
      setSaving(false);
    }
  }, [apiKey, validated, onSave, onValidate]);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    setValidated(false);
    setError(null);
  };

  const isLoading = loading || validating || saving;

  return (
    <div className="space-y-4">
      {/* Existing key display */}
      {hasExistingKey && maskedKey && (
        <div className="flex items-center gap-3 p-3 bg-success/5 border border-success/20 rounded-lg">
          <Check className="w-5 h-5 text-success flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">API key configured</p>
            <p className="text-xs text-text-secondary font-mono">{maskedKey}</p>
          </div>
        </div>
      )}

      {/* API Key input */}
      <div className="space-y-2">
        <label
          htmlFor="gemini-api-key"
          className="block text-sm font-medium text-text-primary"
        >
          {hasExistingKey ? 'Update API Key' : 'Gemini API Key'}
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
              block w-full pl-10 pr-20 py-2.5 text-sm
              bg-white/5 border rounded-lg
              text-text-primary placeholder-text-tertiary
              focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary
              disabled:opacity-50 disabled:cursor-not-allowed
              ${error ? 'border-error' : 'border-white/10'}
            `}
            disabled={isLoading}
            aria-invalid={!!error}
            aria-describedby={error ? 'api-key-error' : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-tertiary hover:text-text-secondary transition-colors"
            disabled={isLoading}
            aria-label={showKey ? 'Hide API key' : 'Show API key'}
          >
            {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
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
          <div
            id="api-key-error"
            role="alert"
            className="flex items-start gap-2 p-3 bg-error/5 border border-error/20 rounded-lg"
          >
            <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-error">{error.message}</p>
              {error.hint && (
                <p className="text-xs text-text-secondary mt-1">{error.hint}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <AppButton
          type="button"
          variant="outline"
          onClick={handleValidate}
          disabled={!apiKey.trim() || isLoading}
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

        <AppButton
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={!apiKey.trim() || isLoading}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            'Save API Key'
          )}
        </AppButton>
      </div>

      {/* Help link */}
      <p className="text-xs text-text-tertiary">
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
      </p>
    </div>
  );
};

export default GeminiApiKeyForm;
