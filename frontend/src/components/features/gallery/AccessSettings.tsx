/**
 * AccessSettings Component
 * Settings for gallery access control
 *
 * Uses the shared useGalleryCredentials hook to avoid duplicate API calls
 * when both password and PIN settings need credential status.
 *
 * Feature: 007-fix-gallery-pin-password
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Lock, Mail, Calendar, Globe, Eye, EyeOff } from 'lucide-react';
import { AppCard } from '../../ui/AppCard';
import { Toggle } from '../../ui/FormControls';
import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { PinSettings } from './PinSettings';
import { useAuth } from '../../../contexts/AuthContext';
import { useGalleryCredentials } from '../../../hooks/useGalleryCredentials';
import type { GalleryDetailData, GalleryUpdateRequest } from '../../../types/gallery';

export interface AccessSettingsProps {
  gallery: GalleryDetailData;
  onUpdate: (updates: Partial<GalleryUpdateRequest>) => void;
}

export const AccessSettings: React.FC<AccessSettingsProps> = ({ gallery, onUpdate }) => {
  const { workspace } = useAuth();
  const [password, setPassword] = useState('');
  const [emailRequired, setEmailRequired] = useState(gallery.email_registration_required || false);
  const [expiresAt, setExpiresAt] = useState(
    gallery.expires_at ? new Date(gallery.expires_at).toISOString().slice(0, 16) : ''
  );
  const [customDomain, setCustomDomain] = useState(gallery.custom_domain || '');

  const [isPasswordEnabled, setIsPasswordEnabled] = useState(gallery.password_protected || false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Sync state with gallery prop when it changes (e.g., after successful save)
  useEffect(() => {
    setIsPasswordEnabled(gallery.password_protected || false);
    setEmailRequired(gallery.email_registration_required || false);
    setExpiresAt(gallery.expires_at ? new Date(gallery.expires_at).toISOString().slice(0, 16) : '');
    setCustomDomain(gallery.custom_domain || '');
    // Clear password input when password is disabled (but don't clear if it's enabled and has value)
    if (!gallery.password_protected) {
      setPassword('');
      lastSentPasswordRef.current = null;
    }
  }, [gallery.password_protected, gallery.email_registration_required, gallery.expires_at, gallery.custom_domain]);

  // Use shared credentials hook - single API call for both password and PIN
  const credentials = useGalleryCredentials({
    workspaceId: workspace?.workspace_id,
    galleryId: gallery.gallery_id,
    fallback: {
      passwordProtected: gallery.password_protected,
      pinProtected: gallery.pin_protected,
    },
  });

  // Track the last password value sent to parent to avoid duplicate updates
  const lastSentPasswordRef = useRef<string | null>(null);

  const handlePasswordToggle = (enabled: boolean) => {
    setIsPasswordEnabled(enabled);
    if (!enabled) {
      // Disable password protection
      onUpdate({ remove_password: true });
      setPassword('');
      lastSentPasswordRef.current = null;
      // Reset credential display state via hook
      credentials.resetCredentials('password');
      setShowPassword(false);
    } else {
      // Enable password protection
      // If password already exists in backend, the toggle state will sync via useEffect
      // If no password exists, user must enter one - input field will appear and they can set it
      // Don't send update here - only send when password is actually set or removed
      // The backend determines password_protected based on password_hash existence
    }
  };

  const handlePasswordChange = useCallback((value: string) => {
    // Remove any masked asterisks if present (from placeholder value)
    const cleanedValue = value.replace(/\*/g, '');
    
    // If user clears the field completely, allow it (they might be replacing the password)
    setPassword(cleanedValue);
    
    // Clear revealed password when user starts typing new value (and it's different from revealed)
    if (credentials.revealedPassword && cleanedValue && cleanedValue !== credentials.revealedPassword) {
      credentials.clearRevealed('password');
      setShowPassword(false);
    }
    
    // If user deletes all characters, clear the last sent ref so they can set a new password
    if (!cleanedValue) {
      lastSentPasswordRef.current = null;
      // If password was previously set and user clears field, they're replacing it - don't send remove yet
      // Wait for them to either set a new password or disable the toggle
      return;
    }
    
    // Only send password update if non-empty and different from last sent
    if (cleanedValue && cleanedValue !== lastSentPasswordRef.current) {
      lastSentPasswordRef.current = cleanedValue;
      onUpdate({ password: cleanedValue });
    }
  }, [onUpdate, credentials]);

  const handlePasswordRevealToggle = async () => {
    if (!showPassword && credentials.hasPassword && credentials.passwordRecoverable && !credentials.revealedPassword) {
      // Fetch fresh credentials when revealing for the first time
      await credentials.revealCredentials();
    }
    // Toggle reveal state
    setShowPassword(!showPassword);
    // If hiding, clear any local password value to show masked value again
    if (showPassword && !password) {
      // User is hiding the password - keep it cleared so masked value shows
      setPassword('');
    }
  };

  const handleEmailRequiredToggle = (enabled: boolean) => {
    setEmailRequired(enabled);
    onUpdate({ email_registration_required: enabled });
  };

  const handleExpiryChange = (value: string) => {
    setExpiresAt(value);
    if (value) {
      const date = new Date(value);
      onUpdate({ expires_at: date.toISOString() });
    } else {
      onUpdate({ expires_at: null });
    }
  };

  const handleCustomDomainChange = (value: string) => {
    setCustomDomain(value);
    onUpdate({ custom_domain: value || null });
  };

  return (
    <div className="space-y-6">
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Lock size={20} />
          Password Protection
        </h3>
        <div className="space-y-4">
          <Toggle
            label="Require password to view gallery"
            checked={isPasswordEnabled}
            onChange={(e) => handlePasswordToggle(e.target.checked)}
          />
          {isPasswordEnabled && (
            <div className="relative">
              {/* Prevent Google Password Manager and other password managers from detecting this field */}
              <input
                type="text"
                name="username"
                id="username_fake"
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
                id="password_fake"
                autoComplete="current-password"
                style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
                aria-hidden="true"
                tabIndex={-1}
                readOnly
                value=""
              />
              <AppInput
                type={showPassword ? 'text' : 'password'}
                name="gallery_access_code"
                id="gallery_access_code_input"
                label="Gallery Password"
                value={
                  // Priority 1: Show revealed password if user clicked eye icon and password exists
                  showPassword && credentials.revealedPassword && !password 
                    ? credentials.revealedPassword 
                    // Priority 2: Show what user is typing if they're editing
                    : password 
                      ? password
                      // Priority 3: Show masked value if password exists but isn't revealed and user hasn't typed
                      // Use asterisks that will display as masked dots in password type field (browser masks any value)
                      : credentials.hasPassword && !password && !showPassword
                        ? '********' // 8 asterisks that display as masked dots in password type field
                        // Priority 4: Empty field if no password exists
                        : ''
                }
                onChange={(e) => {
                  // Handle user input
                  const inputValue = e.target.value;
                  // If masked value is shown and user types, clear it and process their input
                  if (credentials.hasPassword && !password && !showPassword && inputValue && inputValue !== '********') {
                    // User is typing - remove masked asterisks and process
                    const cleanedValue = inputValue.replace(/\*/g, '');
                    handlePasswordChange(cleanedValue);
                  } else {
                    // Normal input processing
                    handlePasswordChange(inputValue);
                  }
                }}
                onKeyDown={(e) => {
                  // When user presses any key (except navigation keys), if masked value is shown, clear it first
                  if (credentials.hasPassword && !password && !showPassword && 
                      e.key !== 'Escape' && e.key !== 'Tab' && 
                      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(e.key) &&
                      !e.ctrlKey && !e.metaKey) {
                    // User is starting to type - clear the masked value first
                    setPassword('');
                    lastSentPasswordRef.current = null;
                  }
                }}
                placeholder={
                  credentials.isLoading 
                    ? "Loading..." 
                    : credentials.hasPassword && !password && !showPassword
                      ? "" // Empty placeholder when showing masked value
                      : "Enter gallery password"
                }
                autoComplete="off"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-non-login-password="true"
                data-gallery-password="true"
                disabled={credentials.isLoading}
                helperText={
                  credentials.hasPassword && !credentials.passwordRecoverable
                    ? "Password is set (legacy - original value cannot be revealed). Enter a new password to replace it."
                    : credentials.hasPassword
                    ? "Password is set. Click the eye icon to reveal, or enter a new password to change it."
                    : "Set any password you like. This is a simple access code for gallery visitors, not an account password."
                }
              />
              <button
                type="button"
                onClick={handlePasswordRevealToggle}
                className="absolute right-3 top-[38px] text-text-tertiary hover:text-text-secondary disabled:opacity-50"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={(credentials.hasPassword && !credentials.passwordRecoverable && !password) || credentials.isRevealing}
                title={credentials.hasPassword && !credentials.passwordRecoverable && !password ? "Original password cannot be revealed (legacy)" : undefined}
              >
                {credentials.isRevealing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-text-tertiary border-t-transparent" />
                ) : showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          )}
        </div>
      </AppCard>

      {/* PIN Protection - receives credentials from shared hook */}
      <PinSettings gallery={gallery} onUpdate={onUpdate} credentials={credentials} />

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Mail size={20} />
          Email Registration
        </h3>
        <Toggle
          label="Require email registration before viewing"
          checked={emailRequired}
          onChange={(e) => handleEmailRequiredToggle(e.target.checked)}
          description="Visitors must provide their email address before accessing the gallery"
        />
      </AppCard>

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Calendar size={20} />
          Expiry Date
        </h3>
        <div>
          <AppInput
            type="datetime-local"
            label="Gallery Expires"
            value={expiresAt}
            onChange={(e) => handleExpiryChange(e.target.value)}
            helperText="Gallery will automatically become unavailable after this date"
          />
          {expiresAt && (
            <AppButton
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpiresAt('');
                handleExpiryChange('');
              }}
              className="mt-2"
            >
              Clear expiry date
            </AppButton>
          )}
        </div>
      </AppCard>

      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Globe size={20} />
          Custom Domain
        </h3>
        <div>
          <AppInput
            type="text"
            label="Custom Domain (CNAME)"
            value={customDomain}
            onChange={(e) => handleCustomDomainChange(e.target.value)}
            placeholder="photos.yourstudio.com"
            helperText="Point a CNAME record to gallery.rawdrive.ai to use your own domain"
          />
        </div>
      </AppCard>
    </div>
  );
};


