/**
 * PreviewDownloadButton Component
 * Button for downloading album preview PDF
 *
 * Feature: 026-album-proofing
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import type { DownloadResponse } from '../../../types/album';

type DownloadState = 'ready' | 'checking' | 'generating' | 'downloading' | 'error';

interface PreviewDownloadButtonProps {
  onGetDownloadUrl: () => Promise<DownloadResponse>;
  disabled?: boolean;
  className?: string;
}

export function PreviewDownloadButton({
  onGetDownloadUrl,
  disabled = false,
  className = '',
}: PreviewDownloadButtonProps) {
  const { t } = useTranslation('album');

  const [state, setState] = useState<DownloadState>('ready');
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);
  const stateRef = useRef<DownloadState>(state);

  // Keep ref in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const cleanup = useCallback(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  }, [pollInterval]);

  const handleDownload = useCallback(async () => {
    if (disabled || state !== 'ready') return;

    cleanup();
    setState('checking');
    setError(null);

    try {
      const response = await onGetDownloadUrl();

      // Check if download is ready
      if ('download_url' in response && response.download_url) {
        setState('downloading');

        // Trigger download
        const link = document.createElement('a');
        link.href = response.download_url;
        link.download = 'album-preview.pdf';
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setState('ready');
      } else if ('status' in response && (response as { status: string }).status === 'generating') {
        // PDF is still being generated, start polling
        setState('generating');

        const interval = setInterval(async () => {
          try {
            const pollResponse = await onGetDownloadUrl();

            if ('download_url' in pollResponse && pollResponse.download_url) {
              cleanup();
              setState('downloading');

              // Trigger download
              const link = document.createElement('a');
              link.href = pollResponse.download_url;
              link.download = 'album-preview.pdf';
              link.target = '_blank';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);

              setState('ready');
            }
          } catch (pollError) {
            console.error('Polling error:', pollError);
          }
        }, 3000); // Poll every 3 seconds

        setPollInterval(interval);

        // Timeout after 2 minutes
        setTimeout(() => {
          cleanup();
          if (stateRef.current === 'generating') {
            setState('error');
            setError(t('download.timeout'));
          }
        }, 120000);
      }
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : t('download.error'));
    }
  }, [disabled, state, onGetDownloadUrl, cleanup, t]);

  const handleRetry = useCallback(() => {
    setState('ready');
    setError(null);
    handleDownload();
  }, [handleDownload]);

  // Render based on state
  const renderContent = () => {
    switch (state) {
      case 'checking':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('download.checking')}</span>
          </>
        );

      case 'generating':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('download.generating')}</span>
          </>
        );

      case 'downloading':
        return (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('download.downloading')}</span>
          </>
        );

      case 'error':
        return (
          <>
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-500">{t('download.failed')}</span>
          </>
        );

      default:
        return (
          <>
            <Download className="w-5 h-5" />
            <span>{t('download.button')}</span>
          </>
        );
    }
  };

  const getButtonClasses = () => {
    const baseClasses =
      'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors';

    if (disabled || state !== 'ready') {
      return `${baseClasses} bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed`;
    }

    return `${baseClasses} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600`;
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={state === 'error' ? handleRetry : handleDownload}
        disabled={disabled || (state !== 'ready' && state !== 'error')}
        className={getButtonClasses()}
        aria-label={t('download.ariaLabel')}
        aria-busy={state === 'generating' || state === 'downloading'}
      >
        {renderContent()}
      </button>

      {/* Error message */}
      {error && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-red-500">{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <RefreshCw className="w-4 h-4" />
            {t('download.retry')}
          </button>
        </div>
      )}

      {/* Generating progress message */}
      {state === 'generating' && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {t('download.generatingHint')}
        </p>
      )}
    </div>
  );
}

export default PreviewDownloadButton;
