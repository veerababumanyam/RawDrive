/**
 * ShareMenu - Social sharing dropdown component
 *
 * Provides sharing options for galleries via social platforms and clipboard.
 * Includes: Copy Link, WhatsApp, Facebook, Twitter/X, Email
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Share2, Mail, Check } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

// Constants for UX timing
const LINK_COPIED_FEEDBACK_MS = 2000;

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
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close menu on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

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

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <AppButton
        variant="outline"
        leftIcon={<Share2 size={16} />}
        size={buttonSize}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Share gallery"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="hidden sm:inline">Share</span>
      </AppButton>

      {/* Share Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 py-2 z-50 animate-fade-in"
          role="menu"
          aria-orientation="vertical"
        >
          {/* Copy Link */}
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleCopyLink}
            role="menuitem"
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

          <hr className="my-2 border-gray-200 dark:border-gray-700" />

          {/* WhatsApp */}
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleFacebookShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="#1877F2"
            >
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Facebook
          </button>

          {/* Twitter/X */}
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleTwitterShare}
            role="menuitem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            X (Twitter)
          </button>

          {/* Email */}
          <button
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleEmailShare}
            role="menuitem"
          >
            <Mail size={18} className="text-gray-600 dark:text-gray-400" />
            Email
          </button>
        </div>
      )}
    </div>
  );
};

export default ShareMenu;
