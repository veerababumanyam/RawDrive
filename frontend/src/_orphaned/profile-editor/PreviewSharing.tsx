/**
 * Preview Sharing Component
 *
 * UI for creating, managing, and sharing preview links
 * for profile review with external stakeholders.
 *
 * Requirements: 9.1, 9.2, 9.8, 9.9, 9.10
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Link,
  Copy,
  Check,
  Clock,
  Eye,
  Trash2,
  Lock,
  ExternalLink,
  RefreshCw,
  MoreVertical,
  Shield,
  XCircle,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { previewSharingService } from '@/services/previewSharingService';
import type { PreviewLink, PreviewExpiration } from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

interface PreviewSharingProps {
  workspaceId: string;
  profileId: string;
  onError?: (error: string) => void;
}

interface CreateLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (options: { expiration: PreviewExpiration; password?: string }) => Promise<void>;
  isLoading: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const EXPIRATION_OPTIONS: { value: PreviewExpiration; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

// =============================================================================
// Create Link Modal Component
// =============================================================================

const CreateLinkModal: React.FC<CreateLinkModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  isLoading,
}) => {
  const [expiration, setExpiration] = useState<PreviewExpiration>('7d');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');

  const handleCreate = async () => {
    await onCreate({
      expiration,
      password: usePassword ? password : undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-link-title"
    >
      <div
        className="bg-surface rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-link-title" className="text-lg font-semibold text-text-primary mb-4">
          Create Preview Link
        </h2>

        {/* Expiration Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Link Expiration
          </label>
          <div className="flex gap-2">
            {EXPIRATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setExpiration(option.value)}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  expiration === option.value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface hover:bg-surface-hover text-text-primary'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Password Protection */}
        <div className="mb-6">
          <label className="flex items-center gap-2 text-sm font-medium text-text-secondary mb-2">
            <input
              type="checkbox"
              checked={usePassword}
              onChange={(e) => setUsePassword(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            Password protect this link
          </label>
          {usePassword && (
            <AppInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="mt-2"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <AppButton variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleCreate}
            disabled={isLoading || (usePassword && !password)}
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Link className="w-4 h-4 mr-2" />
            )}
            Create Link
          </AppButton>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Preview Link Card Component
// =============================================================================

interface LinkCardProps {
  link: PreviewLink;
  onRevoke: (linkId: string) => void;
  onDelete: (linkId: string) => void;
  onCopy: (link: PreviewLink) => void;
  isRevoking: boolean;
}

const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onRevoke,
  onDelete,
  onCopy,
  isRevoking,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = previewSharingService.getStatusLabel(link);
  const isActive = previewSharingService.isActive(link);

  const handleCopy = () => {
    onCopy(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`border rounded-lg p-4 ${
        isActive ? 'border-border' : 'border-border bg-surface-hover/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Link Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link className="w-4 h-4 text-text-tertiary flex-shrink-0" />
            <code className="text-sm text-text-primary font-mono truncate">
              {link.token.slice(0, 8)}...{link.token.slice(-4)}
            </code>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                status.variant === 'success'
                  ? 'bg-success/10 text-success'
                  : status.variant === 'warning'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-error/10 text-error'
              }`}
            >
              {status.label}
            </span>
          </div>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {previewSharingService.formatExpiration(link)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {link.view_count} view{link.view_count !== 1 ? 's' : ''}
            </span>
            {link.has_password && (
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Password protected
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isActive && (
            <>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                title="Copy link"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-success" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </AppButton>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => window.open(link.url, '_blank')}
                title="Open preview"
              >
                <ExternalLink className="w-4 h-4" />
              </AppButton>
            </>
          )}

          {/* More Menu */}
          <div className="relative">
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => setShowMenu(!showMenu)}
              aria-expanded={showMenu}
              aria-haspopup="true"
            >
              <MoreVertical className="w-4 h-4" />
            </AppButton>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg z-20">
                  {isActive && (
                    <button
                      onClick={() => {
                        setShowMenu(false);
                        onRevoke(link.link_id);
                      }}
                      disabled={isRevoking}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Revoke Link
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onDelete(link.link_id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-surface-hover transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const PreviewSharing: React.FC<PreviewSharingProps> = ({
  workspaceId,
  profileId,
  onError,
}) => {
  // State
  const [links, setLinks] = useState<PreviewLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Initialize service
  useEffect(() => {
    previewSharingService.initialize(workspaceId, profileId);
  }, [workspaceId, profileId]);

  // Fetch links
  useEffect(() => {
    const fetchLinks = async () => {
      setIsLoading(true);
      try {
        const data = await previewSharingService.listPreviewLinks({
          include_revoked: true,
          include_expired: true,
        });
        setLinks(data);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to load preview links');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLinks();

    // Subscribe to changes
    const unsubscribe = previewSharingService.subscribe(setLinks);
    return () => unsubscribe();
  }, [workspaceId, profileId, onError]);

  // Handlers
  const handleCreateLink = useCallback(
    async (options: { expiration: PreviewExpiration; password?: string }) => {
      setIsCreating(true);
      try {
        await previewSharingService.createPreviewLink(options);
        setShowCreateModal(false);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to create preview link');
      } finally {
        setIsCreating(false);
      }
    },
    [onError]
  );

  const handleRevokeLink = useCallback(
    async (linkId: string) => {
      setRevokingLinkId(linkId);
      try {
        await previewSharingService.revokePreviewLink(linkId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to revoke preview link');
      } finally {
        setRevokingLinkId(null);
      }
    },
    [onError]
  );

  const handleDeleteLink = useCallback(
    async (linkId: string) => {
      try {
        await previewSharingService.deletePreviewLink(linkId);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to delete preview link');
      }
    },
    [onError]
  );

  const handleCopyLink = useCallback(async (link: PreviewLink) => {
    const success = await previewSharingService.copyToClipboard(link);
    if (success) {
      setCopiedUrl(link.url);
      setTimeout(() => setCopiedUrl(null), 2000);
    }
  }, []);

  // Separate active and inactive links
  const activeLinks = links.filter((link) => previewSharingService.isActive(link));
  const inactiveLinks = links.filter((link) => !previewSharingService.isActive(link));

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-20 bg-surface-hover rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-text-secondary" />
          <h3 className="text-base font-medium text-text-primary">
            Preview Links
          </h3>
        </div>
        <AppButton
          variant="primary"
          size="sm"
          onClick={() => setShowCreateModal(true)}
        >
          <Link className="w-4 h-4 mr-2" />
          Create Link
        </AppButton>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-info/10 rounded-lg">
        <Shield className="w-4 h-4 text-info flex-shrink-0 mt-0.5" />
        <p className="text-sm text-text-secondary">
          Share preview links to get feedback before publishing. Links can be
          password-protected and expire automatically.
        </p>
      </div>

      {/* Active Links */}
      {activeLinks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-text-secondary">
            Active Links ({activeLinks.length})
          </h4>
          {activeLinks.map((link) => (
            <LinkCard
              key={link.link_id}
              link={link}
              onRevoke={handleRevokeLink}
              onDelete={handleDeleteLink}
              onCopy={handleCopyLink}
              isRevoking={revokingLinkId === link.link_id}
            />
          ))}
        </div>
      )}

      {/* Inactive Links */}
      {inactiveLinks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-text-tertiary">
            Expired / Revoked ({inactiveLinks.length})
          </h4>
          {inactiveLinks.map((link) => (
            <LinkCard
              key={link.link_id}
              link={link}
              onRevoke={handleRevokeLink}
              onDelete={handleDeleteLink}
              onCopy={handleCopyLink}
              isRevoking={revokingLinkId === link.link_id}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {links.length === 0 && (
        <div className="text-center py-8">
          <Link className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary text-sm mb-2">
            No preview links yet
          </p>
          <p className="text-text-tertiary text-xs mb-4">
            Create a link to share your profile for review
          </p>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            <Link className="w-4 h-4 mr-2" />
            Create Your First Link
          </AppButton>
        </div>
      )}

      {/* Copied Toast */}
      {copiedUrl && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-success text-white rounded-lg shadow-lg animate-fade-in-up">
          <Check className="w-4 h-4" />
          <span className="text-sm font-medium">Link copied to clipboard</span>
        </div>
      )}

      {/* Create Modal */}
      <CreateLinkModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateLink}
        isLoading={isCreating}
      />
    </div>
  );
};

export default PreviewSharing;
