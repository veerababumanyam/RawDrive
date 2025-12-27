import React, { useState, useCallback } from 'react';
import { Copy, Download, RefreshCw, Lock, Check, Eye, EyeOff } from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { useToastActions } from '../ui/Toast';

/* =============================================================================
   BackupCodesDisplay Component

   Displays backup codes with options to copy, download, and regenerate.
   Used in:
   - Initial 2FA setup (after verification)
   - Security settings (view/regenerate existing codes)
   ============================================================================= */

interface BackupCodesDisplayProps {
  /** Backup codes to display */
  codes: string[];
  /** Whether to show the regenerate button */
  showRegenerateButton?: boolean;
  /** Callback to regenerate backup codes (requires password) */
  onRegenerate?: (password: string) => Promise<void>;
}

export const BackupCodesDisplay: React.FC<BackupCodesDisplayProps> = ({
  codes,
  showRegenerateButton = false,
  onRegenerate,
}) => {
  const toast = useToastActions();

  // State
  const [showCodes, setShowCodes] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showRegenerateForm, setShowRegenerateForm] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Copy all codes to clipboard
  const handleCopyAll = useCallback(async () => {
    if (codes.length === 0) return;

    const codesText = codes.join('\n');
    try {
      await navigator.clipboard.writeText(codesText);
      setCopiedAll(true);
      toast.success('Backup codes copied to clipboard');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      toast.error('Failed to copy codes');
    }
  }, [codes, toast]);

  // Download codes as text file
  const handleDownload = useCallback(() => {
    if (codes.length === 0) return;

    const codesText = [
      'RawDrive Backup Codes',
      '=====================',
      '',
      'Keep these codes in a safe place. Each code can only be used once.',
      '',
      ...codes,
      '',
      `Generated: ${new Date().toLocaleString()}`,
    ].join('\n');

    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rawdrive-backup-codes.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Backup codes downloaded');
  }, [codes, toast]);

  // Regenerate codes
  const handleRegenerate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRegenerate) return;

    if (!password) {
      setError('Password is required');
      return;
    }

    setIsRegenerating(true);
    setError(null);

    try {
      await onRegenerate(password);
      setShowRegenerateForm(false);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate codes');
    } finally {
      setIsRegenerating(false);
    }
  }, [password, onRegenerate]);

  // Cancel regenerate
  const handleCancelRegenerate = useCallback(() => {
    setShowRegenerateForm(false);
    setPassword('');
    setError(null);
  }, []);

  // If no codes and not showing regenerate form
  if (codes.length === 0 && !showRegenerateButton) {
    return null;
  }

  // Show regenerate form
  if (showRegenerateForm) {
    return (
      <div className="p-4 bg-surface-hover rounded-xl space-y-4">
        <div>
          <h4 className="font-medium text-text-primary">Regenerate Backup Codes</h4>
          <p className="text-sm text-text-secondary mt-1">
            This will invalidate all existing backup codes. Enter your password to continue.
          </p>
        </div>

        <form onSubmit={handleRegenerate} className="space-y-4">
          <AppInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            error={error || undefined}
            disabled={isRegenerating}
            autoComplete="current-password"
            leftIcon={<Lock className="w-5 h-5" />}
          />

          <div className="flex items-center gap-3">
            <AppButton
              type="button"
              variant="outline"
              onClick={handleCancelRegenerate}
              disabled={isRegenerating}
            >
              Cancel
            </AppButton>
            <AppButton
              type="submit"
              variant="primary"
              isLoading={isRegenerating}
              loadingText="Regenerating..."
              disabled={!password}
            >
              Regenerate Codes
            </AppButton>
          </div>
        </form>
      </div>
    );
  }

  // Show codes or regenerate button
  if (codes.length === 0 && showRegenerateButton) {
    return (
      <div className="p-4 bg-surface-hover rounded-xl">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-text-primary">Backup Codes</h4>
            <p className="text-sm text-text-secondary">
              Generate new backup codes if you've lost access to your previous ones.
            </p>
          </div>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateForm(true)}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Regenerate
          </AppButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-text-primary">Backup Codes</h4>
        <div className="flex items-center gap-2">
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => setShowCodes(!showCodes)}
            leftIcon={showCodes ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          >
            {showCodes ? 'Hide' : 'Show'}
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleCopyAll}
            leftIcon={copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          >
            {copiedAll ? 'Copied' : 'Copy'}
          </AppButton>
          <AppButton
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            leftIcon={<Download className="w-4 h-4" />}
          >
            Download
          </AppButton>
        </div>
      </div>

      {/* Codes grid */}
      <div className="p-4 bg-surface-hover rounded-xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {codes.map((code, index) => (
            <div
              key={index}
              className={`px-3 py-2 bg-surface rounded-lg text-center font-mono text-sm ${
                showCodes ? 'text-text-primary' : 'text-transparent select-none'
              }`}
              style={!showCodes ? { textShadow: '0 0 8px currentColor' } : undefined}
            >
              {showCodes ? code : '••••••••'}
            </div>
          ))}
        </div>
      </div>

      {/* Regenerate option */}
      {showRegenerateButton && onRegenerate && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-text-secondary">
            Need new codes? This will invalidate existing ones.
          </p>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setShowRegenerateForm(true)}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Regenerate
          </AppButton>
        </div>
      )}
    </div>
  );
};

export default BackupCodesDisplay;
