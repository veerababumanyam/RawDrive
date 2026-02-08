/**
 * Guestbook Component
 * A digital guestbook for gallery visitors to leave congratulatory messages.
 *
 * Features:
 * - Public message posting for visitors
 * - Heart/reaction support for messages
 * - Moderated messages (photographer approval)
 * - Beautiful animated message display
 * - Real-time message updates
 * - Mobile-friendly message composition
 *
 * @module gallery/Guestbook
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageCircle,
  Heart,
  Send,
  User,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle,
  PenLine,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';

// ============================================================================
// Types
// ============================================================================

export interface GuestbookMessage {
  id: string;
  author_name: string;
  author_email?: string;
  message: string;
  hearts: number;
  created_at: string;
  is_approved: boolean;
  avatar_url?: string;
}

export interface GuestbookProps {
  /** Gallery ID */
  galleryId: string;
  /** Whether guestbook is enabled */
  enabled?: boolean;
  /** Existing messages */
  messages?: GuestbookMessage[];
  /** Whether the current user has hearted a message */
  heartedMessageIds?: Set<string>;
  /** Callback when a new message is submitted */
  onSubmitMessage?: (data: { name: string; email?: string; message: string }) => Promise<void>;
  /** Callback when a message is hearted */
  onHeartMessage?: (messageId: string) => Promise<void>;
  /** Whether messages require approval */
  requiresApproval?: boolean;
  /** Max message length */
  maxMessageLength?: number;
  /** Custom class name */
  className?: string;
  /** Display variant */
  variant?: 'full' | 'compact' | 'sidebar';
  /** Gallery title for context */
  galleryTitle?: string;
}

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Message card component
 */
