/**
 * AccessSettings Component
 * Settings for gallery access control
 *
 * Uses the shared useGalleryCredentials hook to avoid duplicate API calls
 * when both password and PIN settings need credential status.
 *
 * Feature: 007-fix-gallery-pin-password
 */

import React, { useState, useRef, useCallback } from 'react';
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
      onUpdate({ remove_password: true });
      setPassword('');
      lastSentPasswordRef.current = null;
      // Reset credential display state via hook
      credentials.resetCredentials('password');
      setShowPassword(false);
    }
  };

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    // Clear revealed password when user starts typing new value
    if (credentials.revealedPassword && value !== credentials.revealedPassword) {
      credentials.clearRevealed('password');
      setShowPassword(false);
    }
    // Only send password update if non-empty and different from last sent
    if (value && value !== lastSentPasswordRef.current) {
      lastSentPasswordRef.current = value;
      onUpdate({ password: value });
    }
  }, [onUpdate, credentials]);

  const handlePasswordRevealToggle = async () => {
    if (!showPassword && credentials.hasPassword && credentials.passwordRecoverable && !credentials.revealedPassword) {
      // Fetch fresh credentials when revealing for the first time
      await credentials.revealCredentials();
    }
    setShowPassword(!showPassword);
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
              {/* Hidden fields to trick password managers */}
              <input type="text" name="prevent_autofill" id="prevent_autofill" value="" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} readOnly />
              <input type="password" name="password_fake" id="password_fake" value="" autoComplete="new-password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} readOnly />
              <AppInput
                type={showPassword ? 'text' : 'password'}
                name="gallery_access_code"
                label="Gallery Password"
                value={showPassword && credentials.revealedPassword && !password ? credentials.revealedPassword : password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                placeholder={credentials.isLoading ? "Loading..." : (credentials.hasPassword ? "********" : "Enter gallery password")}
                autoComplete="new-password"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
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


