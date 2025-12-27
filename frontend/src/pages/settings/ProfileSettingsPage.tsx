/**
 * Profile Settings Page
 * User Story 1: View and Edit Personal Profile
 *
 * Allows users to manage their personal information including:
 * - Display name, email, phone, job title
 * - Profile photo upload with crop
 * - Timezone and language preferences
 * - Short bio
 */

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
} from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserSettings';
import { useToastActions } from '../../components/ui/Toast';
import { AppButton } from '../../components/ui/AppButton';
import { AppInput, AppTextarea } from '../../components/ui/AppInput';
import { AvatarUploader } from '../../components/settings/AvatarUploader';
import { TimezonePicker } from '../../components/settings/TimezonePicker';
import { EmailChangeModal } from '../../components/settings/EmailChangeModal';
import type { CropData } from '../../components/ui/AvatarCropModal';

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

  // Loading state
  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-text-secondary">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !profile) {
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-error" />
          <div>
            <h3 className="font-semibold text-text-primary">Failed to load profile</h3>
            <p className="text-text-secondary text-sm mt-1">{error.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Profile Settings</h1>
        <p className="text-text-secondary mt-1">
          Manage your personal information and how others see you
        </p>
      </div>

      {/* Avatar Section */}
      <section className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Profile Photo</h2>
        <p className="text-text-secondary text-sm mb-6">
          This photo will appear on your profile and be visible to clients when you share galleries.
        </p>
        <AvatarUploader
          currentAvatarUrl={profile?.avatar_url}
          displayName={profile?.display_name || 'User'}
          onUpload={handleAvatarUpload}
          onDelete={handleAvatarDelete}
          isUploading={isUploadingAvatar}
          isDeleting={isDeletingAvatar}
        />
      </section>

      {/* Profile Form */}
      <form onSubmit={handleSubmit}>
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Personal Information</h2>

          <div className="space-y-6">
            {/* Display Name */}
            <AppInput
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              error={fieldErrors.displayName}
              isRequired
              leftIcon={<User className="w-5 h-5" />}
              helperText={`${displayName.length}/${CONSTRAINTS.displayName.max} characters`}
            />

            {/* Email - Read-only with change button */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Email Address
              </label>
              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-surface-hover border border-border rounded-xl">
                  <Mail className="w-5 h-5 text-text-tertiary" />
                  <span className="text-text-primary">{profile?.email}</span>
                  {profile?.email_verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/10 text-success text-xs rounded-full">
                      <CheckCircle className="w-3 h-3" />
                      Verified
                    </span>
                  )}
                </div>
                <AppButton
                  type="button"
                  variant="outline"
                  onClick={() => setEmailModalOpen(true)}
                >
                  Change
                </AppButton>
              </div>
            </div>

            {/* Job Title */}
            <AppInput
              label="Job Title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g., Wedding Photographer"
              error={fieldErrors.jobTitle}
              leftIcon={<Briefcase className="w-5 h-5" />}
              helperText="Optional - displayed on your public profile"
            />

            {/* Phone */}
            <AppInput
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 000-0000"
              error={fieldErrors.phone}
              leftIcon={<Phone className="w-5 h-5" />}
              helperText="Optional - for account recovery and notifications"
            />

            {/* Timezone */}
            <TimezonePicker
              value={timezone}
              onChange={setTimezone}
              label="Timezone"
            />

            {/* Bio */}
            <AppTextarea
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us a bit about yourself and your photography style..."
              error={fieldErrors.bio}
              rows={4}
              helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters - displayed on your public profile`}
            />
          </div>
        </section>

        {/* Form Actions */}
        <div className="flex items-center justify-between mt-6 py-4 border-t border-border">
          <p className="text-sm text-text-tertiary">
            {hasChanges ? (
              <span className="text-warning">You have unsaved changes</span>
            ) : (
              'All changes saved'
            )}
          </p>
          <AppButton
            type="submit"
            variant="primary"
            disabled={!hasChanges || isSaving}
            isLoading={isSaving}
            loadingText="Saving..."
            leftIcon={<Save className="w-4 h-4" />}
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
  );
};

export default ProfileSettingsPage;
