import React, { useState, useCallback, useMemo } from 'react';
import { Lock, Eye, EyeOff, Check, X, AlertCircle } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { usePasswordChange } from '../../hooks/useUserSettings';
import { useToastActions } from '../ui/Toast';

/* =============================================================================
   PasswordChangeForm Component

   Form for changing user password with validation and strength indicator.
   Requirements:
   - Current password verification
   - New password min 8 characters
   - Password confirmation matching
   - Real-time strength indicator
   ============================================================================= */

// Common weak passwords to reject
const WEAK_PASSWORDS = new Set([
  'password', 'password1', '12345678', 'qwerty123', 'letmein1',
  'welcome1', 'monkey123', 'dragon12', 'master12', 'login123',
]);

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'Contains a number', test: (p) => /\d/.test(p) },
  { label: 'Contains uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'Contains lowercase letter', test: (p) => /[a-z]/.test(p) },
];

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

const calculatePasswordStrength = (password: string): PasswordStrength => {
  if (!password) return { score: 0, label: '', color: '' };

  let score = 0;

  // Length checks
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // Character variety
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  // Penalize common patterns
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    score = Math.min(score, 1);
  }

  // Normalize to 0-4
  score = Math.min(4, Math.floor(score * 0.8));

  const strengths: PasswordStrength[] = [
    { score: 0, label: 'Very Weak', color: 'bg-red-500' },
    { score: 1, label: 'Weak', color: 'bg-orange-500' },
    { score: 2, label: 'Fair', color: 'bg-yellow-500' },
    { score: 3, label: 'Good', color: 'bg-lime-500' },
    { score: 4, label: 'Strong', color: 'bg-green-500' },
  ];

  return strengths[score];
};

export const PasswordChangeForm: React.FC = () => {
  const { changePassword, loading } = usePasswordChange();
  const toast = useToastActions();

  // Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Password strength
  const passwordStrength = useMemo(
    () => calculatePasswordStrength(newPassword),
    [newPassword]
  );

  // Requirements status
  const requirementsMet = useMemo(
    () => PASSWORD_REQUIREMENTS.map((req) => ({
      ...req,
      met: req.test(newPassword),
    })),
    [newPassword]
  );

  const allRequirementsMet = useMemo(
    () => requirementsMet.every((req) => req.met),
    [requirementsMet]
  );

  // Validation
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    if (!newPassword) {
      errors.newPassword = 'New password is required';
    } else if (newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    } else if (WEAK_PASSWORDS.has(newPassword.toLowerCase())) {
      errors.newPassword = 'This password is too common. Please choose a stronger one.';
    } else if (newPassword === currentPassword) {
      errors.newPassword = 'New password must be different from current password';
    }

    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password';
    } else if (confirmPassword !== newPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [currentPassword, newPassword, confirmPassword]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');

      // Reset form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
    } catch (err) {
      if (err instanceof Error) {
        // Check for specific error messages
        if (err.message.includes('incorrect') || err.message.includes('Invalid')) {
          setFieldErrors({ currentPassword: 'Current password is incorrect' });
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to change password. Please try again.');
      }
    }
  }, [currentPassword, newPassword, validateForm, changePassword, toast]);

  // Reset form
  const handleReset = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setError(null);
  }, []);

  const hasChanges = currentPassword || newPassword || confirmPassword;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Current Password */}
      <AppInput
        label="Current Password"
        type={showCurrentPassword ? 'text' : 'password'}
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Enter your current password"
        error={fieldErrors.currentPassword}
        disabled={loading}
        autoComplete="current-password"
        variant="glass"
        leftIcon={<Lock className="w-5 h-5" />}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            tabIndex={-1}
            aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
          >
            {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
      />

      {/* New Password */}
      <div>
        <AppInput
          label="New Password"
          type={showNewPassword ? 'text' : 'password'}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter your new password"
          error={fieldErrors.newPassword}
          disabled={loading}
          autoComplete="new-password"
          variant="glass"
          leftIcon={<Lock className="w-5 h-5" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="text-text-tertiary hover:text-text-primary transition-colors"
              tabIndex={-1}
              aria-label={showNewPassword ? 'Hide password' : 'Show password'}
            >
              {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          }
        />

        {/* Password Strength Indicator */}
        {newPassword && (
          <div className="mt-3 space-y-2">
            {/* Strength bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 flex gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${index < passwordStrength.score
                        ? passwordStrength.color
                        : 'bg-border'
                      }`}
                  />
                ))}
              </div>
              <span className={`text-xs font-medium ${passwordStrength.score <= 1 ? 'text-error' :
                  passwordStrength.score === 2 ? 'text-warning' :
                    'text-success'
                }`}>
                {passwordStrength.label}
              </span>
            </div>

            {/* Requirements checklist */}
            <div className="grid grid-cols-2 gap-1.5">
              {requirementsMet.map((req) => (
                <div
                  key={req.label}
                  className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-success' : 'text-text-tertiary'
                    }`}
                >
                  {req.met ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                  {req.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Password */}
      <AppInput
        label="Confirm New Password"
        type={showConfirmPassword ? 'text' : 'password'}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirm your new password"
        error={fieldErrors.confirmPassword}
        disabled={loading}
        autoComplete="new-password"
        variant="glass"
        leftIcon={<Lock className="w-5 h-5" />}
        rightIcon={
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="text-text-tertiary hover:text-text-primary transition-colors"
            tabIndex={-1}
            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
      />

      {/* Password match indicator */}
      {confirmPassword && newPassword && (
        <div className={`flex items-center gap-2 text-sm ${confirmPassword === newPassword ? 'text-success' : 'text-error'
          }`}>
          {confirmPassword === newPassword ? (
            <>
              <Check className="w-4 h-4" />
              Passwords match
            </>
          ) : (
            <>
              <X className="w-4 h-4" />
              Passwords do not match
            </>
          )}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-error/10 rounded-lg text-error text-sm" role="alert">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {hasChanges && (
          <AppButton
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={loading}
          >
            Cancel
          </AppButton>
        )}
        <AppButton
          type="submit"
          variant="primary"
          disabled={loading || !allRequirementsMet || confirmPassword !== newPassword}
          isLoading={loading}
          loadingText="Changing..."
        >
          Change Password
        </AppButton>
      </div>
    </form>
  );
};

export default PasswordChangeForm;
