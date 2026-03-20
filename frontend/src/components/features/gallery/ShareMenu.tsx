/**
 * ShareMenu - Social sharing dropdown component
 *
 * Provides sharing options for galleries via social platforms and clipboard.
 * Includes: Copy Link, QR Code, WhatsApp, Facebook, Twitter/X, Email
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Share2, Mail, Check, X, QrCode, Download, Code } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { AppButton } from '../../ui/AppButton';
import { EmbedCodeModal } from './sharing/EmbedCodeModal';

// Constants for UX timing
const LINK_COPIED_FEEDBACK_MS = 2000;
const QR_CODE_SIZE = 200;

interface ShareMenuProps {
  /** The URL to share */
  shareUrl: string;
  /** Title for social sharing */
  title?: string;
  /** Description for social sharing */
  description?: string;
  /** Size variant for the trigger button */
  buttonSize?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes for the container */
  className?: string;
}

export const ShareMenu: React.FC<ShareMenuProps> = ({
  shareUrl,
  title = 'Photo Gallery',
  description,
  buttonSize = 'sm',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [focusedMenuIndex, setFocusedMenuIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const qrCloseRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        triggerRef.current?.focus(); // WCAG 2.4.3: Restore focus
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close menu on Escape key and restore focus (WCAG 2.1.1, 2.4.3)
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // Focus first menu item when menu opens (WCAG 2.4.3)
  useEffect(() => {
    if (isOpen) {
      setFocusedMenuIndex(0);
      // Small delay to ensure DOM is updated
      requestAnimationFrame(() => {
        menuItemsRef.current[0]?.focus();
      });
    }
  }, [isOpen]);

  // Focus close button when QR modal opens (WCAG 2.4.3)
  useEffect(() => {
    if (showQRModal) {
      requestAnimationFrame(() => {
        qrCloseRef.current?.focus();
      });
    }
  }, [showQRModal]);

  // Keyboard navigation for menu items (WCAG 2.1.1)
  const handleMenuKeyDown = useCallback((e: React.KeyboardEvent) => {
    const items = menuItemsRef.current.filter(Boolean);
    const itemCount = items.length;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedMenuIndex((prev) => {
          const next = (prev + 1) % itemCount;
          items[next]?.focus();
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedMenuIndex((prev) => {
          const next = (prev - 1 + itemCount) % itemCount;
          items[next]?.focus();
          return next;
        });
        break;
      case 'Home':
        e.preventDefault();
        setFocusedMenuIndex(0);
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        setFocusedMenuIndex(itemCount - 1);
        items[itemCount - 1]?.focus();
        break;
    }
  }, []);

  // Handle QR modal close with focus restoration
  const handleCloseQRModal = useCallback(() => {
    setShowQRModal(false);
    triggerRef.current?.focus();
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), LINK_COPIED_FEEDBACK_MS);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [shareUrl]);

  const handleWhatsAppShare = useCallback(() => {
    const text = `${title}${description ? ' - ' + description : ''}\n\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    setIsOpen(false);
  }, [shareUrl, title, description]);

  const handleFacebookShare = useCallback(() => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=600,height=400'
    );
    setIsOpen(false);
  }, [shareUrl]);

  const handleTwitterShare = useCallback(() => {
    const text = `${title}${description ? ' - ' + description : ''}`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`,
      '_blank',
      'width=600,height=400'
    );
    setIsOpen(false);
  }, [shareUrl, title, description]);

  const handleEmailShare = useCallback(() => {
    const subject = title;
    const body = `${description || 'Check out this photo gallery!'}\n\nView gallery: ${shareUrl}`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
    setIsOpen(false);
  }, [shareUrl, title, description]);

  const handlePinterestShare = useCallback(() => {
    // Pinterest share - great for photo galleries
    window.open(
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(shareUrl)}&description=${encodeURIComponent(title)}`,
      '_blank',
      'width=600,height=400'
    );
    setIsOpen(false);
  }, [shareUrl, title]);

  const handleTelegramShare = useCallback(() => {
    const text = `${title}${description ? ' - ' + description : ''}`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`,
      '_blank'
    );
    setIsOpen(false);
  }, [shareUrl, title, description]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: description || 'Check out this photo gallery!',
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or share failed - ignore
        console.log('Native share cancelled or failed');
      }
    }
    setIsOpen(false);
  }, [shareUrl, title, description]);

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  const handleShowQRCode = useCallback(() => {
    setIsOpen(false);
    setShowQRModal(true);
  }, []);

  const handleShowEmbedCode = useCallback(() => {
    setIsOpen(false);
    setShowEmbedModal(true);
  }, []);

  const handleDownloadQRCode = useCallback(() => {
    if (!qrRef.current) return;

    const svg = qrRef.current.querySelector('svg');
    if (!svg) return;

    // Create canvas from SVG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = QR_CODE_SIZE * 2; // Higher resolution
      canvas.height = QR_CODE_SIZE * 2;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Download
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    img.src = url;
  }, [title]);

  // Reset menu item refs when menu closes
  useEffect(() => {
    if (!isOpen) {
      menuItemsRef.current = [];
    }
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <AppButton
        ref={triggerRef}
        variant="outline"
        leftIcon={<Share2 size={16} />}
        size={buttonSize}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Share gallery"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? "share-menu" : undefined}
      >
        <span className="hidden sm:inline">Share</span>
      </AppButton>

      {/* Share Dropdown Menu */}
      {isOpen && (
        <div
          id="share-menu"
          className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 py-2 z-50 animate-fade-in"
          role="menu"
          aria-orientation="vertical"
          aria-label="Share options"
          onKeyDown={handleMenuKeyDown}
        >
          {/* Copy Link */}
          <button
            ref={(el) => { menuItemsRef.current[0] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleCopyLink}
            role="menuitem"
            aria-live="polite"
          >
            {linkCopied ? (
              <Check size={18} className="text-green-500" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
            )}
            {linkCopied ? 'Link Copied!' : 'Copy Link'}
          </button>

          {/* QR Code */}
          <button
            ref={(el) => { menuItemsRef.current[1] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleShowQRCode}
            role="menuitem"
          >
            <QrCode size={18} className="text-gray-600 dark:text-gray-400" />
            QR Code
          </button>

          {/* Embed Code */}
          <button
            ref={(el) => { menuItemsRef.current[2] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleShowEmbedCode}
            role="menuitem"
          >
            <Code size={18} className="text-gray-600 dark:text-gray-400" />
            Embed Code
          </button>

          <hr className="my-2 border-gray-200 dark:border-gray-700" aria-hidden="true" />

          {/* WhatsApp */}
          <button
            ref={(el) => { menuItemsRef.current[3] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleWhatsAppShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#25D366"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            WhatsApp
          </button>

          {/* Facebook */}
          <button
            ref={(el) => { menuItemsRef.current[4] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleFacebookShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#1877F2"
              aria-hidden="true"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook
          </button>

          {/* Twitter/X */}
          <button
            ref={(el) => { menuItemsRef.current[5] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleTwitterShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X (Twitter)
          </button>

          {/* Pinterest - great for photo sharing */}
          <button
            ref={(el) => { menuItemsRef.current[6] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handlePinterestShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#E60023"
              aria-hidden="true"
            >
              <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
            </svg>
            Pinterest
          </button>

          {/* Telegram */}
          <button
            ref={(el) => { menuItemsRef.current[7] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleTelegramShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#0088CC"
              aria-hidden="true"
            >
              <path d="m20.665 3.717-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701h-.002l.002.001-.314 4.692c.46 0 .663-.211.921-.46l2.211-2.15 4.599 3.397c.848.467 1.457.227 1.668-.785l3.019-14.228c.309-1.239-.473-1.8-1.282-1.434z" />
            </svg>
            Telegram
          </button>

          {/* Email */}
          <button
            ref={(el) => { menuItemsRef.current[8] = el; }}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
            onClick={handleEmailShare}
            role="menuitem"
          >
            <Mail size={18} className="text-gray-600 dark:text-gray-400" aria-hidden="true" />
            Email
          </button>

          {/* Native Share (mobile) */}
          {hasNativeShare && (
            <>
              <hr className="my-2 border-gray-200 dark:border-gray-700" aria-hidden="true" />
              <button
                ref={(el) => { menuItemsRef.current[9] = el; }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none"
                onClick={handleNativeShare}
                role="menuitem"
              >
                <Share2 size={18} className="text-gray-600 dark:text-gray-400" aria-hidden="true" />
                More Options...
              </button>
            </>
          )}
        </div>
      )}

      {/* Embed Code Modal */}
      <EmbedCodeModal
        galleryUrl={shareUrl}
        isOpen={showEmbedModal}
        onClose={() => {
          setShowEmbedModal(false);
          triggerRef.current?.focus();
        }}
      />

      {/* QR Code Modal */}
      {showQRModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4"
          onClick={handleCloseQRModal}
          onKeyDown={(e) => e.key === 'Escape' && handleCloseQRModal()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 id="qr-modal-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                Scan to View Gallery
              </h3>
              <button
                ref={qrCloseRef}
                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={handleCloseQRModal}
                aria-label="Close QR code dialog"
              >
                <X size={20} />
              </button>
            </div>

            {/* QR Code */}
            <div
              className="flex justify-center p-4 bg-white rounded-xl mb-4"
              ref={qrRef}
            >
              <QRCodeSVG
                value={shareUrl}
                size={QR_CODE_SIZE}
                level="H"
                includeMargin={false}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            {/* Title */}
            <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-4 truncate">
              {title}
            </p>

            {/* Download Button */}
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-sm transition-colors"
              onClick={handleDownloadQRCode}
            >
              <Download size={16} />
              Download QR Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareMenu;
