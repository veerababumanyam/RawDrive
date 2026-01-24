/**
 * Biometric Settings Panel
 *
 * GDPR Article 9 compliant biometric consent management UI.
 * Feature: Face Detection Audit Remediation (002-face-audit-remediation)
 * Task: T027
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScanFace,
  Shield,
  Users,
  Sparkles,
  History,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { biometricConsentService } from '../../../services/biometricConsentService';
import type {
  BiometricSettingsResponse,
  BiometricConsentStatus,
  ConsentHistoryEntry,
} from '../../../types/biometricConsent';

interface BiometricSettingsPanelProps {
  workspaceId: string;
}

const CURRENT_POLICY_VERSION = '1.0';

export const BiometricSettingsPanel: React.FC<BiometricSettingsPanelProps> = ({
  workspaceId,
}) => {
  const [settings, setSettings] = useState<BiometricSettingsResponse | null>(null);
  const [history, setHistory] = useState<ConsentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [cascadeDelete, setCascadeDelete] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const data = await biometricConsentService.getSettings(workspaceId);
      setSettings(data);
      setError(null);
    } catch (err) {
      setError('Failed to load biometric settings');
      console.error('Failed to load biometric settings:', err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchHistory = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const data = await biometricConsentService.getHistory(workspaceId, 1, 10);
      setHistory(data.items);
    } catch (err) {
      console.error('Failed to load consent history:', err);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, [fetchSettings, fetchHistory]);

  const handleGrantConsent = async () => {
    setUpdating(true);
    try {
      const response = await biometricConsentService.grantConsent(workspaceId, {
        policy_version: CURRENT_POLICY_VERSION,
      });
      setSettings(response.settings);
      setShowConsentModal(false);
      fetchHistory();
    } catch (err) {
      setError('Failed to grant consent');
      console.error('Failed to grant consent:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleWithdrawConsent = async () => {
    setUpdating(true);
    try {
      const response = await biometricConsentService.withdrawConsent(
        workspaceId,
        { reason: withdrawReason || undefined },
        cascadeDelete
      );
      setSettings(response.settings);
      setShowWithdrawModal(false);
      setWithdrawReason('');
      setCascadeDelete(false);
      fetchHistory();
    } catch (err) {
      setError('Failed to withdraw consent');
      console.error('Failed to withdraw consent:', err);
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleSetting = async (
    key: 'public_face_search_enabled' | 'auto_clustering_enabled' | 'ai_processing_consent'
  ) => {
    if (!settings || settings.consent_status !== 'granted') return;
    setUpdating(true);
    try {
      const updated = await biometricConsentService.updateSettings(workspaceId, {
        [key]: !settings[key],
      });
      setSettings(updated);
    } catch (err) {
      setError('Failed to update settings');
      console.error('Failed to update settings:', err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  if (error && !settings) {
    return <div className="text-error">{error}</div>;
  }

  const consentGranted = settings?.consent_status === 'granted';
  const consentWithdrawn = settings?.consent_status === 'withdrawn';
  const pendingDeletion = settings?.consent_status === 'pending_deletion';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-text-primary flex items-center gap-3">
          <ScanFace className="w-7 h-7 text-accent" />
          Biometric & Face Detection
        </h1>
        <p className="text-text-secondary mt-1">
          Manage face detection consent and biometric data processing settings.
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-error/10 border border-error/20 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-error flex-shrink-0" />
          <p className="text-error text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-error hover:text-error/80"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Consent Status Card */}
        <ConsentStatusCard
          status={settings?.consent_status || 'not_granted'}
          consentedAt={settings?.consent_granted_at ?? null}
          onGrantClick={() => setShowConsentModal(true)}
          onWithdrawClick={() => setShowWithdrawModal(true)}
          disabled={updating || pendingDeletion}
        />

        {/* Feature Settings - Only visible when consent granted */}
        {consentGranted && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Face Detection Features</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Configure how face detection works in your workspace.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <ToggleRow
                label="Public Face Search"
                description="Allow clients to search for photos by their face in shared galleries."
                icon={<Users className="w-5 h-5" />}
                checked={!!settings?.public_face_search_enabled}
                onChange={() => handleToggleSetting('public_face_search_enabled')}
                disabled={updating}
              />
              <ToggleRow
                label="Auto Face Clustering"
                description="Automatically group detected faces into clusters for easy organization."
                icon={<ScanFace className="w-5 h-5" />}
                checked={!!settings?.auto_clustering_enabled}
                onChange={() => handleToggleSetting('auto_clustering_enabled')}
                disabled={updating}
              />
              <ToggleRow
                label="AI Processing Consent"
                description="Allow AI services to process biometric data for enhanced features."
                icon={<Sparkles className="w-5 h-5" />}
                checked={!!settings?.ai_processing_consent}
                onChange={() => handleToggleSetting('ai_processing_consent')}
                disabled={updating}
              />
            </div>
          </div>
        )}

        {/* GDPR Information */}
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex gap-4">
            <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                GDPR Article 9 Compliance
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-2">
                Face data is considered biometric data under GDPR. By enabling face detection,
                you confirm that you have obtained proper consent from individuals whose photos
                may be processed. You can withdraw consent at any time, and optionally request
                deletion of all biometric data.
              </p>
              <a
                href="/legal/biometric-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-3 inline-block"
              >
                Read our Biometric Data Policy
              </a>
            </div>
          </div>
        </div>

        {/* Consent History */}
        {history.length > 0 && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-primary/10 rounded-lg">
                <History className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Consent History</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Audit trail of consent-related actions.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {history.map((entry) => (
                <HistoryEntry key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grant Consent Modal */}
      {showConsentModal && (
        <ConsentModal
          type="grant"
          onConfirm={handleGrantConsent}
          onCancel={() => setShowConsentModal(false)}
          loading={updating}
        />
      )}

      {/* Withdraw Consent Modal */}
      {showWithdrawModal && (
        <WithdrawModal
          reason={withdrawReason}
          onReasonChange={setWithdrawReason}
          cascadeDelete={cascadeDelete}
          onCascadeDeleteChange={setCascadeDelete}
          onConfirm={handleWithdrawConsent}
          onCancel={() => {
            setShowWithdrawModal(false);
            setWithdrawReason('');
            setCascadeDelete(false);
          }}
          loading={updating}
        />
      )}
    </div>
  );
};

// ============================================================================
// Subcomponents
// ============================================================================

interface ConsentStatusCardProps {
  status: BiometricConsentStatus;
  consentedAt: string | null;
  onGrantClick: () => void;
  onWithdrawClick: () => void;
  disabled: boolean;
}

const ConsentStatusCard: React.FC<ConsentStatusCardProps> = ({
  status,
  consentedAt,
  onGrantClick,
  onWithdrawClick,
  disabled,
}) => {
  const statusConfig = {
    not_granted: {
      icon: <Shield className="w-6 h-6" />,
      bgColor: 'bg-gray-100 dark:bg-gray-800',
      iconColor: 'text-gray-600 dark:text-gray-400',
      borderColor: 'border-gray-200 dark:border-gray-700',
      title: 'Consent Not Granted',
      description: 'Face detection is disabled. Grant consent to enable biometric features.',
    },
    granted: {
      icon: <CheckCircle2 className="w-6 h-6" />,
      bgColor: 'bg-green-50 dark:bg-green-950/30',
      iconColor: 'text-green-600 dark:text-green-400',
      borderColor: 'border-green-200 dark:border-green-800',
      title: 'Consent Granted',
      description: 'Face detection is enabled. Biometric data processing is active.',
    },
    withdrawn: {
      icon: <XCircle className="w-6 h-6" />,
      bgColor: 'bg-amber-50 dark:bg-amber-950/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-200 dark:border-amber-800',
      title: 'Consent Withdrawn',
      description: 'Face detection is disabled. You can re-grant consent at any time.',
    },
    pending_deletion: {
      icon: <Loader2 className="w-6 h-6 animate-spin" />,
      bgColor: 'bg-red-50 dark:bg-red-950/30',
      iconColor: 'text-red-600 dark:text-red-400',
      borderColor: 'border-red-200 dark:border-red-800',
      title: 'Pending Deletion',
      description: 'Biometric data is being deleted. This process may take some time.',
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`rounded-2xl border ${config.borderColor} ${config.bgColor} p-6`}>
      <div className="flex items-start justify-between">
        <div className="flex gap-4">
          <div className={`p-2 rounded-lg ${config.iconColor}`}>{config.icon}</div>
          <div>
            <h3 className="font-semibold text-text-primary">{config.title}</h3>
            <p className="text-sm text-text-secondary mt-1">{config.description}</p>
            {consentedAt && status === 'granted' && (
              <p className="text-xs text-text-tertiary mt-2">
                Granted on {new Date(consentedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
        <div>
          {(status === 'not_granted' || status === 'withdrawn') && (
            <button
              onClick={onGrantClick}
              disabled={disabled}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium
                hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
            >
              Grant Consent
            </button>
          )}
          {status === 'granted' && (
            <button
              onClick={onWithdrawClick}
              disabled={disabled}
              className="px-4 py-2 bg-error/10 text-error rounded-lg font-medium
                hover:bg-error/20 disabled:opacity-50 disabled:cursor-not-allowed
                transition-colors"
            >
              Withdraw Consent
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled,
}) => (
  <div className="flex items-center justify-between py-3 border-b border-white/10 last:border-0">
    <div className="flex items-start gap-3 flex-1">
      <div className="text-text-tertiary mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="font-medium text-text-primary">{label}</div>
        <div className="text-sm text-text-secondary mt-0.5">{description}</div>
      </div>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? `Disable ${label.toLowerCase()}` : `Enable ${label.toLowerCase()}`}
      onClick={onChange}
      disabled={disabled}
      className={`
        relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
        border-2 border-transparent transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
        disabled:cursor-not-allowed disabled:opacity-50
        ${checked ? 'bg-primary' : 'bg-border'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-5 w-5 transform rounded-full
          bg-white shadow ring-0 transition duration-200 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  </div>
);

interface HistoryEntryProps {
  entry: ConsentHistoryEntry;
}

const HistoryEntry: React.FC<HistoryEntryProps> = ({ entry }) => {
  const actionConfig = {
    grant: { label: 'Consent Granted', color: 'text-green-600 dark:text-green-400' },
    withdraw: { label: 'Consent Withdrawn', color: 'text-amber-600 dark:text-amber-400' },
    settings_update: { label: 'Settings Updated', color: 'text-blue-600 dark:text-blue-400' },
  };

  const config = actionConfig[entry.action];

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`font-medium ${config.color}`}>{config.label}</span>
        {entry.reason && (
          <span className="text-text-tertiary">- {entry.reason}</span>
        )}
      </div>
      <span className="text-text-tertiary">
        {new Date(entry.performed_at).toLocaleDateString()}
      </span>
    </div>
  );
};

interface ConsentModalProps {
  type: 'grant';
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

const ConsentModal: React.FC<ConsentModalProps> = ({ onConfirm, onCancel, loading }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="glass-card shadow-2xl max-w-lg w-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary/10 rounded-lg">
          <ScanFace className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary">Grant Biometric Consent</h2>
      </div>

      <div className="space-y-4 text-text-secondary">
        <p>
          By granting consent, you acknowledge that:
        </p>
        <ul className="list-disc list-inside space-y-2 pl-2">
          <li>Face detection will analyze photos in your workspace</li>
          <li>Biometric data (face embeddings) will be stored securely</li>
          <li>You have obtained consent from individuals in the photos</li>
          <li>You can withdraw consent at any time</li>
        </ul>
        <p className="text-sm">
          This complies with GDPR Article 9 requirements for biometric data processing.
        </p>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 bg-primary text-white rounded-lg font-medium
            hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Grant Consent
        </button>
      </div>
    </div>
  </div>
);

interface WithdrawModalProps {
  reason: string;
  onReasonChange: (value: string) => void;
  cascadeDelete: boolean;
  onCascadeDeleteChange: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

const WithdrawModal: React.FC<WithdrawModalProps> = ({
  reason,
  onReasonChange,
  cascadeDelete,
  onCascadeDeleteChange,
  onConfirm,
  onCancel,
  loading,
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="glass-card shadow-2xl max-w-lg w-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-error/10 rounded-lg">
          <AlertTriangle className="w-6 h-6 text-error" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary">Withdraw Biometric Consent</h2>
      </div>

      <div className="space-y-4">
        <p className="text-text-secondary">
          Withdrawing consent will disable all face detection features. You can optionally
          request deletion of all biometric data.
        </p>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">
            Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="Why are you withdrawing consent?"
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface-hover
              text-text-primary placeholder:text-text-tertiary
              focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
            rows={3}
          />
        </div>

        <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-4 border border-red-200 dark:border-red-800">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cascadeDelete}
              onChange={(e) => onCascadeDeleteChange(e.target.checked)}
              className="mt-1 rounded border-red-300 text-error focus:ring-error"
            />
            <div>
              <span className="font-medium text-red-900 dark:text-red-100">
                Delete all biometric data
              </span>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                This will permanently delete all face embeddings and clusters.
                This action cannot be undone.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 bg-error text-white rounded-lg font-medium
            hover:bg-error/90 disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Withdraw Consent
        </button>
      </div>
    </div>
  </div>
);

export default BiometricSettingsPanel;
