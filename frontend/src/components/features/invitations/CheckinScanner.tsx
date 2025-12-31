/**
 * CheckinScanner: QR code scanner for event check-ins
 *
 * Features:
 * - QR code scanning via device camera
 * - Manual name lookup fallback
 * - Real-time check-in count display
 * - Idempotent check-ins (no duplicates)
 * - Visual/audio feedback for success/failure
 *
 * Feature: 016-save-the-date
 * Tasks: T118
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  QrCode,
  Camera,
  Search,
  UserCheck,
  UserX,
  Users,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Volume2,
  VolumeX,
  RefreshCw,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppCard } from '@/components/ui/AppCard';
import { AppBadge } from '@/components/ui/AppBadge';
import { invitationService } from '@/services/invitationService';
import { useToast } from '@/hooks/useToast';
import type {
  CheckinVerifyResponse,
  CheckinResultResponse,
  CheckinStatsResponse,
} from '@/types/invitations';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CheckinScannerProps {
  workspaceId: string;
  invitationId: string;
  className?: string;
  onClose?: () => void;
}

type ScanMode = 'camera' | 'manual';

interface ScanResult {
  success: boolean;
  guestName: string;
  partySize: number;
  message: string;
  alreadyCheckedIn: boolean;
}

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

interface StatBadgeProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  color: 'primary' | 'success' | 'warning';
}

const StatBadge: React.FC<StatBadgeProps> = ({ icon, label, value, color }) => {
  const colorClasses = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${colorClasses[color]}`}>
      {icon}
      <span className="text-sm font-medium">{value}</span>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Guest Card Component (shown after verification)
// ---------------------------------------------------------------------------

interface GuestCardProps {
  guestInfo: CheckinVerifyResponse;
  onConfirm: (partySize?: number) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const GuestCard: React.FC<GuestCardProps> = ({
  guestInfo,
  onConfirm,
  onCancel,
  isLoading,
}) => {
  const [partySize, setPartySize] = useState(guestInfo.party_size || 1);

  return (
    <AppCard className="p-6 animate-fade-in-up">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-primary/10 text-primary">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {guestInfo.guest_name}
            </h3>
            {guestInfo.guest_email && (
              <p className="text-sm text-text-secondary">{guestInfo.guest_email}</p>
            )}
          </div>
        </div>
        {/* T131: Minimum 44px touch target */}
        <button
          onClick={onCancel}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-surface-hover"
          aria-label="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Guest Details */}
      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Status</span>
          <AppBadge
            variant={guestInfo.attending ? 'success' : 'warning'}
          >
            {guestInfo.attending ? 'Attending' : 'Not Attending'}
          </AppBadge>
        </div>

        {/* T131: Minimum 44px touch targets for mobile */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">Party Size</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPartySize(Math.max(1, partySize - 1))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded border border-border hover:bg-surface-hover disabled:opacity-50"
              disabled={partySize <= 1}
              aria-label="Decrease party size"
            >
              -
            </button>
            <span className="w-8 text-center font-medium">{partySize}</span>
            <button
              onClick={() => setPartySize(Math.min(50, partySize + 1))}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded border border-border hover:bg-surface-hover"
              aria-label="Increase party size"
            >
              +
            </button>
          </div>
        </div>

        {guestInfo.dietary_preferences && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-secondary">Dietary</span>
            <span className="text-text-primary">{guestInfo.dietary_preferences}</span>
          </div>
        )}
      </div>

      {/* Already Checked In Warning */}
      {guestInfo.already_checked_in && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-warning/10 text-warning">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">This guest has already checked in.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <AppButton
          variant="outline"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1"
        >
          Cancel
        </AppButton>
        <AppButton
          variant="primary"
          onClick={() => onConfirm(partySize)}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : guestInfo.already_checked_in ? (
            'Already Checked In'
          ) : (
            'Check In'
          )}
        </AppButton>
      </div>
    </AppCard>
  );
};

// ---------------------------------------------------------------------------
// Success Animation Component
// ---------------------------------------------------------------------------

interface SuccessAnimationProps {
  result: ScanResult;
  onDismiss: () => void;
}

