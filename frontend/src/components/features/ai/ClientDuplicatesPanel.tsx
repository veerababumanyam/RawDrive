/**
 * ClientDuplicatesPanel Component
 * Feature: Phase 2 - AI Duplicate Detection
 *
 * AI-powered client duplicate detection using Gemini semantic embeddings
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Users,
  Trash2,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Sparkles,
  ChevronDown,
  Eye,
  UserCircle,
  Mail,
  Phone,
  Merge,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AIErrorBoundary, AISpinner } from './index';
import {
  useDuplicateDetection,
  type DuplicateClientGroup,
  type DuplicateClientMember,
  type DetectClientDuplicatesRequest,
} from '@/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientDuplicatesPanelProps {
  /** Workspace ID */
  workspaceId: string;
  /** Total clients in workspace */
  totalClients: number;
  /** Callback when detection completes */
  onDetectionComplete?: (groups: DuplicateClientGroup[]) => void;
  /** Callback when a duplicate group is confirmed/dismissed */
  onGroupAction?: (groupId: string, action: 'confirmed' | 'dismissed') => void;
  /** Optional custom class name */
  className?: string;
}

interface ExtendedDuplicateGroup extends DuplicateClientGroup {
  primaryClient?: DuplicateClientMember;
  duplicates?: DuplicateClientMember[];
}

