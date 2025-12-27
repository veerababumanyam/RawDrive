import React, { useState, useCallback, useEffect, useMemo } from 'react';
import DOMPurify from 'dompurify';
import {
  Shield,
  Smartphone,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Lock,
  QrCode,
} from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { useTwoFactorAuth } from '../../hooks/useUserSettings';
import { useToastActions } from '../ui/Toast';
import type { TwoFactorSetupResponse } from '../../types/userSettings';
import BackupCodesDisplay from './BackupCodesDisplay';

/* =============================================================================
   TwoFactorSetup Component

   Multi-step wizard for enabling/disabling two-factor authentication.
   Steps:
   1. Introduction - explain 2FA benefits
   2. QR Code - scan with authenticator app
   3. Verify - enter code from app
   4. Backup Codes - display and save backup codes
   ============================================================================= */

type SetupStep = 'intro' | 'qrcode' | 'verify' | 'backup' | 'enabled' | 'disable';

interface TwoFactorSetupProps {
  /** Called when setup is completed or cancelled */
  onComplete?: () => void;
}

export const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ onComplete }) => {
  const {
    status,
    loading,
    setup2FA,
    verify2FA,
    disable2FA,
    regenerateBackupCodes,
    refetch,
  } = useTwoFactorAuth();
  const toast = useToastActions();

  // State
  const [step, setStep] = useState<SetupStep>('intro');
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sanitize SVG content to prevent XSS
  const sanitizedQrCodeSvg = useMemo(() => {
    if (!setupData?.qr_code_svg) return null;
    // Configure DOMPurify to only allow SVG elements
    return DOMPurify.sanitize(setupData.qr_code_svg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      ADD_TAGS: ['svg', 'path', 'rect', 'circle', 'g'],
      ADD_ATTR: ['viewBox', 'd', 'fill', 'stroke', 'stroke-width', 'transform', 'width', 'height', 'xmlns'],
    });
  }, [setupData?.qr_code_svg]);

  // Determine initial step based on status
  useEffect(() => {
    if (status?.enabled) {
      setStep('enabled');
    } else {
      setStep('intro');
    }
  }, [status?.enabled]);

  // Start setup - fetch QR code and secret
  const handleStartSetup = useCallback(async () => {
    setError(null);
    setIsProcessing(true);
    try {
      const data = await setup2FA();
      setSetupData(data);
      setStep('qrcode');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setIsProcessing(false);
    }
  }, [setup2FA]);

  // Verify code and enable 2FA
  const handleVerify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (verificationCode.length !== 6 || !/^\d+$/.test(verificationCode)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await verify2FA(verificationCode);
      setBackupCodes(result.backup_codes);
      setStep('backup');
      toast.success('Two-factor authentication enabled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
    } finally {
      setIsProcessing(false);
    }
  }, [verificationCode, verify2FA, toast]);

  // Disable 2FA
  const handleDisable = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!disablePassword) {
      setError('Password is required');
      return;
    }
    if (disableCode.length !== 6 || !/^\d+$/.test(disableCode)) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsProcessing(true);
    try {
      await disable2FA(disablePassword, disableCode);
      setStep('intro');
      setDisablePassword('');
      setDisableCode('');
      toast.success('Two-factor authentication disabled');
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsProcessing(false);
    }
  }, [disablePassword, disableCode, disable2FA, toast, onComplete]);

  // Regenerate backup codes
  const handleRegenerateBackupCodes = useCallback(async (password: string) => {
    setError(null);
    setIsProcessing(true);
    try {
      const result = await regenerateBackupCodes(password);
      setBackupCodes(result.backup_codes);
      toast.success('Backup codes regenerated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate backup codes');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [regenerateBackupCodes, toast]);

  // Copy secret to clipboard
  const handleCopySecret = useCallback(async () => {
    if (setupData?.secret) {
      try {
        await navigator.clipboard.writeText(setupData.secret);
        setSecretCopied(true);
        toast.success('Secret copied to clipboard');
        setTimeout(() => setSecretCopied(false), 2000);
      } catch {
        toast.error('Failed to copy secret');
      }
    }
  }, [setupData?.secret, toast]);

  // Complete setup
  const handleComplete = useCallback(() => {
    setStep('enabled');
    setBackupCodes([]);
    refetch();
    onComplete?.();
  }, [refetch, onComplete]);

  // Cancel and go back
  const handleCancel = useCallback(() => {
    setStep(status?.enabled ? 'enabled' : 'intro');
    setSetupData(null);
    setVerificationCode('');
    setError(null);
  }, [status?.enabled]);

  // Loading state
  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Render based on current step
  return (
    <div className="space-y-6">
      {/* Step: Introduction */}
      {step === 'intro' && (
        <div className="space-y-6">
          <div className="flex items-start gap-4 p-4 bg-primary/5 rounded-xl">
            <Shield className="w-8 h-8 text-primary flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-text-primary">
                Protect your account with 2FA
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                Two-factor authentication adds an extra layer of security by requiring
                a code from your phone in addition to your password.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-text-primary">What you'll need:</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <span>An authenticator app (Google Authenticator, Authy, 1Password, etc.)</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <span>A safe place to store backup codes</span>
              </div>
            </div>
          </div>

          <AppButton
            variant="primary"
            onClick={handleStartSetup}
            isLoading={isProcessing}
            loadingText="Setting up..."
            rightIcon={<ChevronRight className="w-4 h-4" />}
          >
            Set up two-factor authentication
          </AppButton>
        </div>
      )}

      {/* Step: QR Code */}
      {step === 'qrcode' && setupData && (
        <div className="space-y-6">
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div>
            <h3 className="font-semibold text-text-primary mb-2">
              Scan QR Code
            </h3>
            <p className="text-sm text-text-secondary">
              Open your authenticator app and scan this QR code, or enter the secret manually.
            </p>
          </div>

          {/* QR Code Display */}
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              {sanitizedQrCodeSvg ? (
                <div
                  dangerouslySetInnerHTML={{ __html: sanitizedQrCodeSvg }}
                  className="w-48 h-48 [&>svg]:w-full [&>svg]:h-full"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-surface-hover rounded-lg">
                  <QrCode className="w-12 h-12 text-text-tertiary" />
                </div>
              )}
            </div>
          </div>

          {/* Manual Entry Secret */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              Or enter this code manually:
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-surface-hover rounded-lg text-sm font-mono text-text-primary break-all">
                {setupData.secret}
              </code>
              <AppButton
                variant="outline"
                size="sm"
                onClick={handleCopySecret}
                leftIcon={secretCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              >
                {secretCopied ? 'Copied' : 'Copy'}
              </AppButton>
            </div>
          </div>

          <AppButton
            variant="primary"
            onClick={() => setStep('verify')}
            rightIcon={<ChevronRight className="w-4 h-4" />}
            fullWidth
          >
            I've scanned the QR code
          </AppButton>
        </div>
      )}

      {/* Step: Verify */}
      {step === 'verify' && (
        <div className="space-y-6">
          <button
            onClick={() => setStep('qrcode')}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div>
            <h3 className="font-semibold text-text-primary mb-2">
              Enter verification code
            </h3>
            <p className="text-sm text-text-secondary">
              Enter the 6-digit code from your authenticator app to verify setup.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <AppInput
              label="Verification Code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              error={error || undefined}
              disabled={isProcessing}
              autoComplete="one-time-code"
              leftIcon={<Key className="w-5 h-5" />}
            />

            <AppButton
              type="submit"
              variant="primary"
              isLoading={isProcessing}
              loadingText="Verifying..."
              disabled={verificationCode.length !== 6}
              fullWidth
            >
              Verify and enable 2FA
            </AppButton>
          </form>
        </div>
      )}

      {/* Step: Backup Codes */}
      {step === 'backup' && backupCodes.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-start gap-3 p-4 bg-warning/10 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-text-primary">Save your backup codes</h4>
              <p className="mt-1 text-sm text-text-secondary">
                If you lose access to your authenticator app, you can use these codes
                to sign in. Each code can only be used once.
              </p>
            </div>
          </div>

          <BackupCodesDisplay
            codes={backupCodes}
            showRegenerateButton={false}
          />

          <AppButton
            variant="primary"
            onClick={handleComplete}
            fullWidth
          >
            I've saved my backup codes
          </AppButton>
        </div>
      )}

      {/* Step: 2FA Enabled (Status View) */}
      {step === 'enabled' && status?.enabled && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-success/10 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">
                Two-factor authentication is enabled
              </h3>
              {status.enabled_at && (
                <p className="text-sm text-text-secondary">
                  Enabled on {new Date(status.enabled_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          {/* Backup codes remaining */}
          {status.backup_codes_remaining !== null && status.backup_codes_remaining !== undefined && (
            <div className={`p-4 rounded-xl ${
              status.backup_codes_remaining <= 2
                ? 'bg-warning/10'
                : 'bg-surface-hover'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Backup codes remaining
                  </p>
                  <p className="text-xs text-text-secondary">
                    {status.backup_codes_remaining <= 2
                      ? 'Consider regenerating your backup codes'
                      : 'Each code can only be used once'}
                  </p>
                </div>
                <span className={`text-2xl font-bold ${
                  status.backup_codes_remaining <= 2 ? 'text-warning' : 'text-text-primary'
                }`}>
                  {status.backup_codes_remaining}
                </span>
              </div>
            </div>
          )}

          {/* Regenerate backup codes */}
          <BackupCodesDisplay
            codes={backupCodes}
            onRegenerate={handleRegenerateBackupCodes}
            showRegenerateButton
          />

          {error && (
            <div className="p-3 bg-error/10 rounded-lg text-error text-sm" role="alert">
              {error}
            </div>
          )}

          <div className="border-t border-border pt-6">
            <h4 className="text-sm font-medium text-text-primary mb-4">
              Disable two-factor authentication
            </h4>
            <AppButton
              variant="outline"
              onClick={() => setStep('disable')}
              className="text-error border-error hover:bg-error/10"
            >
              Disable 2FA
            </AppButton>
          </div>
        </div>
      )}

      {/* Step: Disable 2FA */}
      {step === 'disable' && (
        <div className="space-y-6">
          <button
            onClick={() => setStep('enabled')}
            className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-start gap-3 p-4 bg-error/10 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-text-primary">Disable 2FA?</h4>
              <p className="mt-1 text-sm text-text-secondary">
                This will make your account less secure. You'll only need your
                password to sign in.
              </p>
            </div>
          </div>

          <form onSubmit={handleDisable} className="space-y-4">
            <AppInput
              label="Password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isProcessing}
              autoComplete="current-password"
              leftIcon={<Lock className="w-5 h-5" />}
            />

            <AppInput
              label="Authenticator Code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              error={error || undefined}
              disabled={isProcessing}
              autoComplete="one-time-code"
              leftIcon={<Key className="w-5 h-5" />}
              helperText="Enter a code from your authenticator app"
            />

            <AppButton
              type="submit"
              variant="destructive"
              isLoading={isProcessing}
              loadingText="Disabling..."
              disabled={!disablePassword || disableCode.length !== 6}
              fullWidth
            >
              Disable two-factor authentication
            </AppButton>
          </form>
        </div>
      )}
    </div>
  );
};

export default TwoFactorSetup;
