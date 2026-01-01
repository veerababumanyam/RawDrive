/**
 * ShareButtons: Social media sharing buttons for invitations
 *
 * Provides share functionality for:
 * - WhatsApp
 * - Facebook
 * - Twitter/X
 * - Email
 * - Copy Link
 * - QR Code
 *
 * Feature: 016-save-the-date Phase 9
 */

import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  Mail,
  QrCode,
  ExternalLink,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { Modal, ModalHeader, ModalBody } from '@/components/ui/Modal';
import { useToast } from '@/hooks/useToast';

// Social media icons as inline SVGs for better control
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const TwitterIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
  showQrCode?: boolean;
  className?: string;
  variant?: 'icons' | 'buttons' | 'compact';
}

export const ShareButtons: React.FC<ShareButtonsProps> = ({
  url,
  title,
  description = '',
  imageUrl,
  showQrCode = true,
  className = '',
  variant = 'icons',
}) => {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const encodedDescription = encodeURIComponent(description);

  // Share URLs
  const shareUrls = {
    whatsapp: `https://wa.me/?text=${encodedTitle}%0A${encodedDescription}%0A${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedTitle}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedDescription}%0A%0A${encodedUrl}`,
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('Link copied to clipboard!', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleShare = (platform: keyof typeof shareUrls) => {
    window.open(shareUrls[platform], '_blank', 'noopener,noreferrer,width=600,height=400');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
      } catch (err) {
        // User cancelled or error
      }
    }
  };

  const buttonBaseClass =
    'flex items-center justify-center transition-all duration-200 hover:scale-105';

  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => handleShare('whatsapp')}
          className={`${buttonBaseClass} w-9 h-9 rounded-full bg-[#25D366] text-white hover:bg-[#20BD5A]`}
          title="Share on WhatsApp"
        >
          <WhatsAppIcon />
        </button>
        <button
          onClick={handleCopyLink}
          className={`${buttonBaseClass} w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-700 text-text-primary hover:bg-neutral-300 dark:hover:bg-neutral-600`}
          title="Copy link"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        {showQrCode && (
          <button
            onClick={() => setShowQrModal(true)}
            className={`${buttonBaseClass} w-9 h-9 rounded-full bg-neutral-200 dark:bg-neutral-700 text-text-primary hover:bg-neutral-300 dark:hover:bg-neutral-600`}
            title="Show QR Code"
          >
            <QrCode className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (variant === 'icons') {
    return (
      <>
        <div className={`flex items-center gap-3 ${className}`}>
          {/* WhatsApp */}
          <button
            onClick={() => handleShare('whatsapp')}
            className={`${buttonBaseClass} w-10 h-10 rounded-full bg-[#25D366] text-white hover:bg-[#20BD5A]`}
            title="Share on WhatsApp"
          >
            <WhatsAppIcon />
          </button>

          {/* Facebook */}
          <button
            onClick={() => handleShare('facebook')}
            className={`${buttonBaseClass} w-10 h-10 rounded-full bg-[#1877F2] text-white hover:bg-[#166FE5]`}
            title="Share on Facebook"
          >
            <FacebookIcon />
          </button>

          {/* Twitter/X */}
          <button
            onClick={() => handleShare('twitter')}
            className={`${buttonBaseClass} w-10 h-10 rounded-full bg-black text-white hover:bg-neutral-800`}
            title="Share on X"
          >
            <TwitterIcon />
          </button>

          {/* Email */}
          <button
            onClick={() => handleShare('email')}
            className={`${buttonBaseClass} w-10 h-10 rounded-full bg-neutral-600 text-white hover:bg-neutral-500`}
            title="Share via Email"
          >
            <Mail className="w-5 h-5" />
          </button>

          {/* Copy Link */}
          <button
            onClick={handleCopyLink}
            className={`${buttonBaseClass} w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 text-text-primary hover:bg-neutral-300 dark:hover:bg-neutral-600`}
            title="Copy link"
          >
            {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
          </button>

          {/* QR Code */}
          {showQrCode && (
            <button
              onClick={() => setShowQrModal(true)}
              className={`${buttonBaseClass} w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-700 text-text-primary hover:bg-neutral-300 dark:hover:bg-neutral-600`}
              title="Show QR Code"
            >
              <QrCode className="w-5 h-5" />
            </button>
          )}

          {/* Native Share (mobile) */}
          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              onClick={handleNativeShare}
              className={`${buttonBaseClass} w-10 h-10 rounded-full bg-primary text-white hover:bg-primary-600`}
              title="More sharing options"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* QR Code Modal */}
        <QrCodeModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          url={url}
          title={title}
        />
      </>
    );
  }

  // variant === 'buttons'
  return (
    <>
      <div className={`flex flex-wrap gap-3 ${className}`}>
        <AppButton
          variant="outline"
          onClick={() => handleShare('whatsapp')}
          leftIcon={<WhatsAppIcon />}
          className="bg-[#25D366]/10 border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white"
        >
          WhatsApp
        </AppButton>

        <AppButton
          variant="outline"
          onClick={() => handleShare('facebook')}
          leftIcon={<FacebookIcon />}
          className="bg-[#1877F2]/10 border-[#1877F2] text-[#1877F2] hover:bg-[#1877F2] hover:text-white"
        >
          Facebook
        </AppButton>

        <AppButton
          variant="outline"
          onClick={() => handleShare('twitter')}
          leftIcon={<TwitterIcon />}
        >
          X (Twitter)
        </AppButton>

        <AppButton
          variant="outline"
          onClick={() => handleShare('email')}
          leftIcon={<Mail className="w-4 h-4" />}
        >
          Email
        </AppButton>

        <AppButton
          variant="outline"
          onClick={handleCopyLink}
          leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </AppButton>

        {showQrCode && (
          <AppButton
            variant="outline"
            onClick={() => setShowQrModal(true)}
            leftIcon={<QrCode className="w-4 h-4" />}
          >
            QR Code
          </AppButton>
        )}
      </div>

      <QrCodeModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        url={url}
        title={title}
      />
    </>
  );
};

// QR Code Modal Component
interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

const QrCodeModal: React.FC<QrCodeModalProps> = ({ isOpen, onClose, url, title }) => {
  const { showToast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen && url) {
      // Generate QR code using a simple API (or could use a library like qrcode)
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(url)}&format=png`;
      setQrDataUrl(qrApiUrl);
    }
  }, [isOpen, url]);

  const handleDownload = () => {
    if (qrDataUrl) {
      const link = document.createElement('a');
      link.href = qrDataUrl;
      link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_qr.png`;
      link.click();
      showToast('QR Code downloaded!', 'success');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <ModalHeader>
        <h2 className="text-xl font-semibold text-text-primary">QR Code</h2>
      </ModalHeader>
      <ModalBody className="flex flex-col items-center py-6">
        {qrDataUrl ? (
          <>
            <div className="bg-white p-4 rounded-lg shadow-md mb-4">
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-[200px] h-[200px]"
              />
            </div>
            <p className="text-sm text-text-secondary text-center mb-4">
              Scan this QR code to open the invitation
            </p>
            <div className="flex gap-3">
              <AppButton variant="outline" onClick={onClose}>
                Close
              </AppButton>
              <AppButton variant="primary" onClick={handleDownload}>
                Download
              </AppButton>
            </div>
          </>
        ) : (
          <div className="animate-pulse w-[200px] h-[200px] bg-neutral-200 rounded-lg" />
        )}
      </ModalBody>
    </Modal>
  );
};

export default ShareButtons;
