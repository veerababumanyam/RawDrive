/**
 * AccessCodeModal - Modal for entering access codes to unlock protected photos
 *
 * Features:
 * - PIN-style input with visual feedback
 * - Lockout display with countdown timer
 * - Session storage for verified codes
 * - Accessibility compliant (WCAG 2.1 AA)
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US1 - Per-Photo Access Codes
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Lock, AlertCircle, Loader2 } from 'lucide-react';

interface AccessCodeModalProps {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Callback when code is successfully verified */
  onSuccess: (assetId: string) => void;
  /** Gallery ID containing the protected asset */
  galleryId: string;
  /** Asset ID that requires verification */
  assetId: string;
  /** Optional asset name for display */
  assetName?: string;
}

interface VerificationState {
  isLoading: boolean;
  error: string | null;
  isLockedOut: boolean;
  remainingAttempts: number;
  lockoutExpiresAt: Date | null;
}

const STORAGE_KEY_PREFIX = 'rawdrive_verified_codes_';

/**
 * Get session storage key for gallery
 */
function getStorageKey(galleryId: string): string {
  return `${STORAGE_KEY_PREFIX}${galleryId}`;
}

/**
 * Get verified asset IDs from session storage
 */
export function getVerifiedAssets(galleryId: string): Set<string> {
  try {
    const stored = sessionStorage.getItem(getStorageKey(galleryId));
    if (!stored) return new Set();
    return new Set(JSON.parse(stored));
  } catch {
    return new Set();
  }
}

/**
 * Store verified asset ID in session storage
 */
export function storeVerifiedAsset(galleryId: string, assetId: string): void {
  try {
    const verified = getVerifiedAssets(galleryId);
    verified.add(assetId);
    sessionStorage.setItem(getStorageKey(galleryId), JSON.stringify([...verified]));
  } catch {
    // Session storage may be blocked
  }
}

/**
 * Check if an asset has been verified in this session
 */
export function isAssetVerified(galleryId: string, assetId: string): boolean {
  return getVerifiedAssets(galleryId).has(assetId);
}

export function AccessCodeModal({
  isOpen,
  onClose,
  onSuccess,
  galleryId,
  assetId,
  assetName,
}: AccessCodeModalProps) {
  const { t } = useTranslation('gallery');
  const [code, setCode] = useState('');
  const [state, setState] = useState<VerificationState>({
    isLoading: false,
    error: null,
    isLockedOut: false,
    remainingAttempts: 3,
    lockoutExpiresAt: null,
  });
  const [lockoutCountdown, setLockoutCountdown] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Lockout countdown timer
  useEffect(() => {
    if (!state.lockoutExpiresAt) {
      setLockoutCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const remaining = Math.max(0, Math.ceil((state.lockoutExpiresAt!.getTime() - now.getTime()) / 1000));
      setLockoutCountdown(remaining);

      if (remaining === 0) {
        setState((prev) => ({
          ...prev,
          isLockedOut: false,
          lockoutExpiresAt: null,
          error: null,
        }));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [state.lockoutExpiresAt]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCode('');
      setState({
        isLoading: false,
        error: null,
        isLockedOut: false,
        remainingAttempts: 3,
        lockoutExpiresAt: null,
      });
    }
  }, [isOpen]);

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!code.trim() || state.isLoading || state.isLockedOut) {
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch(
          `/api/v1/public/galleries/${galleryId}/assets/${assetId}/verify-code`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code.trim() }),
          }
        );

        const data = await response.json();

        if (response.status === 429) {
          // Locked out
          setState({
            isLoading: false,
            error: data.detail?.message || t('accessCode.lockedOut'),
            isLockedOut: true,
            remainingAttempts: 0,
            lockoutExpiresAt: data.lockout_expires_at ? new Date(data.lockout_expires_at) : new Date(Date.now() + 300000),
          });
          return;
        }

        if (!response.ok) {
          throw new Error(data.detail?.message || t('accessCode.verificationFailed'));
        }

        if (data.verified) {
          // Store in session and notify success
          storeVerifiedAsset(galleryId, assetId);
          onSuccess(assetId);
          onClose();
        } else {
          // Wrong code
          setState({
            isLoading: false,
            error: data.message || t('accessCode.incorrectCode'),
            isLockedOut: data.locked_out,
            remainingAttempts: data.remaining_attempts,
            lockoutExpiresAt: data.lockout_expires_at ? new Date(data.lockout_expires_at) : null,
          });
          setCode('');
          inputRef.current?.focus();
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : t('accessCode.error'),
        }));
      }
    },
    [code, state.isLoading, state.isLockedOut, galleryId, assetId, onSuccess, onClose, t]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="access-code-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-full">
              <Lock className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <h2 id="access-code-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('accessCode.title', 'Protected Photo')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <p className="text-gray-600 dark:text-gray-300">
            {assetName
              ? t('accessCode.descriptionWithName', {
                  name: assetName,
                  defaultValue: `Enter the access code to view "${assetName}"`,
                })
              : t('accessCode.description', 'Enter the access code to view this photo.')}
          </p>

          {/* Error message */}
          {state.error && (
            <div
              className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p>
                {state.isLockedOut && lockoutCountdown > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                    {t('accessCode.tryAgainIn', {
                      seconds: lockoutCountdown,
                      defaultValue: `Try again in ${lockoutCountdown} seconds`,
                    })}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Code input */}
          <div>
            <label htmlFor="access-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('accessCode.label', 'Access Code')}
            </label>
            <input
              ref={inputRef}
              id="access-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={state.isLoading || state.isLockedOut}
              placeholder={t('accessCode.placeholder', 'Enter code')}
              className="w-full px-4 py-3 text-lg text-center tracking-widest border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              aria-describedby={state.error ? 'access-code-error' : undefined}
            />
            {!state.error && state.remainingAttempts < 3 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {t('accessCode.attemptsRemaining', {
                  count: state.remainingAttempts,
                  defaultValue: `${state.remainingAttempts} attempts remaining`,
                })}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={!code.trim() || state.isLoading || state.isLockedOut}
              className="flex-1 px-4 py-3 text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {state.isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t('common.verifying', 'Verifying...')}
                </>
              ) : (
                t('accessCode.verify', 'Verify')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AccessCodeModal;
