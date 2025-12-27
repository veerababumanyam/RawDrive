import React, { useState, useCallback, useMemo } from 'react';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  MapPin,
  Clock,
  LogOut,
  AlertTriangle,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import { AppButton } from '../ui/AppButton';
import { useSessions } from '../../hooks/useUserSettings';
import { useToastActions } from '../ui/Toast';
import type { SessionItem } from '../../types/userSettings';

/* =============================================================================
   SessionList Component

   Displays active sessions with ability to terminate individual sessions
   or all other sessions. Includes device info, location, and last activity.
   ============================================================================= */

interface SessionListProps {
  /** Called when a session is terminated */
  onSessionTerminated?: () => void;
}

// Parse user agent to determine device type
const getDeviceInfo = (userAgent?: string | null): { icon: typeof Monitor; label: string } => {
  if (!userAgent) {
    return { icon: Monitor, label: 'Unknown device' };
  }

  const ua = userAgent.toLowerCase();

  // Mobile devices
  if (ua.includes('iphone') || ua.includes('ipad')) {
    return { icon: ua.includes('ipad') ? Tablet : Smartphone, label: 'iOS Device' };
  }
  if (ua.includes('android')) {
    return { icon: ua.includes('tablet') ? Tablet : Smartphone, label: 'Android Device' };
  }

  // Desktop browsers
  if (ua.includes('windows')) {
    return { icon: Monitor, label: 'Windows' };
  }
  if (ua.includes('macintosh') || ua.includes('mac os')) {
    return { icon: Monitor, label: 'Mac' };
  }
  if (ua.includes('linux')) {
    return { icon: Monitor, label: 'Linux' };
  }

  return { icon: Globe, label: 'Browser' };
};

// Get browser name from user agent
const getBrowserName = (userAgent?: string | null): string => {
  if (!userAgent) return 'Unknown browser';

  const ua = userAgent.toLowerCase();

  if (ua.includes('edg/')) return 'Microsoft Edge';
  if (ua.includes('chrome')) return 'Chrome';
  if (ua.includes('safari')) return 'Safari';
  if (ua.includes('firefox')) return 'Firefox';
  if (ua.includes('opera') || ua.includes('opr/')) return 'Opera';

  return 'Browser';
};

// Format relative time
const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
};

// Format location string
const formatLocation = (session: SessionItem): string => {
  const parts: string[] = [];

  if (session.location?.city) {
    parts.push(session.location.city);
  }
  if (session.location?.region) {
    parts.push(session.location.region);
  }
  if (session.location?.country) {
    parts.push(session.location.country);
  }

  if (parts.length === 0 && session.ip_address) {
    return session.ip_address;
  }

  return parts.join(', ') || 'Unknown location';
};

