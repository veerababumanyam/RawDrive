/**
 * ShareDialog Component
 *
 * Mobile-first dialog for creating and managing Magic Links.
 * Features:
 * - Create new magic links with optional settings
 * - Copy link URL to clipboard
 * - Native share on mobile (Web Share API)
 * - Download QR codes in multiple formats
 * - View and manage existing links
 *
 * WCAG 2.1 AA compliant with proper focus management and screen reader support.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Link,
  Copy,
  Check,
  QrCode,
  Share2,
  Clock,
  Eye,
  Trash2,
  ChevronDown,
  ChevronUp,
  Download,
  Calendar,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import {
  Modal,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from '../../ui/Modal';
import { AppButton } from '../../ui/AppButton';
import { AppInput } from '../../ui/AppInput';
import { magicLinkService, MagicLinkError } from '../../../services/magicLinkService';
import type { MagicLink, CreateMagicLinkRequest } from '../../../types/gallery';

export interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  galleryId: string;
  galleryTitle: string;
}

type ViewMode = 'create' | 'list' | 'qr';

export const ShareDialog: React.FC<ShareDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  galleryId,
  galleryTitle,
}) => {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('create');
  const [links, setLinks] = useState<MagicLink[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<MagicLink | null>(null);

  // Create form state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formData, setFormData] = useState<CreateMagicLinkRequest>({
    album_title: galleryTitle, // Default to gallery title
    label: '',
    expires_at: undefined,
    max_accesses: undefined,
  });

  // Update album_title when galleryTitle changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setFormData((prev) => ({ ...prev, album_title: galleryTitle }));
    }
  }, [isOpen, galleryTitle]);

  // Load existing links on open
  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen, workspaceId, galleryId]);

  const loadLinks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await magicLinkService.listLinks(workspaceId, galleryId, {
        limit: 50,
        status: 'active',
      });
      setLinks(response.data);
    } catch (err) {
      console.error('Failed to load links:', err);
      setError('Failed to load existing links');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId]);

  const handleCreateLink = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const newLink = await magicLinkService.createLink(workspaceId, galleryId, formData);
      setLinks((prev) => [newLink, ...prev]);
      setSelectedLink(newLink);
      setViewMode('qr');
      // Reset form
      setFormData({ album_title: galleryTitle, label: '', expires_at: undefined, max_accesses: undefined });
      setShowAdvanced(false);
    } catch (err) {
      if (err instanceof MagicLinkError) {
        setError(err.message);
      } else {
        setError('Failed to create link');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopyLink = async (link: MagicLink) => {
    // Use url (from creation), public_url (from database), or fallback
    const url = link.url || link.public_url || `${window.location.origin}/g/${link.link_id}`;
    const success = await magicLinkService.copyToClipboard(url);
    if (success) {
      setCopiedLinkId(link.link_id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  const handleShare = async (link: MagicLink) => {
    // Use url (from creation), public_url (from database), or fallback
    const url = link.url || link.public_url || `${window.location.origin}/g/${link.link_id}`;
    const result = await magicLinkService.share(
      url,
      galleryTitle,
      `Check out this gallery: ${galleryTitle}`
    );
    if (result.copied) {
      setCopiedLinkId(link.link_id);
      setTimeout(() => setCopiedLinkId(null), 2000);
    }
  };

  const handleDownloadQR = async (link: MagicLink, format: 'png' | 'svg' | 'pdf') => {
    try {
      await magicLinkService.downloadQRCode(workspaceId, galleryId, link.link_id, {
        format,
        filename: `${galleryTitle.replace(/\s+/g, '-')}-qr.${format}`,
      });
    } catch (err) {
      console.error('Failed to download QR:', err);
      setError('Failed to download QR code');
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to revoke this link? It will stop working immediately.')) {
      return;
    }
    try {
      await magicLinkService.revokeLink(workspaceId, galleryId, linkId);
      setLinks((prev) => prev.filter((l) => l.link_id !== linkId));
      if (selectedLink?.link_id === linkId) {
        setSelectedLink(null);
        setViewMode('create');
      }
    } catch (err) {
      console.error('Failed to revoke link:', err);
      setError('Failed to revoke link');
    }
  };

  const resetAndClose = () => {
    setViewMode('create');
    setSelectedLink(null);
    setError(null);
    setFormData({ album_title: galleryTitle, label: '', expires_at: undefined, max_accesses: undefined });
    setShowAdvanced(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      size="md"
      title="Share Gallery"
    >
      <ModalHeader>
        <ModalTitle>Share Gallery</ModalTitle>
        <ModalDescription>
          Create a shareable link for {galleryTitle}
        </ModalDescription>
      </ModalHeader>

      <ModalBody className="min-h-[300px]">
        {/* Error Banner */}
        {error && (
          <div
            className="mb-4 p-3 bg-error/10 border border-error/20 rounded-lg flex items-center gap-2 text-sm text-error"
            role="alert"
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-border mb-4" role="tablist">
          <button
            role="tab"
            aria-selected={viewMode === 'create'}
            onClick={() => setViewMode('create')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'create'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Plus size={16} className="inline mr-1.5" />
            Create Link
          </button>
          <button
            role="tab"
            aria-selected={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'list'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Link size={16} className="inline mr-1.5" />
            My Links ({links.length})
          </button>
          {selectedLink && (
            <button
              role="tab"
              aria-selected={viewMode === 'qr'}
              onClick={() => setViewMode('qr')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                viewMode === 'qr'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <QrCode size={16} className="inline mr-1.5" />
              QR Code
            </button>
          )}
        </div>

        {/* Create View */}
        {viewMode === 'create' && (
          <div className="space-y-4">
            <AppInput
              label="Album Title"
              value={formData.album_title}
              onChange={(e) => setFormData({ ...formData, album_title: e.target.value })}
              placeholder="e.g., Sarah & John's Wedding - June 2025"
              maxLength={200}
              required
              helperText="This title will be displayed to your clients on the public gallery page"
            />

            <AppInput
              label="Link Label (Optional)"
              value={formData.label || ''}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Internal label for your reference"
              leftIcon={<Link size={16} />}
            />

            {/* Advanced Options Toggle */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              Advanced options
            </button>

            {showAdvanced && (
              <div className="space-y-4 pl-4 border-l-2 border-border">
                <AppInput
                  type="datetime-local"
                  label="Expiration Date"
                  value={formData.expires_at?.slice(0, 16) || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expires_at: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                    })
                  }
                  leftIcon={<Calendar size={16} />}
                />

                <AppInput
                  type="number"
                  label="Maximum Views"
                  value={formData.max_accesses?.toString() || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_accesses: e.target.value ? parseInt(e.target.value, 10) : undefined,
                    })
                  }
                  min={1}
                  max={100000}
                  placeholder="Unlimited"
                  leftIcon={<Eye size={16} />}
                />
              </div>
            )}

            <AppButton
              variant="primary"
              onClick={handleCreateLink}
              isLoading={isCreating}
              disabled={!formData.album_title?.trim()}
              fullWidth
              className="mt-4"
            >
              <Link size={16} className="mr-2" />
              Create Shareable Link
            </AppButton>
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-text-tertiary" size={24} />
              </div>
            ) : links.length === 0 ? (
              <div className="text-center py-8 text-text-secondary">
                <Link size={32} className="mx-auto mb-2 opacity-50" />
                <p>No active links yet</p>
                <AppButton
                  variant="outline"
                  size="sm"
                  onClick={() => setViewMode('create')}
                  className="mt-4"
                >
                  Create your first link
                </AppButton>
              </div>
            ) : (
              links.map((link) => (
                <LinkCard
                  key={link.link_id}
                  link={link}
                  isCopied={copiedLinkId === link.link_id}
                  onCopy={() => handleCopyLink(link)}
                  onShare={() => handleShare(link)}
                  onViewQR={() => {
                    setSelectedLink(link);
                    setViewMode('qr');
                  }}
                  onRevoke={() => handleRevokeLink(link.link_id)}
                />
              ))
            )}
          </div>
        )}

        {/* QR Code View */}
        {viewMode === 'qr' && selectedLink && (
          <QRCodeView
            link={selectedLink}
            workspaceId={workspaceId}
            galleryId={galleryId}
            galleryTitle={galleryTitle}
            isCopied={copiedLinkId === selectedLink.link_id}
            onCopy={() => handleCopyLink(selectedLink)}
            onShare={() => handleShare(selectedLink)}
            onDownload={(format) => handleDownloadQR(selectedLink, format)}
          />
        )}
      </ModalBody>

      <ModalFooter>
        <AppButton variant="secondary" onClick={resetAndClose}>
          Done
        </AppButton>
      </ModalFooter>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// LinkCard Component
