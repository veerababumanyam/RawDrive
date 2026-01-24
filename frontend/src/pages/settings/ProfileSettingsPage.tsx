import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle,
  Copy,
  QrCode,
  ExternalLink,
  Download,
  Globe,
  Plus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUserProfile } from '../../hooks/useUserSettings';
import { useToastActions } from '../../components/ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { AppButton } from '../../components/ui/AppButton';
import { AppInput, AppTextarea } from '../../components/ui/AppInput';
import { AvatarUploader } from '../../components/settings/AvatarUploader';
import { TimezonePicker } from '../../components/settings/TimezonePicker';
import { EmailChangeModal } from '../../components/settings/EmailChangeModal';
import { SettingsPageLayout } from '../../components/settings/SettingsPageLayout';
import { personalProfileService } from '../../services/personalProfileService';
import type { CropData } from '../../components/ui/AvatarEditor/types';

/* =============================================================================
   Profile Settings Page Component
   ============================================================================= */

// Form field constraints
const CONSTRAINTS = {
  displayName: { min: 2, max: 100 },
  jobTitle: { max: 100 },
  phone: { max: 50 },
  bio: { max: 500 },
};

const ProfileSettingsPage: React.FC = () => {
  const { profile, loading, error, updateProfile, uploadAvatar, deleteAvatar, requestEmailChange } =
    useUserProfile();
  const toast = useToastActions();

  // Form state - individual fields for easier tracking
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Public profile state
  const [publicProfileSlug, setPublicProfileSlug] = useState<string | null>(null);
  const [isLoadingSlug, setIsLoadingSlug] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isDownloadingQr, setIsDownloadingQr] = useState(false);

  // Initialize form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setJobTitle(profile.job_title || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setTimezone(profile.timezone || 'Asia/Kolkata');
    }
  }, [profile]);

  // Get workspace_id from AuthContext
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  // Fetch public profile slug
  useEffect(() => {
    const fetchPublicProfileSlug = async () => {
      if (!profile || !workspaceId) return;

      setIsLoadingSlug(true);
      setSlugError(null);
      try {
        const personalProfile = await personalProfileService.getProfile(workspaceId);
        setPublicProfileSlug(personalProfile.slug);
      } catch (err: any) {
        // Handle 404 - user hasn't created a personal profile yet
        if (err?.response?.status === 404) {
          setSlugError('No public profile created yet');
        } else {
          setSlugError('Failed to load public profile');
        }
        setPublicProfileSlug(null);
      } finally {
        setIsLoadingSlug(false);
      }
    };

    fetchPublicProfileSlug();
  }, [profile, workspaceId]);

  // Check if form has unsaved changes
  const hasChanges = useMemo(() => {
    if (!profile) return false;
    return (
      displayName !== (profile.display_name || '') ||
      jobTitle !== (profile.job_title || '') ||
      phone !== (profile.phone || '') ||
      bio !== (profile.bio || '') ||
      timezone !== (profile.timezone || 'Asia/Kolkata')
    );
  }, [profile, displayName, jobTitle, phone, bio, timezone]);

  // Validate form fields
  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    // Display name validation
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      errors.displayName = 'Display name is required';
    } else if (trimmedName.length < CONSTRAINTS.displayName.min) {
      errors.displayName = `Display name must be at least ${CONSTRAINTS.displayName.min} characters`;
    } else if (trimmedName.length > CONSTRAINTS.displayName.max) {
      errors.displayName = `Display name cannot exceed ${CONSTRAINTS.displayName.max} characters`;
    }

    // Job title validation (optional)
    if (jobTitle && jobTitle.length > CONSTRAINTS.jobTitle.max) {
      errors.jobTitle = `Job title cannot exceed ${CONSTRAINTS.jobTitle.max} characters`;
    }

    // Phone validation (optional, basic format)
    if (phone && phone.length > CONSTRAINTS.phone.max) {
      errors.phone = `Phone number cannot exceed ${CONSTRAINTS.phone.max} characters`;
    }

    // Bio validation (optional)
    if (bio && bio.length > CONSTRAINTS.bio.max) {
      errors.bio = `Bio cannot exceed ${CONSTRAINTS.bio.max} characters`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [displayName, jobTitle, phone, bio]);

  // Handle form submission
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) return;

      setIsSaving(true);
      try {
        await updateProfile({
          display_name: displayName.trim(),
          job_title: jobTitle.trim() || null,
          phone: phone.trim() || null,
          bio: bio.trim() || null,
          timezone,
        });
        toast.success('Profile updated successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update profile';
        toast.error(message);
      } finally {
        setIsSaving(false);
      }
    },
    [displayName, jobTitle, phone, bio, timezone, validateForm, updateProfile, toast]
  );

  // Handle avatar upload
  const handleAvatarUpload = useCallback(
    async (file: File, cropData?: CropData) => {
      setIsUploadingAvatar(true);
      try {
        await uploadAvatar(file, cropData);
        toast.success('Avatar updated successfully');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload avatar';
        toast.error(message);
        throw err; // Re-throw so AvatarUploader knows upload failed
      } finally {
        setIsUploadingAvatar(false);
      }
    },
    [uploadAvatar, toast]
  );

  // Handle avatar deletion
  const handleAvatarDelete = useCallback(async () => {
    setIsDeletingAvatar(true);
    try {
      await deleteAvatar();
      toast.success('Avatar removed successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove avatar';
      toast.error(message);
      throw err;
    } finally {
      setIsDeletingAvatar(false);
    }
  }, [deleteAvatar, toast]);

  // Handle email change request
  const handleEmailChange = useCallback(
    async (newEmail: string, password: string) => {
      await requestEmailChange(newEmail, password);
      toast.success('Verification email sent! Check your inbox.');
    },
    [requestEmailChange, toast]
  );

  // Copy URL to clipboard
  const handleCopyUrl = useCallback(async () => {
    if (!publicProfileSlug) return;

    const publicUrl = personalProfileService.getPublicProfileUrl(publicProfileSlug);
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopySuccess(true);
      toast.success('URL copied to clipboard');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  }, [publicProfileSlug, toast]);

  // Download QR code as PNG
  const handleDownloadQr = useCallback(async () => {
    if (!publicProfileSlug) return;

    const publicUrl = personalProfileService.getPublicProfileUrl(publicProfileSlug);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(publicUrl)}`;

    setIsDownloadingQr(true);
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) throw new Error('Failed to generate QR code');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${publicProfileSlug}-qr-code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('QR code downloaded');
    } catch (err) {
      toast.error('Failed to download QR code');
    } finally {
      setIsDownloadingQr(false);
    }
  }, [publicProfileSlug, toast]);

  // Open public profile in new tab
  const handleViewProfile = useCallback(() => {
    if (!publicProfileSlug) return;
    const publicUrl = personalProfileService.getPublicProfileUrl(publicProfileSlug);
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  }, [publicProfileSlug]);

  // Loading state
  if (loading && !profile) {
    return (
      <SettingsPageLayout title="Profile Settings">
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-text-secondary">Loading profile...</p>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <SettingsPageLayout title="Profile Settings">
        <div className="bg-error/10 border border-error/20 rounded-xl p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-error" />
            <div>
              <h3 className="font-semibold text-text-primary">Failed to load profile</h3>
              <p className="text-text-secondary text-sm mt-1">{error.message}</p>
            </div>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      title="Profile Settings"
      subtitle="Manage your personal information and how others see you"
    >
      <div className="space-y-6">
        {/* PUBLIC PROFILE CARD - NEW SECTION */}
        <div className="card-glass rounded-2xl p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              Public Profile
            </h2>
            <p className="text-text-secondary text-sm mt-1">
              Share your professional profile with clients and collaborators
            </p>
          </div>

          {/* Loading State */}
          {isLoadingSlug && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-2 text-text-secondary">Loading public profile...</span>
            </div>
          )}

          {/* Error State - No Profile Created */}
          {slugError && !publicProfileSlug && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="font-medium text-text-primary">No Public Profile Yet</h3>
                  <p className="text-text-secondary text-sm mt-1">
                    Create a public profile to share your portfolio and contact information with clients.
                  </p>
                  <AppButton
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => window.location.href = '/settings/personal-profile'}
                    leftIcon={<Plus className="w-4 h-4" />}
                  >
                    Create Public Profile
                  </AppButton>
                </div>
              </div>
            </div>
          )}

          {/* Main Content - Show when slug exists */}
          {publicProfileSlug && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - URL and Actions */}
              <div className="space-y-6">
                {/* Public URL Display */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Your Public Profile URL
                  </label>
                  <div className="flex gap-2">
                    <AppInput
                      value={personalProfileService.getPublicProfileUrl(publicProfileSlug)}
                      readOnly
                      variant="glass"
                      leftIcon={<Globe className="w-4 h-4" />}
                      className="flex-1 font-mono text-sm"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <AppButton
                      variant={copySuccess ? "success" : "outline"}
                      size="md"
                      onClick={handleCopyUrl}
                      leftIcon={copySuccess ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      className="whitespace-nowrap"
                    >
                      {copySuccess ? 'Copied!' : 'Copy'}
                    </AppButton>
                  </div>
                  <p className="text-text-tertiary text-xs">
                    Share this link on your website, social media, or business cards
                  </p>
                </div>

                {/* Quick Actions */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-text-primary">
                    Quick Actions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <AppButton
                      variant="outline"
                      size="sm"
                      onClick={handleCopyUrl}
                      leftIcon={<Copy className="w-4 h-4" />}
                    >
                      Copy URL
                    </AppButton>
                    <AppButton
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadQr}
                      isLoading={isDownloadingQr}
                      leftIcon={<Download className="w-4 h-4" />}
                    >
                      Download QR
                    </AppButton>
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={handleViewProfile}
                      leftIcon={<ExternalLink className="w-4 h-4" />}
                    >
                      View Profile
                    </AppButton>
                  </div>
                </div>
              </div>

              {/* Right Column - QR Code Preview */}
              <div className="flex flex-col items-center justify-center">
                <div className="space-y-3 text-center">
                  <label className="block text-sm font-medium text-text-primary">
                    QR Code Preview
                  </label>
                  <div className="relative w-64 h-64 rounded-xl border-2 border-border bg-white p-4 flex items-center justify-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(personalProfileService.getPublicProfileUrl(publicProfileSlug))}`}
                      alt={`QR code for ${publicProfileSlug} public profile`}
                      className="w-full h-full object-contain"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-text-tertiary text-xs max-w-xs mx-auto">
                    Clients can scan this QR code to access your profile instantly
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Avatar Section */}
        <div className="card-glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Profile Photo</h2>
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-shrink-0">
              <AvatarUploader
                currentAvatarUrl={profile?.avatar_url}
                displayName={profile?.display_name || 'User'}
                onUpload={handleAvatarUpload}
                onDelete={handleAvatarDelete}
                isUploading={isUploadingAvatar}
                isDeleting={isDeletingAvatar}
              />
            </div>
            <div className="flex-1">
              <p className="text-text-secondary text-sm mb-4 leading-relaxed">
                This photo will appear on your public profile and be visible to clients when you share galleries.
                We recommend a square image of at least 400x400 pixels.
              </p>
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="card-glass rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Personal Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Display Name - Full Width on Mobile, Half on Desktop */}
            <AppInput
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              error={fieldErrors.displayName}
              isRequired
              variant="glass"
              leftIcon={<User className="w-5 h-5" />}
              helperText={`${displayName.length}/${CONSTRAINTS.displayName.max} characters`}
            />

            {/* Job Title */}
            <AppInput
              label="Job Title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Wedding Photographer"
              error={fieldErrors.jobTitle}
              variant="glass"
              leftIcon={<Briefcase className="w-5 h-5" />}
              helperText="Optional - displayed on your public profile"
            />

            {/* Email - Read-only with change button */}
            <div className="md:col-span-2 space-y-1.5">
              <label className="block text-sm font-medium text-text-primary">
                Email Address
              </label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-3 px-4 py-2.5 glass-light border border-white/20 dark:border-white/10 rounded-xl">
                  <Mail className="w-5 h-5 text-text-tertiary" />
                  <span className="text-text-primary">{profile?.email}</span>
                  {profile?.email_verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/10 text-success text-xs rounded-full ml-auto">
                      <CheckCircle className="w-3 h-3" />
                      <span className="hidden sm:inline">Verified</span>
                    </span>
                  )}
                </div>
                <AppButton
                  type="button"
                  variant="outline"
                  onClick={() => setEmailModalOpen(true)}
                  className="whitespace-nowrap"
                >
                  Change
                </AppButton>
              </div>
            </div>

            {/* Phone */}
            <AppInput
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              error={fieldErrors.phone}
              variant="glass"
              leftIcon={<Phone className="w-5 h-5" />}
              helperText="Optional - for account recovery"
            />

            {/* Timezone */}
            <div className="space-y-1.5">
              {/* TimezonePicker needs to be updated to support 'variant' prop if possible, 
                   or we wrap it. For now, we'll leave it as is but it might need style adjustment.
                   Assuming TimezonePicker uses AppInput internally or similar styles.
               */}
              <TimezonePicker
                value={timezone}
                onChange={setTimezone}
                label="Timezone"
              />
            </div>

            {/* Bio - Full Width */}
            <div className="md:col-span-2">
              <AppTextarea
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a bit about yourself and your photography style..."
                error={fieldErrors.bio}
                rows={4}
                // variant="glass" // AppTextarea in AppInput.tsx might need variant support too?
                // Checking previous ViewFile of AppInput.tsx: AppTextarea DOES NOT have variant prop in the interface.
                // We will add class overrides or just standard styling for now, 
                // but ideally we should update AppTextarea to support variants.
                className="glass-light border-white/20 dark:border-white/10 focus:bg-white/10"
                helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters - displayed on your public profile`}
              />
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/10">
            <p className="text-sm text-text-tertiary">
              {hasChanges ? (
                <span className="text-warning flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
                  Unsaved changes
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-success" />
                  All changes saved
                </span>
              )}
            </p>
            <AppButton
              type="submit"
              variant="primary"
              disabled={!hasChanges || isSaving}
              isLoading={isSaving}
              loadingText="Saving..."
              leftIcon={<Save className="w-4 h-4" />}
              shine
            >
              Save Changes
            </AppButton>
          </div>
        </form>

        {/* Email Change Modal */}
        <EmailChangeModal
          isOpen={emailModalOpen}
          currentEmail={profile?.email || ''}
          onClose={() => setEmailModalOpen(false)}
          onSubmit={handleEmailChange}
        />
      </div>
    </SettingsPageLayout>
  );
};

export default ProfileSettingsPage;
