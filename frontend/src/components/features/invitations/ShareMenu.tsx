/**
 * ShareMenu: Social sharing component for invitations
 *
 * Features:
 * - WhatsApp share with prefilled message
 * - Copy link functionality
 * - Facebook, Twitter, Email sharing
 * - Native Web Share API support
 *
 * Feature: 016-save-the-date
 * Tasks: T081-T084
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Share2,
  Link,
  Check,
  X,
  Mail,
  MessageCircle,
  Facebook,
  Twitter,
  ChevronDown,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShareMenuProps {
  /** Public URL to share */
  url: string;
  /** Title of the invitation */
  title: string;
  /** Event date for share message */
  eventDate?: string;
  /** Host names for share message */
  hostNames?: string[];
  /** Optional description */
  description?: string;
  /** Venue name */
  venueName?: string;
  /** Show as dropdown or inline buttons */
  variant?: 'dropdown' | 'inline' | 'buttons';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Optional className */
  className?: string;
  /** Callback when shared */
  onShare?: (platform: string) => void;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Build WhatsApp share message with event details
 */
function buildWhatsAppMessage(
  title: string,
  url: string,
  eventDate?: string,
  hostNames?: string[],
  venueName?: string
): string {
  const lines: string[] = [];

  // Event title with emoji based on common event types
  const isWedding = title.toLowerCase().includes('wedding');
  const isBirthday = title.toLowerCase().includes('birthday');
  const emoji = isWedding ? '💒' : isBirthday ? '🎂' : '✨';

  lines.push(`${emoji} *${title}*`);
  lines.push('');
  lines.push("You're invited! 🎉");

  if (eventDate) {
    lines.push(`📅 ${eventDate}`);
  }

  if (venueName) {
    lines.push(`📍 ${venueName}`);
  }

  if (hostNames && hostNames.length > 0) {
    lines.push(`👥 Hosted by: ${hostNames.join(' & ')}`);
  }

  lines.push('');
  lines.push('View invitation & RSVP:');
  lines.push(url);

  return lines.join('\n');
}

/**
 * Check if Web Share API is available
 */
function canUseNativeShare(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.share;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ShareMenu: React.FC<ShareMenuProps> = ({
  url,
  title,
  eventDate,
  hostNames,
  description,
  venueName,
  variant = 'dropdown',
  size = 'md',
  className = '',
  onShare,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Copy link to clipboard
  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onShare?.('copy');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      onShare?.('copy');
      setTimeout(() => setCopied(false), 2000);
    }
  }, [url, onShare]);

  // WhatsApp share
  const handleWhatsAppShare = useCallback(() => {
    const message = buildWhatsAppMessage(title, url, eventDate, hostNames, venueName);
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onShare?.('whatsapp');
    setIsOpen(false);
  }, [title, url, eventDate, hostNames, venueName, onShare]);

  // Facebook share
  const handleFacebookShare = useCallback(() => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
    onShare?.('facebook');
    setIsOpen(false);
  }, [url, onShare]);

  // Twitter/X share
  const handleTwitterShare = useCallback(() => {
    const text = `You're invited to ${title}! 🎉`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'noopener,noreferrer,width=600,height=400');
    onShare?.('twitter');
    setIsOpen(false);
  }, [title, url, onShare]);

  // Email share
  const handleEmailShare = useCallback(() => {
    const subject = `You're Invited: ${title}`;
    const body = [
      `You're invited to ${title}!`,
      '',
      eventDate && `Date: ${eventDate}`,
      venueName && `Venue: ${venueName}`,
      hostNames && hostNames.length > 0 && `Hosted by: ${hostNames.join(' & ')}`,
      '',
      description,
      '',
      'View invitation and RSVP:',
      url,
    ]
      .filter(Boolean)
      .join('\n');

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    onShare?.('email');
    setIsOpen(false);
  }, [title, url, eventDate, venueName, hostNames, description, onShare]);

  // Native share (mobile)
  const handleNativeShare = useCallback(async () => {
    try {
      await navigator.share({
        title: title,
        text: description || `You're invited to ${title}!`,
        url: url,
      });
      onShare?.('native');
    } catch (err) {
      // User cancelled or error - ignore
    }
    setIsOpen(false);
  }, [title, description, url, onShare]);

  // Share options
  const shareOptions = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      onClick: handleWhatsAppShare,
      color: '#25D366',
    },
    {
      id: 'copy',
      label: copied ? 'Copied!' : 'Copy Link',
      icon: copied ? Check : Link,
      onClick: handleCopyLink,
      color: copied ? '#10B981' : '#6B7280',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      icon: Facebook,
      onClick: handleFacebookShare,
      color: '#1877F2',
    },
    {
      id: 'twitter',
      label: 'Twitter/X',
      icon: Twitter,
      onClick: handleTwitterShare,
      color: '#000000',
    },
    {
      id: 'email',
      label: 'Email',
      icon: Mail,
      onClick: handleEmailShare,
      color: '#EA4335',
    },
  ];

  // Size classes
  const sizeClasses = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-5 py-2.5',
  };

  // Render inline buttons variant
  if (variant === 'buttons') {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {shareOptions.map((option) => (
          <AppButton
            key={option.id}
            variant="outline"
            size={size === 'sm' ? 'sm' : 'default'}
            onClick={option.onClick}
            className="flex items-center gap-2"
          >
            <option.icon className="w-4 h-4" style={{ color: option.color }} />
            {option.label}
          </AppButton>
        ))}
      </div>
    );
  }

  // Render inline icons variant
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {shareOptions.map((option) => (
          <button
            key={option.id}
            onClick={option.onClick}
            className="p-2 rounded-full hover:bg-surface-hover transition-colors"
            title={option.label}
            aria-label={`Share via ${option.label}`}
          >
            <option.icon className="w-5 h-5" style={{ color: option.color }} />
          </button>
        ))}
      </div>
    );
  }

  // Render dropdown variant (default)
  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <AppButton
        variant="outline"
        onClick={() => {
          if (canUseNativeShare()) {
            handleNativeShare();
          } else {
            setIsOpen(!isOpen);
          }
        }}
        className={sizeClasses[size]}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={!canUseNativeShare() ? 'share-menu-dropdown' : undefined}
      >
        <Share2 className="w-4 h-4 mr-2" aria-hidden="true" />
        Share
        {!canUseNativeShare() && (
          <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        )}
      </AppButton>

      {/* Dropdown Menu */}
      {isOpen && (
        <AppCard
          id="share-menu-dropdown"
          role="menu"
          aria-label="Share options"
          className="absolute right-0 mt-2 w-48 py-1 z-50 shadow-lg animate-fade-in-down"
        >
          {shareOptions.map((option) => (
            <button
              key={option.id}
              onClick={option.onClick}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2 text-left text-text-primary hover:bg-surface-hover transition-colors focus-visible:bg-surface-hover focus-visible:outline-none"
            >
              <option.icon className="w-4 h-4" style={{ color: option.color }} aria-hidden="true" />
              <span className="text-sm">{option.label}</span>
            </button>
          ))}
        </AppCard>
      )}
    </div>
  );
};

ShareMenu.displayName = 'ShareMenu';

export default ShareMenu;
