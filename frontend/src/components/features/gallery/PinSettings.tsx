/**
 * PinSettings Component
 * Settings for gallery PIN protection (secondary access control)
 *
 * Receives credential state from parent via props to avoid duplicate API calls.
 * Uses the shared useGalleryCredentials hook's state from AccessSettings.
 *
 * Feature: 007-fix-gallery-pin-password
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  
  // Sync state with gallery prop when it changes (e.g., after successful save)
  useEffect(() => {
    setIsPinEnabled(gallery.pin_protected || false);
    // Clear PIN input when PIN is disabled
    if (!gallery.pin_protected) {
      setPin('');
      lastSentPinRef.current = null;
    }
  }, [gallery.pin_protected]);

  const handlePinToggle = (enabled: boolean) => {
    setIsPinEnabled(enabled);
    if (!enabled) {
      // Disable PIN protection
      onUpdate({ remove_pin: true });
      setPin('');
      lastSentPinRef.current = null;
      // Reset credential display state via shared hook
      credentials.resetCredentials('pin');
      setShowPin(false);
    } else {
      // Enable PIN protection
      // If PIN already exists in backend, the toggle state will sync via useEffect
      // If no PIN exists, user must enter one - input field will appear and they can set it
      // Don't send update here - only send when PIN is actually set or removed
      // The backend determines pin_protected based on pin_hash existence
    }
  };

  const handlePinChange = useCallback((value: string) => {
    // Remove any masked asterisks and non-numeric characters
    const cleanedValue = value.replace(/\*/g, '').replace(/\D/g, '');
    setPin(cleanedValue);

    // Clear revealed PIN when user starts typing new value (and it's different from revealed)
    if (credentials.revealedPin && cleanedValue && cleanedValue !== credentials.revealedPin) {
      credentials.clearRevealed('pin');
      setShowPin(false);
    }
    
    // If user deletes all characters, clear the last sent ref so they can set a new PIN
    if (!cleanedValue) {
      lastSentPinRef.current = null;
      // If PIN was previously set and user clears field, they're replacing it - don't send remove yet
      // Wait for them to either set a new PIN or disable the toggle
      return;
    }

    // Only send update if PIN is valid (4-6 digits) and different from last sent
    if (cleanedValue.length >= 4 && cleanedValue !== lastSentPinRef.current) {
      lastSentPinRef.current = cleanedValue;
      onUpdate({ pin: cleanedValue });
    }
  }, [onUpdate, credentials]);

  // Determine if current PIN input is invalid (has content but too short)
  const isPinInvalid = pin.length > 0 && pin.length < 4;

  const handlePinRevealToggle = async () => {
    if (!showPin && credentials.hasPin && credentials.pinRecoverable && !credentials.revealedPin) {
      // Fetch fresh credentials when revealing for the first time
      await credentials.revealCredentials();
    }
    // Toggle reveal state
    setShowPin(!showPin);
    // If hiding, clear any local PIN value to show masked value again
    if (showPin && !pin) {
      // User is hiding the PIN - keep it cleared so masked value shows
      setPin('');
    }
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
              {/* Prevent Google Password Manager and other password managers from detecting this field */}
              <input
                type="text"
                name="username"
                id="username_fake_pin"
                autoComplete="username"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                value=""
              />
              <input
                type="password"
                name="password"
                id="password_fake_pin"
                autoComplete="current-password"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                value=""
              />
              <AppInput
                type={showPin ? 'text' : 'password'}
                name="gallery_pin_code"
                id="gallery_pin_code_input"
                label="Gallery PIN"
                value={
                  // Priority 1: Show revealed PIN if user clicked eye icon and PIN exists
                  showPin && credentials.revealedPin && !pin
                    ? credentials.revealedPin
                    // Priority 2: Show what user is typing if they're editing
                    : pin
                      ? pin
                      // Priority 3: Show masked value if PIN exists but isn't revealed and user hasn't typed
                      // Use asterisks that will display as masked dots in password type field (browser masks any value)
                      : credentials.hasPin && !pin && !showPin
                        ? '****' // 4 asterisks that display as masked dots in password type field
                        // Priority 4: Empty field if no PIN exists
                        : ''
                }
                onChange={(e) => {
                  // Handle user input
                  const inputValue = e.target.value;
                  // If masked value is shown and user types, clear it and process their input
                  if (credentials.hasPin && !pin && !showPin && inputValue && inputValue !== '****') {
                    // User is typing - remove masked asterisks and process
                    const cleanedValue = inputValue.replace(/\*/g, '');
                    handlePinChange(cleanedValue);
                  } else {
                    // Normal input processing
                    handlePinChange(inputValue);
                  }
                }}
                onKeyDown={(e) => {
                  // When user presses any key (except navigation keys), if masked value is shown, clear it first
                  if (credentials.hasPin && !pin && !showPin && 
                      e.key !== 'Escape' && e.key !== 'Tab' && 
                      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key) &&
                      !e.ctrlKey && !e.metaKey) {
                    // User is starting to type - clear the masked value first
                    setPin('');
                    lastSentPinRef.current = null;
                  }
                }}
                placeholder={
                  credentials.isLoading 
                    ? "Loading..." 
                    : credentials.hasPin && !pin && !showPin
                      ? "" // Empty placeholder when showing masked value
                      : "Enter 4-6 digit PIN"
                }
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-non-login-password="true"
                data-gallery-pin="true"
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