// ---------------------------------------------------------------------------

interface LinkCardProps {
  link: MagicLink;
  isCopied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onViewQR: () => void;
  onRevoke: () => void;
}

const LinkCard: React.FC<LinkCardProps> = ({
  link,
  isCopied,
  onCopy,
  onShare,
  onViewQR,
  onRevoke,
}) => {
  const expirationText = magicLinkService.formatExpiration(link.expires_at);
  const accessText = magicLinkService.formatAccessCount(link.access_count, link.max_accesses);

  return (
    <div className="p-3 bg-background rounded-lg border border-border hover:border-border-focus transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary truncate">
            {link.label || 'Untitled Link'}
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-text-tertiary">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {expirationText}
            </span>
            <span className="flex items-center gap-1">
              <Eye size={12} />
              {accessText}
            </span>
          </div>
        </div>
      </div>

      {/* Action Buttons - Mobile-optimized */}
      <div className="flex items-center gap-2 mt-3">
        <AppButton
          variant="outline"
          size="sm"
          onClick={onCopy}
          className="flex-1"
          aria-label={isCopied ? 'Link copied' : 'Copy link'}
        >
          {isCopied ? (
            <>
              <Check size={14} className="mr-1 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy size={14} className="mr-1" />
              Copy
            </>
          )}
        </AppButton>

        <AppButton
          variant="outline"
          size="sm"
          onClick={onShare}
          className="flex-1"
          aria-label="Share link"
        >
          <Share2 size={14} className="mr-1" />
          Share
        </AppButton>

        <AppButton
          variant="outline"
          size="sm"
          onClick={onViewQR}
          aria-label="View QR code"
        >
          <QrCode size={14} />
        </AppButton>

        <AppButton
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          className="text-text-tertiary hover:text-error"
          aria-label="Revoke link"
        >
          <Trash2 size={14} />
        </AppButton>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// QRCodeView Component
// ---------------------------------------------------------------------------

interface QRCodeViewProps {
  link: MagicLink;
  workspaceId: string;
  galleryId: string;
  galleryTitle: string;
  isCopied: boolean;
  onCopy: () => void;
  onShare: () => void;
  onDownload: (format: 'png' | 'svg' | 'pdf') => void;
}

const QRCodeView: React.FC<QRCodeViewProps> = ({
  link,
  workspaceId,
  galleryId,
  galleryTitle,
  isCopied,
  onCopy,
  onShare,
  onDownload,
}) => {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [isLoadingQR, setIsLoadingQR] = useState(true);

  useEffect(() => {
    const loadQR = async () => {
      setIsLoadingQR(true);
      try {
        const blob = await magicLinkService.getQRCode(workspaceId, galleryId, link.link_id, {
          format: 'png',
          size: 512,
        });
        setQrUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error('Failed to load QR code:', err);
      } finally {
        setIsLoadingQR(false);
      }
    };
    loadQR();

    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl);
    };
  }, [workspaceId, galleryId, link.link_id]);

  // Use url (from creation), public_url (from database), or fallback
  const linkUrl = link.url || link.public_url || `${window.location.origin}/g/${link.link_id}`;

  return (
    <div className="space-y-4">
      {/* QR Code Display */}
      <div className="flex justify-center p-6 bg-white rounded-lg border border-border">
        {isLoadingQR ? (
          <div className="w-48 h-48 flex items-center justify-center">
            <Loader2 className="animate-spin text-text-tertiary" size={32} />
          </div>
        ) : qrUrl ? (
          <img
            src={qrUrl}
            alt={`QR code for ${galleryTitle}`}
            className="w-48 h-48"
          />
        ) : (
          <div className="w-48 h-48 flex items-center justify-center text-text-tertiary">
            <AlertCircle size={32} />
          </div>
        )}
      </div>

      {/* Link URL Display */}
      <div className="p-3 bg-background rounded-lg border border-border">
        <p className="text-xs text-text-tertiary mb-1">Link URL</p>
        <p className="text-sm font-mono text-text-primary truncate">{linkUrl}</p>
      </div>

      {/* Copy & Share Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <AppButton variant="outline" onClick={onCopy} fullWidth>
          {isCopied ? (
            <>
              <Check size={16} className="mr-2 text-success" />
              Copied!
            </>
          ) : (
            <>
              <Copy size={16} className="mr-2" />
              Copy Link
            </>
          )}
        </AppButton>

        <AppButton variant="primary" onClick={onShare} fullWidth>
          <Share2 size={16} className="mr-2" />
          Share
        </AppButton>
      </div>

      {/* Download Options */}
      <div className="border-t border-border pt-4">
        <p className="text-sm font-medium text-text-primary mb-3">Download QR Code</p>
        <div className="grid grid-cols-3 gap-2">
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => onDownload('png')}
            fullWidth
          >
            <Download size={14} className="mr-1" />
            PNG
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => onDownload('svg')}
            fullWidth
          >
            <Download size={14} className="mr-1" />
            SVG
          </AppButton>
          <AppButton
            variant="outline"
            size="sm"
            onClick={() => onDownload('pdf')}
            fullWidth
          >
            <Download size={14} className="mr-1" />
            PDF
          </AppButton>
        </div>
      </div>

      {/* Link Stats */}
      <div className="flex items-center justify-center gap-4 text-xs text-text-tertiary">
        <span className="flex items-center gap-1">
          <Eye size={12} />
          {magicLinkService.formatAccessCount(link.access_count, link.max_accesses)}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {magicLinkService.formatExpiration(link.expires_at)}
        </span>
      </div>
    </div>
  );
};

export default ShareDialog;