const SuccessAnimation: React.FC<SuccessAnimationProps> = ({ result, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // Handle keyboard dismiss (T122)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        onDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkin-result-title"
      aria-describedby="checkin-result-description"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
      onClick={onDismiss}
    >
      <div className="text-center animate-scale-in" role="status" aria-live="polite">
        <div
          className={`inline-flex items-center justify-center w-24 h-24 rounded-full mb-4 ${
            result.alreadyCheckedIn ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
          }`}
        >
          {result.alreadyCheckedIn ? (
            <AlertCircle className="w-12 h-12" />
          ) : (
            <CheckCircle className="w-12 h-12" />
          )}
        </div>
        <h2 id="checkin-result-title" className="text-2xl font-semibold text-text-primary mb-2">
          {result.guestName}
        </h2>
        <p id="checkin-result-description" className="text-text-secondary mb-1">
          {result.alreadyCheckedIn
            ? 'Already checked in'
            : `Party of ${result.partySize} checked in`}
        </p>
        <p className="text-sm text-text-tertiary">{result.message}</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main CheckinScanner Component
// ---------------------------------------------------------------------------

export const CheckinScanner: React.FC<CheckinScannerProps> = ({
  workspaceId,
  invitationId,
  className = '',
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // State
  const [mode, setMode] = useState<ScanMode>('camera');
  const [manualName, setManualName] = useState('');
  const [verifiedGuest, setVerifiedGuest] = useState<CheckinVerifyResponse | null>(null);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [scannedToken, setScannedToken] = useState<string | null>(null);

  // Audio refs for feedback
  const successAudioRef = useRef<HTMLAudioElement | null>(null);
  const errorAudioRef = useRef<HTMLAudioElement | null>(null);

  // Query: Check-in stats (T119)
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['checkin-stats', workspaceId, invitationId],
    queryFn: () => invitationService.getCheckinStats(workspaceId, invitationId),
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  // Mutation: Verify QR token
  const verifyMutation = useMutation({
    mutationFn: (token: string) =>
      invitationService.verifyCheckinToken(workspaceId, invitationId, token),
    onSuccess: (data) => {
      if (data.valid) {
        setVerifiedGuest(data);
      } else {
        showToast(data.error || 'Invalid QR code', 'error');
        playSound('error');
      }
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to verify QR code', 'error');
      playSound('error');
    },
  });

  // Mutation: Record check-in
  const checkinMutation = useMutation({
    mutationFn: (data: { token?: string; partySize?: number; guestName?: string }) => {
      if (data.token) {
        return invitationService.scanAndCheckin(workspaceId, invitationId, {
          token: data.token,
          party_size_override: data.partySize,
        });
      } else if (data.guestName) {
        return invitationService.manualCheckin(workspaceId, invitationId, {
          guest_name: data.guestName,
          party_size_checked_in: data.partySize || 1,
        });
      }
      throw new Error('No token or guest name provided');
    },
    onSuccess: (result: CheckinResultResponse) => {
      setLastResult({
        success: result.success,
        guestName: result.guest_name,
        partySize: result.party_size_checked_in,
        message: result.message,
        alreadyCheckedIn: result.already_checked_in,
      });
      setVerifiedGuest(null);
      setScannedToken(null);
      setManualName('');

      // Refresh stats
      queryClient.invalidateQueries({ queryKey: ['checkin-stats', workspaceId, invitationId] });

      playSound(result.already_checked_in ? 'error' : 'success');
    },
    onError: (error: Error) => {
      showToast(error.message || 'Failed to check in guest', 'error');
      playSound('error');
    },
  });

  // Play audio feedback
  const playSound = useCallback((type: 'success' | 'error') => {
    if (!soundEnabled) return;

    // Create simple beep sounds using Web Audio API
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.value = type === 'success' ? 800 : 300;
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
      // Audio not supported
    }
  }, [soundEnabled]);

  // Handle QR scan result
  const handleQRScan = useCallback((token: string) => {
    setScannedToken(token);
    verifyMutation.mutate(token);
  }, [verifyMutation]);

  // Handle confirm check-in
  const handleConfirmCheckin = useCallback((partySize?: number) => {
    if (scannedToken) {
      checkinMutation.mutate({ token: scannedToken, partySize });
    } else if (manualName) {
      checkinMutation.mutate({ guestName: manualName, partySize });
    }
  }, [scannedToken, manualName, checkinMutation]);

  // Handle manual name search
  const handleManualSearch = useCallback(() => {
    if (!manualName.trim()) {
      showToast('Please enter a guest name', 'warning');
      return;
    }
    checkinMutation.mutate({ guestName: manualName.trim(), partySize: 1 });
  }, [manualName, checkinMutation, showToast]);

  // Dismiss success animation
  const handleDismissResult = useCallback(() => {
    setLastResult(null);
  }, []);

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Check-in Scanner</h2>
            <p className="text-sm text-text-secondary">Scan guest QR codes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
            title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
          >
            {soundEnabled ? (
              <Volume2 className="w-5 h-5 text-text-secondary" />
            ) : (
              <VolumeX className="w-5 h-5 text-text-tertiary" />
            )}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
              aria-label="Close scanner"
            >
              <X className="w-5 h-5 text-text-secondary" />
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar (T119) */}
      <div className="flex items-center gap-4 p-4 border-b border-border bg-surface overflow-x-auto">
        <StatBadge
          icon={<UserCheck className="w-4 h-4" />}
          label="checked in"
          value={stats?.total_guests_checked_in || 0}
          color="success"
        />
        <StatBadge
          icon={<Users className="w-4 h-4" />}
          label="expected"
          value={stats?.expected_guests || 0}
          color="primary"
        />
        <StatBadge
          icon={<CheckCircle className="w-4 h-4" />}
          label="rate"
          value={`${stats?.checkin_rate_percent?.toFixed(0) || 0}%`}
          color="warning"
        />
        <button
          onClick={() => refetchStats()}
          className="p-2 rounded-lg hover:bg-surface-hover transition-colors ml-auto"
          title="Refresh stats"
        >
          <RefreshCw className="w-4 h-4 text-text-tertiary" />
        </button>
      </div>

      {/* Mode Toggle */}
      <div className="flex p-4 gap-2">
        <AppButton
          variant={mode === 'camera' ? 'primary' : 'outline'}
          onClick={() => setMode('camera')}
          className="flex-1"
        >
          <Camera className="w-4 h-4 mr-2" />
          Camera Scan
        </AppButton>
        <AppButton
          variant={mode === 'manual' ? 'primary' : 'outline'}
          onClick={() => setMode('manual')}
          className="flex-1"
        >
          <Search className="w-4 h-4 mr-2" />
          Name Lookup
        </AppButton>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* Show verified guest card for confirmation */}
        {verifiedGuest && (
          <GuestCard
            guestInfo={verifiedGuest}
            onConfirm={handleConfirmCheckin}
            onCancel={() => {
              setVerifiedGuest(null);
              setScannedToken(null);
            }}
            isLoading={checkinMutation.isPending}
          />
        )}

        {/* Camera Mode - QR Scanner placeholder */}
        {!verifiedGuest && mode === 'camera' && (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-lg bg-surface">
            <Camera className="w-16 h-16 text-text-tertiary mb-4" />
            <p className="text-text-secondary text-center mb-4">
              Point camera at guest QR code
            </p>
            <p className="text-sm text-text-tertiary text-center mb-4">
              QR scanning requires a compatible device camera.
            </p>
            {/* Demo: Manual token input for testing */}
            <div className="w-full max-w-sm px-4">
              <AppInput
                placeholder="Paste QR token for testing..."
                value={scannedToken || ''}
                onChange={(e) => setScannedToken(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && scannedToken) {
                    handleQRScan(scannedToken);
                  }
                }}
              />
              <AppButton
                variant="outline"
                onClick={() => scannedToken && handleQRScan(scannedToken)}
                disabled={!scannedToken || verifyMutation.isPending}
                className="w-full mt-2"
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Verify Token
              </AppButton>
            </div>
          </div>
        )}

        {/* Manual Mode - Name Search */}
        {!verifiedGuest && mode === 'manual' && (
          <div className="space-y-4">
            <AppInput
              placeholder="Enter guest name..."
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleManualSearch();
                }
              }}
              leftIcon={<Search className="w-4 h-4" />}
              autoFocus
            />
            <AppButton
              variant="primary"
              onClick={handleManualSearch}
              disabled={!manualName.trim() || checkinMutation.isPending}
              className="w-full"
            >
              {checkinMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <UserCheck className="w-4 h-4 mr-2" />
              )}
              Check In Guest
            </AppButton>
            <p className="text-sm text-text-tertiary text-center">
              Searches RSVP list for matching name
            </p>
          </div>
        )}
      </div>

      {/* Success/Error Animation Overlay */}
      {lastResult && (
        <SuccessAnimation result={lastResult} onDismiss={handleDismissResult} />
      )}
    </div>
  );
};

export default CheckinScanner;
