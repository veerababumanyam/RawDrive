/**
 * useGalleryCredentials Hook
 *
 * Fetches and manages gallery credentials (password/PIN) state.
 * Centralizes credential fetching to avoid duplicate API calls when
 * both AccessSettings and PinSettings need credential status.
 *
 * Feature: 007-fix-gallery-pin-password
 */

import { useState, useEffect, useCallback } from 'react';
import { galleryService } from '../services/galleryService';
import { useToast } from '../components/ui/Toast';
import type { GalleryCredentialsResponse } from '../types/gallery';

export interface UseGalleryCredentialsOptions {
  /** Workspace ID */
  workspaceId: string | undefined;
  /** Gallery ID */
  galleryId: string;
  /** Fallback values from gallery data */
  fallback?: {
    passwordProtected?: boolean;
    pinProtected?: boolean;
  };
}

export interface UseGalleryCredentialsResult {
  /** Whether credentials are being loaded */
  isLoading: boolean;
  /** Whether a reveal operation is in progress */
  isRevealing: boolean;
  /** Whether password is set (hash exists) */
  hasPassword: boolean;
  /** Whether PIN is set (hash exists) */
  hasPin: boolean;
  /** Whether password can be revealed (encrypted version exists) */
  passwordRecoverable: boolean;
  /** Whether PIN can be revealed (encrypted version exists) */
  pinRecoverable: boolean;
  /** Revealed password value (null if not revealed or not recoverable) */
  revealedPassword: string | null;
  /** Revealed PIN value (null if not revealed or not recoverable) */
  revealedPin: string | null;
  /** Fetch and reveal credentials */
  revealCredentials: () => Promise<GalleryCredentialsResponse | null>;
  /** Reset credential state (call when credentials are removed) */
  resetCredentials: (type: 'password' | 'pin' | 'both') => void;
  /** Clear revealed values (call when user starts typing new value) */
  clearRevealed: (type: 'password' | 'pin') => void;
}

/**
 * Hook for managing gallery credentials state
 */
export function useGalleryCredentials({
  workspaceId,
  galleryId,
  fallback,
}: UseGalleryCredentialsOptions): UseGalleryCredentialsResult {
  const { addToast } = useToast();

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  // Credential status
  const [hasPassword, setHasPassword] = useState(fallback?.passwordProtected ?? false);
  const [hasPin, setHasPin] = useState(fallback?.pinProtected ?? false);
  const [passwordRecoverable, setPasswordRecoverable] = useState(false);
  const [pinRecoverable, setPinRecoverable] = useState(false);

  // Revealed values
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealedPin, setRevealedPin] = useState<string | null>(null);

  // Fetch initial credential status on mount and when gallery changes
  useEffect(() => {
    const fetchCredentials = async () => {
      if (!workspaceId || !galleryId) {
        // If no workspace/gallery, use fallback values
        setHasPassword(fallback?.passwordProtected ?? false);
        setHasPin(fallback?.pinProtected ?? false);
        return;
      }

      setIsLoading(true);
      try {
        const credentials = await galleryService.getGalleryCredentials(
          workspaceId,
          galleryId
        );
        // Always update from API response (source of truth)
        setHasPassword(credentials.has_password);
        setHasPin(credentials.has_pin);
        setPasswordRecoverable(credentials.password_recoverable);
        setPinRecoverable(credentials.pin_recoverable);
        // Store revealed values if they were returned
        if (credentials.password) {
          setRevealedPassword(credentials.password);
        }
        if (credentials.pin) {
          setRevealedPin(credentials.pin);
        }
      } catch (error) {
        // Fallback to gallery data on error - no toast needed for initial load
        setHasPassword(fallback?.passwordProtected ?? false);
        setHasPin(fallback?.pinProtected ?? false);
        setPasswordRecoverable(false);
        setPinRecoverable(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCredentials();
  }, [workspaceId, galleryId, fallback?.passwordProtected, fallback?.pinProtected]);

  /**
   * Fetch and reveal credentials (called when user clicks eye icon)
   */
  const revealCredentials = useCallback(async (): Promise<GalleryCredentialsResponse | null> => {
    if (!workspaceId || !galleryId) return null;

    setIsRevealing(true);
    try {
      const credentials = await galleryService.getGalleryCredentials(
        workspaceId,
        galleryId
      );

      // Update all state from fresh data
      setHasPassword(credentials.has_password);
      setHasPin(credentials.has_pin);
      setPasswordRecoverable(credentials.password_recoverable);
      setPinRecoverable(credentials.pin_recoverable);
      setRevealedPassword(credentials.password);
      setRevealedPin(credentials.pin);

      return credentials;
    } catch (error) {
      addToast({
        variant: 'error',
        title: 'Failed to reveal credentials',
        message: 'Unable to retrieve gallery credentials. Please try again.',
      });
      return null;
    } finally {
      setIsRevealing(false);
    }
  }, [workspaceId, galleryId, addToast]);

  /**
   * Reset credential state (called when credentials are removed)
   */
  const resetCredentials = useCallback((type: 'password' | 'pin' | 'both') => {
    if (type === 'password' || type === 'both') {
      setHasPassword(false);
      setPasswordRecoverable(false);
      setRevealedPassword(null);
    }
    if (type === 'pin' || type === 'both') {
      setHasPin(false);
      setPinRecoverable(false);
      setRevealedPin(null);
    }
  }, []);

  /**
   * Clear revealed value (called when user starts typing new value)
   */
  const clearRevealed = useCallback((type: 'password' | 'pin') => {
    if (type === 'password') {
      setRevealedPassword(null);
    } else {
      setRevealedPin(null);
    }
  }, []);

  return {
    isLoading,
    isRevealing,
    hasPassword,
    hasPin,
    passwordRecoverable,
    pinRecoverable,
    revealedPassword,
    revealedPin,
    revealCredentials,
    resetCredentials,
    clearRevealed,
  };
}
