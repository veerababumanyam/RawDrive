/**
 * PasswordResetModal - Modal for resetting gallery password
 *
 * Provides two flows:
 * 1. Request reset - Enter email to receive reset link
 * 2. Reset password - Enter token and new password
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US9 - Gallery Password Reset
 */

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Mail, Key, AlertCircle, CheckCircle, Loader2, ArrowLeft } from 'lucide-react';
import { galleryService } from '../../../services/galleryService';

type ResetStep = 'request' | 'verify' | 'success';

interface PasswordResetModalProps {
  /** Gallery ID */
  galleryId: string;
  /** Whether modal is visible */
  isOpen: boolean;
  /** Close modal callback */
  onClose: () => void;
  /** Optional callback after successful reset */
  onResetComplete?: () => void;
  /** Initial reset token (from URL) */
  initialToken?: string;
}

/**
 * Modal for gallery password reset flow
 *
 * @example
 * ```tsx
 * <PasswordResetModal
 *   galleryId="uuid-1"
 *   isOpen={showResetModal}
 *   onClose={() => setShowResetModal(false)}
 *   onResetComplete={() => {
 *     setShowResetModal(false);
 *     showToast('Password reset successfully');
 *   }}
 * />
 * ```
 */
export function PasswordResetModal({
  galleryId,
  isOpen,
  onClose,
  onResetComplete,
  initialToken,
}: PasswordResetModalProps) {
  const { t } = useTranslation('gallery');

  const [step, setStep] = useState<ResetStep>(initialToken ? 'verify' : 'request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(initialToken || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRequestReset = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError(t('passwordReset.emailRequired', 'Email is required'));
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('passwordReset.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    setIsLoading(true);
    try {
      await galleryService.requestPasswordReset(galleryId, email);
      setSuccessMessage(t('passwordReset.emailSent', 'If this email is associated with the gallery, a reset link has been sent.'));
      // Optionally move to verify step
      // setStep('verify');
    } catch (err: any) {
      if (err.message?.includes('Rate limit')) {
        setError(t('passwordReset.rateLimited', 'Too many reset requests. Please try again later.'));
      } else {
        // Still show success message to prevent email enumeration
        setSuccessMessage(t('passwordReset.emailSent', 'If this email is associated with the gallery, a reset link has been sent.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [email, galleryId, t]);

  const handleResetPassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError(t('passwordReset.tokenRequired', 'Reset token is required'));
      return;
    }

    if (newPassword.length < 6) {
      setError(t('passwordReset.passwordTooShort', 'Password must be at least 6 characters'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('passwordReset.passwordMismatch', 'Passwords do not match'));
      return;
    }

    setIsLoading(true);
    try {
      await galleryService.resetPassword(galleryId, token, newPassword);
      setStep('success');
      onResetComplete?.();
    } catch (err: any) {
      if (err.message?.includes('expired') || err.message?.includes('invalid')) {
        setError(t('passwordReset.tokenInvalid', 'Reset token is invalid or has expired. Please request a new one.'));
      } else {
        setError(t('passwordReset.resetFailed', 'Failed to reset password. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, newPassword, confirmPassword, galleryId, t, onResetComplete]);

  const handleGoToVerify = useCallback(() => {
    setStep('verify');
    setError(null);
    setSuccessMessage(null);
  }, []);

  const handleBackToRequest = useCallback(() => {
    setStep('request');
    setError(null);
    setSuccessMessage(null);
    setToken('');
    setNewPassword('');
    setConfirmPassword('');
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-reset-title"
    >
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            {step === 'verify' && !initialToken && (
              <button
                onClick={handleBackToRequest}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                aria-label={t('common.back', 'Go back')}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2 id="password-reset-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {step === 'success'
                ? t('passwordReset.successTitle', 'Password Reset')
                : step === 'verify'
                ? t('passwordReset.resetTitle', 'Reset Password')
                : t('passwordReset.forgotTitle', 'Forgot Password')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            aria-label={t('common.close', 'Close')}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 'request' && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('passwordReset.requestDescription', 'Enter the email address associated with this gallery to receive a password reset link.')}
              </p>

              {/* Email input */}
              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('passwordReset.email', 'Email Address')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder={t('passwordReset.emailPlaceholder', 'your@email.com')}
                    autoComplete="email"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Success message */}
              {successMessage && (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  {successMessage}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('passwordReset.sending', 'Sending...')}
                  </>
                ) : (
                  t('passwordReset.sendResetLink', 'Send Reset Link')
                )}
              </button>

              {/* Link to verify step */}
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                {t('passwordReset.haveToken', 'Already have a reset token?')}{' '}
                <button
                  type="button"
                  onClick={handleGoToVerify}
                  className="text-primary hover:underline font-medium"
                >
                  {t('passwordReset.enterToken', 'Enter it here')}
                </button>
              </p>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('passwordReset.verifyDescription', 'Enter the reset token from your email and choose a new password.')}
              </p>

              {/* Token input */}
              <div>
                <label htmlFor="reset-token" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('passwordReset.token', 'Reset Token')}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="reset-token"
                    type="text"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary font-mono"
                    placeholder={t('passwordReset.tokenPlaceholder', 'Enter reset token')}
                    disabled={isLoading || !!initialToken}
                  />
                </div>
              </div>

              {/* New password input */}
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('passwordReset.newPassword', 'New Password')}
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder={t('passwordReset.newPasswordPlaceholder', 'Enter new password')}
                  minLength={6}
                  disabled={isLoading}
                />
              </div>

              {/* Confirm password input */}
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('passwordReset.confirmPassword', 'Confirm Password')}
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder={t('passwordReset.confirmPasswordPlaceholder', 'Confirm new password')}
                  minLength={6}
                  disabled={isLoading}
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('passwordReset.resetting', 'Resetting...')}
                  </>
                ) : (
                  t('passwordReset.resetPassword', 'Reset Password')
                )}
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('passwordReset.successHeading', 'Password Reset Successfully')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('passwordReset.successMessage', 'Your gallery password has been updated. You can now access the gallery with your new password.')}
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 px-4 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                {t('passwordReset.continue', 'Continue to Gallery')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PasswordResetModal;