type DetectionMode = 'ai' | 'traditional' | 'hybrid';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ClientDuplicatesPanel: React.FC<ClientDuplicatesPanelProps> = ({
  workspaceId,
  totalClients,
  onDetectionComplete,
  onGroupAction,
  className = '',
}) => {
  // Detection settings
  const [mode, setMode] = useState<DetectionMode>('hybrid');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.75);
  const [minGroupSize, setMinGroupSize] = useState(2);
  const [showSettings, setShowSettings] = useState(false);

  // UI state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Duplicate detection hook
  const {
    detectClientDuplicates,
    clientDuplicatesData,
    isDetectingClients,
    clientDuplicatesError,
    confirmGroup,
    dismissGroup,
    isConfirming,
    isDismissing,
  } = useDuplicateDetection(workspaceId);

  // Process duplicate groups for display
  const duplicateGroups = useMemo<ExtendedDuplicateGroup[]>(() => {
    if (!clientDuplicatesData?.duplicate_groups) return [];

    return clientDuplicatesData.duplicate_groups.map((group) => {
      const primaryClient = group.members.find((m) => m.is_primary);
      const duplicates = group.members.filter((m) => !m.is_primary);

      return {
        ...group,
        primaryClient,
        duplicates,
      };
    });
  }, [clientDuplicatesData]);

  // Run duplicate detection
  const handleDetect = useCallback(async () => {
    setError(null);

    try {
      const request: DetectClientDuplicatesRequest = {
        mode,
        similarity_threshold: similarityThreshold,
        min_group_size: minGroupSize,
      };

      detectClientDuplicates(request, {
        onSuccess: (data) => {
          onDetectionComplete?.(data.duplicate_groups);
        },
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Duplicate detection failed';
          setError(message);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Duplicate detection failed';
      setError(message);
    }
  }, [
    workspaceId,
    mode,
    similarityThreshold,
    minGroupSize,
    detectClientDuplicates,
    onDetectionComplete,
  ]);

  // Toggle group expansion
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // Confirm duplicate group
  const handleConfirm = useCallback(
    (groupId: string) => {
      confirmGroup(
        { groupId },
        {
          onSuccess: () => {
            onGroupAction?.(groupId, 'confirmed');
          },
        }
      );
    },
    [confirmGroup, onGroupAction]
  );

  // Dismiss duplicate group
  const handleDismiss = useCallback(
    (groupId: string) => {
      dismissGroup(
        { groupId },
        {
          onSuccess: () => {
            onGroupAction?.(groupId, 'dismissed');
          },
        }
      );
    },
    [dismissGroup, onGroupAction]
  );

  // Stats
  const stats = clientDuplicatesData
    ? {
        totalGroups: clientDuplicatesData.total_groups,
        totalScanned: clientDuplicatesData.total_clients_scanned,
        clientsWithDuplicates: clientDuplicatesData.clients_with_duplicates,
        creditsUsed: clientDuplicatesData.credits_used,
        creditsRemaining: clientDuplicatesData.credits_remaining,
      }
    : null;

  // Mode descriptions
  const modeDescriptions = {
    traditional: 'Fast name/email/phone matching (free)',
    ai: 'Semantic AI matching with Gemini embeddings',
    hybrid: 'Best of both: Traditional + AI (recommended)',
  };

  return (
    <AIErrorBoundary featureName="Client Duplicate Detection">
      <div className={`bg-surface rounded-card border border-border p-6 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Client Duplicates</h3>
              <p className="text-sm text-text-secondary">
                AI-powered duplicate detection using semantic embeddings
              </p>
            </div>
          </div>
          {!isDetectingClients && !clientDuplicatesData && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              aria-expanded={showSettings}
              aria-label="Toggle settings"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              />
            </AppButton>
          )}
        </div>

        {/* Settings */}
        {showSettings && !isDetectingClients && !clientDuplicatesData && (
          <div className="space-y-4 mb-6 pb-6 border-b border-border">
            {/* Detection mode */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Detection Mode
              </label>
              <div className="space-y-2">
                {(['traditional', 'ai', 'hybrid'] as DetectionMode[]).map((modeOption) => (
                  <button
                    key={modeOption}
                    onClick={() => setMode(modeOption)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                      mode === modeOption
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background hover:border-accent'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        mode === modeOption
                          ? 'border-primary bg-primary'
                          : 'border-border bg-background'
                      }`}
                    >
                      {mode === modeOption && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-text-primary capitalize">
                        {modeOption}
                        {modeOption === 'hybrid' && (
                          <span className="ml-2 text-xs text-primary">(Recommended)</span>
                        )}
                      </div>
                      <div className="text-xs text-text-secondary mt-0.5">
                        {modeDescriptions[modeOption]}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Similarity threshold slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Similarity Threshold
                </label>
                <span className="text-sm text-text-secondary">
                  {Math.round(similarityThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={similarityThreshold * 100}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value) / 100)}
                className="ai-range-input"
                aria-label="Similarity threshold"
              />
              <p className="text-xs text-text-tertiary mt-1">
                Higher values require more similarity (stricter matching)
              </p>
            </div>

            {/* Minimum group size */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Minimum Group Size
              </label>
              <select
                value={minGroupSize}
                onChange={(e) => setMinGroupSize(Number(e.target.value))}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-text-primary hover:border-accent transition-colors"
              >
                <option value={2}>2 clients (show all duplicates)</option>
                <option value={3}>3 clients (groups of 3+)</option>
                <option value={4}>4 clients (groups of 4+)</option>
              </select>
            </div>
          </div>
        )}

        {/* Client info */}
        {!isDetectingClients && !clientDuplicatesData && (
          <div className="flex items-center gap-2 text-sm text-text-secondary bg-background rounded-lg px-4 py-2 mb-6">
            <UserCircle className="w-4 h-4" />
            <span>{totalClients} clients in workspace</span>
          </div>
        )}

        {/* Loading state */}
        {isDetectingClients && (
          <div className="mb-6">
            <AISpinner featureType="duplicate-detection" />
            <p className="text-sm text-text-secondary text-center mt-4">
              {mode === 'ai' || mode === 'hybrid'
                ? 'Analyzing client data with AI embeddings...'
                : 'Analyzing client data for matches...'}
            </p>
          </div>
        )}

        {/* Error state */}
        {(error || clientDuplicatesError) && (
          <div
            className="mb-6 p-4 bg-error/10 border border-error/20 rounded-lg text-error"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Detection failed</p>
                <p className="text-sm mt-1 opacity-80">
                  {error || clientDuplicatesError?.message}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {clientDuplicatesData && stats && (
          <div className="mb-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">{stats.totalGroups}</div>
                <div className="text-xs text-text-secondary mt-1">Duplicate Groups</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">
                  {stats.clientsWithDuplicates}
                </div>
                <div className="text-xs text-text-secondary mt-1">Clients with Duplicates</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-text-primary">{stats.totalScanned}</div>
                <div className="text-xs text-text-secondary mt-1">Clients Scanned</div>
              </div>
              <div className="bg-background rounded-lg px-4 py-3 border border-border">
                <div className="text-2xl font-bold text-primary">{stats.creditsUsed}</div>
                <div className="text-xs text-text-secondary mt-1">AI Credits Used</div>
              </div>
            </div>

            {/* No duplicates found */}
            {duplicateGroups.length === 0 && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success/10 text-success mb-4">
                  <Check className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-2">
                  No Duplicates Found
                </h4>
                <p className="text-sm text-text-secondary">
                  All your client records are unique! No duplicate clients were detected.
                </p>
              </div>
            )}

            {/* Duplicate groups */}
            {duplicateGroups.length > 0 && (
              <div className="space-y-4">
                {duplicateGroups.map((group) => {
                  const isExpanded = expandedGroups.has(group.group_id || '');
                  const groupId = group.group_id || '';

                  return (
                    <div
                      key={groupId}
                      className="bg-background rounded-lg border border-border overflow-hidden"
                    >
                      {/* Group header */}
                      <button
                        onClick={() => toggleGroup(groupId)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-hover transition-colors"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex items-center gap-3">
                          <Merge className="w-5 h-5 text-text-secondary" />
                          <div className="text-left">
                            <div className="text-sm font-medium text-text-primary">
                              {group.members.length} similar clients
                            </div>
                            <div className="text-xs text-text-secondary">
                              {Math.round(group.similarity_score * 100)}% similarity •{' '}
                              {group.detection_method}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              group.status === 'confirmed'
                                ? 'bg-success/10 text-success'
                                : group.status === 'dismissed'
                                ? 'bg-text-tertiary/10 text-text-tertiary'
                                : 'bg-warning/10 text-warning'
                            }`}
                          >
                            {group.status || 'pending'}
                          </div>
                          <ChevronDown
                            className={`w-4 h-4 text-text-secondary transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {/* Group content */}
                      {isExpanded && (
                        <div className="px-4 pb-4">
                          {/* Primary client */}
                          {group.primaryClient && (
                            <div className="mb-4">
                              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                                Primary Client
                              </div>
                              <div className="p-3 bg-surface rounded-lg border border-primary/20">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                    <UserCircle className="w-6 h-6" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-text-primary">
                                      {group.primaryClient.full_name}
                                    </div>
                                    {group.primaryClient.primary_email && (
                                      <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                                        <Mail className="w-3 h-3" />
                                        {group.primaryClient.primary_email}
                                      </div>
                                    )}
                                    {group.primaryClient.primary_phone && (
                                      <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                                        <Phone className="w-3 h-3" />
                                        {group.primaryClient.primary_phone}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Duplicate clients */}
                          {group.duplicates && group.duplicates.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                                Potential Duplicates ({group.duplicates.length})
                              </div>
                              <div className="space-y-2">
                                {group.duplicates.map((client) => (
                                  <div
                                    key={client.client_id}
                                    className="p-3 bg-surface rounded-lg border border-border"
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="w-8 h-8 rounded-full bg-text-tertiary/10 text-text-tertiary flex items-center justify-center flex-shrink-0">
                                        <UserCircle className="w-5 h-5" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-text-primary">
                                          {client.full_name}
                                        </div>
                                        {client.primary_email && (
                                          <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                                            <Mail className="w-3 h-3" />
                                            {client.primary_email}
                                          </div>
                                        )}
                                        {client.primary_phone && (
                                          <div className="flex items-center gap-1.5 text-xs text-text-secondary mt-1">
                                            <Phone className="w-3 h-3" />
                                            {client.primary_phone}
                                          </div>
                                        )}
                                        {client.similarity_to_primary && (
                                          <div className="text-xs text-primary mt-1">
                                            {Math.round(client.similarity_to_primary * 100)}%
                                            similar
                                            {client.match_reason && ` • ${client.match_reason}`}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          {group.status === 'pending' && (
                            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
                              <AppButton
                                variant="primary"
                                size="sm"
                                leftIcon={<Check className="w-4 h-4" />}
                                onClick={() => handleConfirm(groupId)}
                                isLoading={isConfirming}
                                disabled={isConfirming || isDismissing}
                              >
                                Confirm Duplicates
                              </AppButton>
                              <AppButton
                                variant="outline"
                                size="sm"
                                leftIcon={<X className="w-4 h-4" />}
                                onClick={() => handleDismiss(groupId)}
                                isLoading={isDismissing}
                                disabled={isConfirming || isDismissing}
                              >
                                Not Duplicates
                              </AppButton>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Re-run button */}
            <div className="mt-6">
              <AppButton
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={handleDetect}
              >
                Re-scan with different settings
              </AppButton>
            </div>
          </div>
        )}

        {/* Detect button */}
        {!clientDuplicatesData && (
          <AppButton
            variant="primary"
            fullWidth
            leftIcon={<Eye className="w-4 h-4" />}
            onClick={handleDetect}
            isLoading={isDetectingClients}
            loadingText="Detecting duplicates..."
            disabled={isDetectingClients}
          >
            Detect Duplicates
          </AppButton>
        )}

        {/* Credits info */}
        {stats && (
          <div className="mt-4 text-xs text-text-tertiary text-center">
            {stats.creditsRemaining} AI credits remaining
            {(mode === 'ai' || mode === 'hybrid') && (
              <> • AI mode uses credits for semantic analysis</>
            )}
          </div>
        )}
      </div>
    </AIErrorBoundary>
  );
};

export default ClientDuplicatesPanel;