// Session card component
const SessionCard: React.FC<{
  session: SessionItem;
  onTerminate: (sessionId: string) => void;
  isTerminating: boolean;
}> = ({ session, onTerminate, isTerminating }) => {
  const deviceInfo = useMemo(() => getDeviceInfo(session.user_agent), [session.user_agent]);
  const browserName = useMemo(() => getBrowserName(session.user_agent), [session.user_agent]);
  const location = useMemo(() => formatLocation(session), [session]);
  const lastUsed = useMemo(() => formatRelativeTime(session.last_used_at), [session.last_used_at]);

  const DeviceIcon = deviceInfo.icon;

  return (
    <div
      className={`p-4 rounded-xl border transition-colors ${
        session.is_current
          ? 'bg-primary/5 border-primary/20'
          : 'bg-surface border-border hover:border-border-hover'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Device icon */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            session.is_current ? 'bg-primary/10 text-primary' : 'bg-surface-hover text-text-secondary'
          }`}
        >
          <DeviceIcon className="w-5 h-5" />
        </div>

        {/* Session details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-text-primary truncate">
              {deviceInfo.label} - {browserName}
            </h4>
            {session.is_current && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                <Check className="w-3 h-3" />
                This device
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-secondary">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />
              {location}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {lastUsed}
            </span>
          </div>
        </div>

        {/* Terminate button */}
        {!session.is_current && (
          <AppButton
            variant="ghost"
            size="sm"
            onClick={() => onTerminate(session.session_id)}
            disabled={isTerminating}
            className="text-error hover:bg-error/10"
            title="Sign out this session"
          >
            {isTerminating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
          </AppButton>
        )}
      </div>
    </div>
  );
};

// Confirm modal for terminating all sessions
const TerminateAllModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  sessionCount: number;
}> = ({ isOpen, onClose, onConfirm, isLoading, sessionCount }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isLoading ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminate-all-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="terminate-all-title" className="text-lg font-semibold text-text-primary">
            Sign out other sessions?
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-warning/10 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-text-primary">
                This will sign out {sessionCount} other {sessionCount === 1 ? 'session' : 'sessions'}.
                You'll stay signed in on this device.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <AppButton
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </AppButton>
            <AppButton
              type="button"
              variant="destructive"
              onClick={onConfirm}
              isLoading={isLoading}
              loadingText="Signing out..."
            >
              Sign out all others
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SessionList: React.FC<SessionListProps> = ({ onSessionTerminated }) => {
  const { sessions, loading, error, terminateSession, terminateAllOther, refetch } = useSessions();
  const toast = useToastActions();

  // State
  const [terminatingId, setTerminatingId] = useState<string | null>(null);
  const [showTerminateAllModal, setShowTerminateAllModal] = useState(false);
  const [isTerminatingAll, setIsTerminatingAll] = useState(false);

  // Count other sessions
  const otherSessionsCount = useMemo(
    () => sessions.filter((s) => !s.is_current).length,
    [sessions]
  );

  // Terminate single session
  const handleTerminateSession = useCallback(
    async (sessionId: string) => {
      setTerminatingId(sessionId);
      try {
        await terminateSession(sessionId);
        toast.success('Session signed out');
        onSessionTerminated?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to sign out session');
      } finally {
        setTerminatingId(null);
      }
    },
    [terminateSession, toast, onSessionTerminated]
  );

  // Terminate all other sessions
  const handleTerminateAll = useCallback(async () => {
    setIsTerminatingAll(true);
    try {
      await terminateAllOther();
      setShowTerminateAllModal(false);
      toast.success('All other sessions signed out');
      onSessionTerminated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to sign out sessions');
    } finally {
      setIsTerminatingAll(false);
    }
  }, [terminateAllOther, toast, onSessionTerminated]);

  // Loading state
  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 bg-error/10 rounded-xl text-center">
        <p className="text-error text-sm">{error.message}</p>
        <AppButton variant="outline" size="sm" onClick={refetch} className="mt-2">
          Try again
        </AppButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with terminate all button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-text-primary">Active Sessions</h3>
          <p className="text-sm text-text-secondary">
            {sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}
          </p>
        </div>
        {otherSessionsCount > 0 && (
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setShowTerminateAllModal(true)}
            className="text-error border-error hover:bg-error/10"
          >
            Sign out all others
          </AppButton>
        )}
      </div>

      {/* Sessions list */}
      <div className="space-y-3">
        {sessions.map((session) => (
          <SessionCard
            key={session.session_id}
            session={session}
            onTerminate={handleTerminateSession}
            isTerminating={terminatingId === session.session_id}
          />
        ))}
      </div>

      {/* Empty state */}
      {sessions.length === 0 && (
        <div className="text-center py-8">
          <Monitor className="w-12 h-12 mx-auto text-text-tertiary mb-3" />
          <p className="text-text-secondary">No active sessions found</p>
        </div>
      )}

      {/* Terminate all modal */}
      <TerminateAllModal
        isOpen={showTerminateAllModal}
        onClose={() => setShowTerminateAllModal(false)}
        onConfirm={handleTerminateAll}
        isLoading={isTerminatingAll}
        sessionCount={otherSessionsCount}
      />
    </div>
  );
};

export default SessionList;
