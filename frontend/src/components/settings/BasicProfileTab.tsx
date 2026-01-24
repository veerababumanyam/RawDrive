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
import { useToastActions } from '../ui/Toast';
import { AppButton } from '../ui/AppButton';
import { AppInput, AppTextarea } from '../ui/AppInput';
import { AvatarUploader } from './AvatarUploader';
import { TimezonePicker } from './TimezonePicker';
import { EmailChangeModal } from './EmailChangeModal';
import { personalProfileService } from '../../services/personalProfileService';
import type { CropData } from '../ui/AvatarEditor/types';

/* =============================================================================
   Basic Profile Tab Component
   ============================================================================= */

// Form field constraints
const CONSTRAINTS = {
  displayName: { min: 2, max: 100 },
  jobTitle: { max: 100 },
  phone: { max: 50 },
  bio: { max: 500 },
};

export const BasicProfileTab: React.FC = () => {
  const { profile, loading, error, updateProfile, uploadAvatar, deleteAvatar, requestEmailChange } =
    useUserProfile();
  const toast = useToastActions();

  // Form state
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

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      errors.displayName = 'Display name is required';
    } else if (trimmedName.length < CONSTRAINTS.displayName.min) {
      errors.displayName = `Display name must be at least ${CONSTRAINTS.displayName.min} characters`;
    } else if (trimmedName.length > CONSTRAINTS.displayName.max) {
      errors.displayName = `Display name cannot exceed ${CONSTRAINTS.displayName.max} characters`;
    }

    if (jobTitle && jobTitle.length > CONSTRAINTS.jobTitle.max) {
      errors.jobTitle = `Job title cannot exceed ${CONSTRAINTS.jobTitle.max} characters`;
    }

    if (phone && phone.length > CONSTRAINTS.phone.max) {
      errors.phone = `Phone number cannot exceed ${CONSTRAINTS.phone.max} characters`;
    }

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
        throw err;
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
      <div className="bg-error/10 border border-error/20 rounded-xl p-6 backdrop-blur-sm">
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
    <div className="space-y-6">
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
              Your profile photo will appear in your account settings and when sharing galleries with others.
              We recommend a square image of at least 400x400 pixels.
            </p>
          </div>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="card-glass rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-6">Personal Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Display Name */}
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
            helperText="Optional - for your personal reference"
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
            <TimezonePicker
              value={timezone}
              onChange={setTimezone}
              label="Timezone"
            />
          </div>

          {/* Bio */}
          <div className="md:col-span-2">
            <AppTextarea
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us a bit about yourself..."
              error={fieldErrors.bio}
              rows={4}
              className="glass-light border-white/20 dark:border-white/10 focus:bg-white/10"
              helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters - for your personal reference`}
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
  );
};
