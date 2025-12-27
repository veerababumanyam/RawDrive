import React, { useState, useCallback } from 'react';
import { X, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';

/* =============================================================================
   EmailChangeModal Component

   Modal for requesting email address change.
   Requires current password verification before sending verification email.
   ============================================================================= */

interface EmailChangeModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Current email address */
  currentEmail: string;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback when email change is requested */
  onSubmit: (newEmail: string, password: string) => Promise<void>;
}

export const EmailChangeModal: React.FC<EmailChangeModalProps> = ({
  isOpen,
  currentEmail,
  onClose,
  onSubmit,
}) => {
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Validate new email
    if (!newEmail.trim()) {
      errors.newEmail = 'New email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      errors.newEmail = 'Please enter a valid email address';
    } else if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      errors.newEmail = 'New email must be different from current email';
    }

    // Validate confirm email
    if (!confirmEmail.trim()) {
      errors.confirmEmail = 'Please confirm your new email';
    } else if (confirmEmail.toLowerCase() !== newEmail.toLowerCase()) {
      errors.confirmEmail = 'Email addresses do not match';
    }

    // Validate password
    if (!password) {
      errors.password = 'Password is required to change email';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [newEmail, confirmEmail, password, currentEmail]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await onSubmit(newEmail.trim().toLowerCase(), password);
      // Reset form and close on success
      setNewEmail('');
      setConfirmEmail('');
      setPassword('');
      setFieldErrors({});
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to request email change. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [newEmail, password, validateForm, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    if (!isLoading) {
      setNewEmail('');
      setConfirmEmail('');
      setPassword('');
      setError(null);
      setFieldErrors({});
      onClose();
    }
  }, [isLoading, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      handleClose();
    }
  }, [isLoading, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-change-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="email-change-title" className="text-lg font-semibold text-text-primary">
            Change Email Address
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Current email (read-only) */}
          <div>
            <label className="block text-sm font-medium text-text-tertiary mb-1.5">
              Current Email
            </label>
            <div className="flex items-center gap-3 px-4 py-3 bg-surface-hover rounded-xl text-text-secondary">
              <Mail className="w-5 h-5" />
              <span>{currentEmail}</span>
            </div>
          </div>

          {/* New email */}
          <AppInput
            label="New Email Address"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Enter your new email"
            error={fieldErrors.newEmail}
            disabled={isLoading}
            autoComplete="email"
            leftIcon={<Mail className="w-5 h-5" />}
          />

          {/* Confirm email */}
          <AppInput
            label="Confirm New Email"
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder="Confirm your new email"
            error={fieldErrors.confirmEmail}
            disabled={isLoading}
            autoComplete="email"
            leftIcon={<Mail className="w-5 h-5" />}
          />

          {/* Password */}
          <AppInput
            label="Current Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your current password"
            error={fieldErrors.password}
            disabled={isLoading}
            autoComplete="current-password"
            leftIcon={<Lock className="w-5 h-5" />}
          />

          {/* Info message */}
          <div className="flex gap-3 p-4 bg-primary/5 rounded-xl text-sm text-text-secondary">
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-text-primary">Verification Required</p>
              <p className="mt-1">
                We'll send a verification link to your new email address.
                Your email won't change until you click that link.
              </p>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error/10 rounded-lg text-error text-sm" role="alert">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <AppButton
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Verification Email'
              )}
            </AppButton>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmailChangeModal;
