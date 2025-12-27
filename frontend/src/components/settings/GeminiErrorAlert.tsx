/**
 * Gemini Error Alert Component
 *
 * Displays user-friendly error messages for AI-related failures.
 * Provides actionable guidance based on error type.
 * Feature: 003-user-gemini-settings
 */

import React from 'react';
import { AlertCircle, RefreshCw, Settings, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppButton } from '../ui/AppButton';
import type { GeminiErrorCode } from '../../types/geminiSettings';

// ---------------------------------------------------------------------------
// Error Configuration
// ---------------------------------------------------------------------------

interface ErrorConfig {
  title: string;
  message: string;
  hint: string;
  action: 'settings' | 'retry' | 'external' | 'none';
  externalLink?: string;
}

const ERROR_CONFIGS: Record<string, ErrorConfig> = {
  AI_NOT_CONFIGURED: {
    title: 'AI Not Configured',
    message: 'You need to add your Gemini API key to use AI features.',
    hint: 'Get a free API key from Google AI Studio and add it in your settings.',
    action: 'settings',
  },
  AI_KEY_INVALID: {
    title: 'API Key Invalid',
    message: 'Your Gemini API key is no longer valid.',
    hint: 'Please update your API key in settings. It may have been revoked or expired.',
    action: 'settings',
  },
  INVALID_KEY: {
    title: 'Invalid API Key',
    message: 'The API key format appears invalid.',
    hint: 'Please check that you copied the entire key from Google AI Studio.',
    action: 'settings',
  },
  KEY_UNAUTHORIZED: {
    title: 'Key Not Authorized',
    message: 'This API key is not authorized to access Gemini.',
    hint: 'Please verify your key is active in Google AI Studio.',
    action: 'settings',
  },
  KEY_FORBIDDEN: {
    title: 'Access Denied',
    message: "Your API key doesn't have permission to access this model.",
    hint: 'Check your Google Cloud project settings and API access.',
    action: 'external',
    externalLink: 'https://console.cloud.google.com/apis/credentials',
  },
  RATE_LIMITED: {
    title: 'Usage Limit Reached',
    message: "You've reached your Gemini API usage limit.",
    hint: 'Please wait a few minutes or check your Google account quota.',
    action: 'retry',
  },
  SERVICE_UNAVAILABLE: {
    title: 'Service Unavailable',
    message: 'Gemini is temporarily unavailable.',
    hint: 'This is usually temporary. Please try again in a few minutes.',
    action: 'retry',
  },
  SERVICE_ERROR: {
    title: 'Service Error',
    message: 'The AI service encountered an error.',
    hint: 'Please try again. If the problem persists, the issue may be on Google\'s end.',
    action: 'retry',
  },
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Unable to connect to the AI service.',
    hint: 'Please check your internet connection and try again.',
    action: 'retry',
  },
  TIMEOUT: {
    title: 'Request Timeout',
    message: 'The AI request took too long to complete.',
    hint: 'Large requests may take longer. Try with a smaller input or try again.',
    action: 'retry',
  },
  NO_MODELS_AVAILABLE: {
    title: 'No Models Available',
    message: 'No AI models are currently configured.',
    hint: 'Please contact your administrator to configure AI models.',
    action: 'none',
  },
  DECRYPTION_FAILED: {
    title: 'Configuration Error',
    message: 'Unable to access your AI configuration.',
    hint: 'Please re-configure your API key in settings.',
    action: 'settings',
  },
  UNKNOWN_ERROR: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred.',
    hint: 'Please try again. If the problem persists, contact support.',
    action: 'retry',
  },
};

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

interface GeminiErrorAlertProps {
  /** Error code from the API */
  errorCode: string | GeminiErrorCode;
  /** Optional custom message override */
  customMessage?: string;
  /** Optional custom hint override */
  customHint?: string;
  /** Callback for retry action */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Optional className for styling */
  className?: string;
  /** Compact mode for inline errors */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GeminiErrorAlert: React.FC<GeminiErrorAlertProps> = ({
  errorCode,
  customMessage,
  customHint,
  onRetry,
  isRetrying = false,
  className = '',
  compact = false,
}) => {
  const navigate = useNavigate();
  const config = ERROR_CONFIGS[errorCode] || ERROR_CONFIGS.UNKNOWN_ERROR;
  const message = customMessage || config.message;
  const hint = customHint || config.hint;

  const handleGoToSettings = () => {
    navigate('/settings/ai');
  };

  const handleExternalLink = () => {
    if (config.externalLink) {
      window.open(config.externalLink, '_blank', 'noopener,noreferrer');
    }
  };

  if (compact) {
    return (
      <div
        className={`flex items-start gap-2 p-3 bg-error/10 border border-error/20 rounded-lg text-sm ${className}`}
        role="alert"
      >
        <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-error font-medium">{message}</p>
          {hint && <p className="text-error/80 text-xs mt-0.5">{hint}</p>}
        </div>
        {config.action === 'retry' && onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="p-1 rounded hover:bg-error/10 transition-colors"
            aria-label="Retry"
          >
            <RefreshCw className={`w-4 h-4 text-error ${isRetrying ? 'animate-spin' : ''}`} />
          </button>
        )}
        {config.action === 'settings' && (
          <button
            onClick={handleGoToSettings}
            className="p-1 rounded hover:bg-error/10 transition-colors"
            aria-label="Go to settings"
          >
            <Settings className="w-4 h-4 text-error" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`glass-card rounded-xl p-6 border-l-4 border-error ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-4">
        <div className="p-2 rounded-lg bg-error/10">
          <AlertCircle className="w-6 h-6 text-error" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-text-primary mb-1">{config.title}</h3>
          <p className="text-text-secondary mb-2">{message}</p>
          <p className="text-sm text-text-tertiary">{hint}</p>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            {config.action === 'settings' && (
              <AppButton
                variant="primary"
                size="sm"
                onClick={handleGoToSettings}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Go to Settings
              </AppButton>
            )}

            {config.action === 'retry' && onRetry && (
              <AppButton
                variant="primary"
                size="sm"
                onClick={onRetry}
                disabled={isRetrying}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : 'Try Again'}
              </AppButton>
            )}

            {config.action === 'external' && (
              <AppButton
                variant="primary"
                size="sm"
                onClick={handleExternalLink}
                className="flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open Google Cloud
              </AppButton>
            )}

            {/* Always show settings link as secondary for configuration errors */}
            {config.action === 'retry' && (
              <AppButton
                variant="outline"
                size="sm"
                onClick={handleGoToSettings}
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Check Settings
              </AppButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inline Error Component (for smaller contexts)
// ---------------------------------------------------------------------------

interface GeminiInlineErrorProps {
  errorCode: string | GeminiErrorCode;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export const GeminiInlineError: React.FC<GeminiInlineErrorProps> = ({
  errorCode,
  onRetry,
  isRetrying,
}) => {
  return (
    <GeminiErrorAlert
      errorCode={errorCode}
      onRetry={onRetry}
      isRetrying={isRetrying}
      compact
    />
  );
};

export default GeminiErrorAlert;