const MessageCard: React.FC<{
  message: GuestbookMessage;
  isHearted: boolean;
  onHeart: () => void;
  variant: 'full' | 'compact' | 'sidebar';
}> = ({ message, isHearted, onHeart, variant }) => {
  const formattedDate = new Date(message.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`
        bg-surface rounded-2xl border border-border p-5
        ${variant === 'sidebar' ? 'p-4' : 'p-5'}
      `}
    >
      {/* Author info */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        {message.avatar_url ? (
          <img
            src={message.avatar_url}
            alt={message.author_name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <User className="w-5 h-5 text-primary-500" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-text-primary truncate">
            {message.author_name}
          </h4>
          <p className="text-xs text-text-tertiary">{formattedDate}</p>
        </div>
      </div>

      {/* Message */}
      <p className={`
        text-text-secondary leading-relaxed
        ${variant === 'sidebar' ? 'text-sm' : 'text-base'}
      `}>
        {message.message}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
        <button
          onClick={onHeart}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-sm
            ${isHearted
              ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400'
              : 'hover:bg-surface-hover text-text-secondary'
            }
          `}
          aria-label={isHearted ? 'Remove heart' : 'Heart this message'}
        >
          <Heart
            className={`w-4 h-4 ${isHearted ? 'fill-current' : ''}`}
          />
          <span>{message.hearts || ''}</span>
        </button>
      </div>
    </motion.div>
  );
};

/**
 * Message composition form
 */
const MessageForm: React.FC<{
  onSubmit: (data: { name: string; email?: string; message: string }) => Promise<void>;
  maxLength: number;
  requiresApproval: boolean;
  onCancel?: () => void;
}> = ({ onSubmit, maxLength, requiresApproval, onCancel }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !message.trim()) return;

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim() || undefined,
        message: message.trim(),
      });
      setSubmitStatus('success');
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = maxLength - message.length;
  const isOverLimit = remainingChars < 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name input */}
      <div>
        <label htmlFor="guestbook-name" className="block text-sm font-medium text-text-secondary mb-1.5">
          Your Name *
        </label>
        <input
          id="guestbook-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          required
          disabled={isSubmitting}
          className="w-full px-4 py-2.5 bg-surface-secondary rounded-xl border border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {/* Email input (optional) */}
      <div>
        <label htmlFor="guestbook-email" className="block text-sm font-medium text-text-secondary mb-1.5">
          Email <span className="text-text-tertiary">(optional)</span>
        </label>
        <input
          id="guestbook-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          disabled={isSubmitting}
          className="w-full px-4 py-2.5 bg-surface-secondary rounded-xl border border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-text-primary placeholder:text-text-tertiary"
        />
      </div>

      {/* Message textarea */}
      <div>
        <label htmlFor="guestbook-message" className="block text-sm font-medium text-text-secondary mb-1.5">
          Your Message *
        </label>
        <textarea
          ref={textareaRef}
          id="guestbook-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your congratulations or wishes..."
          required
          disabled={isSubmitting}
          rows={4}
          className="w-full px-4 py-3 bg-surface-secondary rounded-xl border border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all text-text-primary placeholder:text-text-tertiary resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-xs text-text-tertiary">
            {requiresApproval && 'Messages are reviewed before appearing.'}
          </p>
          <span className={`text-xs ${isOverLimit ? 'text-error' : 'text-text-tertiary'}`}>
            {remainingChars} characters remaining
          </span>
        </div>
      </div>

      {/* Submit status messages */}
      <AnimatePresence>
        {submitStatus === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-success bg-success/10 rounded-lg p-3"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="text-sm">
              {requiresApproval
                ? 'Your message has been submitted for approval!'
                : 'Your message has been posted!'}
            </span>
          </motion.div>
        )}

        {submitStatus === 'error' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 text-error bg-error/10 rounded-lg p-3"
          >
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">Failed to submit message. Please try again.</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <AppButton
          type="submit"
          variant="primary"
          disabled={isSubmitting || isOverLimit || !name.trim() || !message.trim()}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send Message
            </>
          )}
        </AppButton>

        {onCancel && (
          <AppButton type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </AppButton>
        )}
      </div>
    </form>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const Guestbook: React.FC<GuestbookProps> = ({
  galleryId,
  enabled = true,
  messages = [],
  heartedMessageIds = new Set(),
  onSubmitMessage,
  onHeartMessage,
  requiresApproval = true,
  maxMessageLength = 500,
  className = '',
  variant = 'full',
  galleryTitle,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [localHeartedIds, setLocalHeartedIds] = useState(heartedMessageIds);

  // Handle heart action
  const handleHeart = useCallback(
    async (messageId: string) => {
      const wasHearted = localHeartedIds.has(messageId);

      // Optimistic update
      setLocalHeartedIds((prev) => {
        const next = new Set(prev);
        if (wasHearted) {
          next.delete(messageId);
        } else {
          next.add(messageId);
        }
        return next;
      });

      // Call API
      try {
        await onHeartMessage?.(messageId);
      } catch {
        // Revert on error
        setLocalHeartedIds((prev) => {
          const next = new Set(prev);
          if (wasHearted) {
            next.add(messageId);
          } else {
            next.delete(messageId);
          }
          return next;
        });
      }
    },
    [localHeartedIds, onHeartMessage]
  );

  // Handle message submission
  const handleSubmit = useCallback(
    async (data: { name: string; email?: string; message: string }) => {
      await onSubmitMessage?.(data);
      setShowForm(false);
    },
    [onSubmitMessage]
  );

  if (!enabled) return null;

  // Compact variant for sidebar display
  if (variant === 'sidebar') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary-500" />
            Guestbook
          </h3>
          <span className="text-sm text-text-tertiary">{messages.length}</span>
        </div>

        {/* Messages list */}
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {messages.slice(0, 5).map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isHearted={localHeartedIds.has(message.id)}
              onHeart={() => handleHeart(message.id)}
              variant="sidebar"
            />
          ))}

          {messages.length === 0 && (
            <p className="text-center text-text-tertiary py-8 text-sm">
              No messages yet. Be the first!
            </p>
          )}
        </div>

        {/* Add message button */}
        <AppButton
          variant="outline"
          onClick={() => setShowForm(true)}
          className="w-full"
        >
          <PenLine className="w-4 h-4" />
          Leave a Message
        </AppButton>

        {/* Form modal for sidebar */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-primary">Leave a Message</h3>
                  <button
                    onClick={() => setShowForm(false)}
                    className="p-1 hover:bg-surface-hover rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-text-secondary" />
                  </button>
                </div>

                <MessageForm
                  onSubmit={handleSubmit}
                  maxLength={maxMessageLength}
                  requiresApproval={requiresApproval}
                  onCancel={() => setShowForm(false)}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-pink-500 to-rose-500 rounded-2xl mb-4">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Leave Your Wishes
        </h2>
        <p className="text-text-secondary">
          {galleryTitle
            ? `Share your congratulations for ${galleryTitle}`
            : 'Share your congratulations and wishes'}
        </p>
      </div>

      {/* Message form */}
      {!showForm ? (
        <div className="text-center mb-10">
          <AppButton variant="primary" size="lg" onClick={() => setShowForm(true)}>
            <PenLine className="w-5 h-5" />
            Write a Message
          </AppButton>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface rounded-2xl border border-border p-6 mb-10"
        >
          <MessageForm
            onSubmit={handleSubmit}
            maxLength={maxMessageLength}
            requiresApproval={requiresApproval}
            onCancel={() => setShowForm(false)}
          />
        </motion.div>
      )}

      {/* Messages list */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Messages
          <span className="text-sm font-normal text-text-tertiary">({messages.length})</span>
        </h3>

        <div className="grid gap-4 md:grid-cols-2">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              isHearted={localHeartedIds.has(message.id)}
              onHeart={() => handleHeart(message.id)}
              variant="full"
            />
          ))}
        </div>

        {messages.length === 0 && (
          <div className="text-center py-12 bg-surface-secondary rounded-2xl">
            <MessageCircle className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
            <p className="text-text-secondary">No messages yet.</p>
            <p className="text-text-tertiary text-sm">Be the first to leave your wishes!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Guestbook;
