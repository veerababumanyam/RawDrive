/**
 * PinSettings Component
 * Settings for gallery PIN protection (secondary access control)
 *
 * Receives credential state from parent via props to avoid duplicate API calls.
 * Uses the shared useGalleryCredentials hook's state from AccessSettings.
 *
 * Feature: 007-fix-gallery-pin-password
 */

import React, { useState, useRef, useCallback } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';
import type { UseGalleryCredentialsResult } from '../../../hooks/useGalleryCredentials';

export interface PinSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
  /** Shared credentials state from parent AccessSettings component */
  credentials: UseGalleryCredentialsResult;
}

export const PinSettings: React.FC<PinSettingsProps> = ({ gallery, onUpdate, credentials }) => {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isPinEnabled, setIsPinEnabled] = useState(gallery.pin_protected || false);

  // Track the last PIN value sent to parent to avoid duplicate updates
  const lastSentPinRef = useRef<string | null>(null);

  const handlePinToggle = (enabled: boolean) => {
    setIsPinEnabled(enabled);
    if (!enabled) {
      onUpdate({ remove_pin: true });
      setPin('');
      lastSentPinRef.current = null;
      // Reset credential display state via shared hook
      credentials.resetCredentials('pin');
      setShowPin(false);
    }
  };

  const handlePinChange = useCallback((value: string) => {
    // Only allow numeric values for PIN
    const numericValue = value.replace(/\D/g, '');
    setPin(numericValue);

    // Clear revealed PIN when user starts typing new value
    if (credentials.revealedPin && numericValue !== credentials.revealedPin) {
      credentials.clearRevealed('pin');
      setShowPin(false);
    }

    // Only send update if PIN is valid (4-6 digits) and different from last sent
    if (numericValue.length >= 4 && numericValue !== lastSentPinRef.current) {
      lastSentPinRef.current = numericValue;
      onUpdate({ pin: numericValue });
    }
  }, [onUpdate, credentials]);

  // Determine if current PIN input is invalid (has content but too short)
  const isPinInvalid = pin.length > 0 && pin.length < 4;

  const handlePinRevealToggle = async () => {
    if (!showPin && credentials.hasPin && credentials.pinRecoverable && !credentials.revealedPin) {
      // Fetch fresh credentials when revealing for the first time
      await credentials.revealCredentials();
    }
    setShowPin(!showPin);
  };

  return (
    <AppCard padding="md">
      <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Key size={20} />
        PIN Protection
      </h3>
      <div className="space-y-4">
        <Toggle
          label="Require PIN to view gallery"
          checked={isPinEnabled}
          onChange={(e) => handlePinToggle(e.target.checked)}
          description="Visitors must enter a PIN code to access the entire gallery. This applies to all photos and sub-galleries."
        />
        {isPinEnabled && (
          <div className="space-y-3">
            <div className="relative">
              {/* Hidden fields to trick password managers */}
              <input type="text" name="prevent_autofill_pin" value="" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} readOnly />
              <input type="password" name="pin_fake" value="" autoComplete="new-password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} readOnly />
              <AppInput
                type={showPin ? 'text' : 'password'}
                name="gallery_pin_code"
                label="Gallery PIN"
                value={showPin && credentials.revealedPin && !pin ? credentials.revealedPin : pin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder={credentials.isLoading ? "Loading..." : (credentials.hasPin ? "****" : "Enter 4-6 digit PIN")}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="new-password"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                disabled={credentials.isLoading}
                error={isPinInvalid ? "PIN must be at least 4 digits" : undefined}
                helperText={!isPinInvalid ? (
                  credentials.hasPin && !credentials.pinRecoverable
                    ? "PIN is set (legacy - original value cannot be revealed). Enter a new PIN to replace it."
                    : credentials.hasPin
                    ? "PIN is set. Click the eye icon to reveal, or enter a new PIN to change it."
                    : "Set any 4-6 digit PIN. This is a simple access code for gallery visitors."
                ) : undefined}
              />
              <button
                type="button"
                onClick={handlePinRevealToggle}
                className="absolute right-3 top-[38px] text-text-tertiary hover:text-text-secondary disabled:opacity-50"
                aria-label={showPin ? "Hide PIN" : "Show PIN"}
                disabled={(credentials.hasPin && !credentials.pinRecoverable && !pin) || credentials.isRevealing}
                title={credentials.hasPin && !credentials.pinRecoverable && !pin ? "Original PIN cannot be revealed (legacy)" : undefined}
              >
                {credentials.isRevealing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-text-tertiary border-t-transparent" />
                ) : showPin ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppCard>
  );
};
