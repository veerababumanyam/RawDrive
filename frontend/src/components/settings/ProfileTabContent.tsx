/**
 * ProfileTabContent Component
 *
 * Profile settings tab content - wraps the profile settings form.
 * Uses the same hooks and patterns as ProfileSettingsPage.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  Save,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserSettings';
import { useToastActions } from '../../components/ui/Toast';
import { AppButton } from '../../components/ui/AppButton';
import { AppInput, AppTextarea } from '../../components/ui/AppInput';
import { AvatarUploader } from './AvatarUploader';
import { TimezonePicker } from './TimezonePicker';
import { EmailChangeModal } from './EmailChangeModal';
import type { TabContentProps } from '../../types/settings';

// Form field constraints
const CONSTRAINTS = {
  displayName: { min: 2, max: 100 },
  jobTitle: { max: 100 },
  phone: { max: 50 },
  bio: { max: 500 },
};

export function ProfileTabContent({ className }: TabContentProps) {
  const { profile, loading, updateProfile, uploadAvatar, deleteAvatar, requestEmailChange } = useUserProfile();
  const toast = useToastActions();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingAvatar, setIsDeletingAvatar] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Initialize form from profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setJobTitle(profile.job_title || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [profile]);

  // Track dirty state
  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      displayName !== (profile.display_name || '') ||
      jobTitle !== (profile.job_title || '') ||
      phone !== (profile.phone || '') ||
      bio !== (profile.bio || '') ||
      timezone !== (profile.timezone || '')
    );
  }, [displayName, jobTitle, phone, bio, timezone, profile]);

  // Validation
  const validateFields = useCallback(() => {
    const errors: Record<string, string> = {};

    if (displayName.length < CONSTRAINTS.displayName.min) {
      errors.displayName = `Display name must be at least ${CONSTRAINTS.displayName.min} characters`;
    } else if (displayName.length > CONSTRAINTS.displayName.max) {
      errors.displayName = `Display name must be at most ${CONSTRAINTS.displayName.max} characters`;
    }

    if (jobTitle.length > CONSTRAINTS.jobTitle.max) {
      errors.jobTitle = `Job title must be at most ${CONSTRAINTS.jobTitle.max} characters`;
    }

    if (bio.length > CONSTRAINTS.bio.max) {
      errors.bio = `Bio must be at most ${CONSTRAINTS.bio.max} characters`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [displayName, jobTitle, bio]);

  // Handle save
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateFields()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        display_name: displayName || undefined,
        job_title: jobTitle || undefined,
        phone: phone || undefined,
        bio: bio || undefined,
        timezone,
      });
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      toast.success('Profile photo updated');
    } catch (error) {
      toast.error('Failed to upload photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle avatar delete
  const handleAvatarDelete = async () => {
    setIsDeletingAvatar(true);
    try {
      await deleteAvatar();
      toast.success('Profile photo removed');
    } catch (error) {
      toast.error('Failed to remove photo');
    } finally {
      setIsDeletingAvatar(false);
    }
  };

  // Loading state
  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  return (
    <div className={`space-y-8 ${className || ''}`}>
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
                  onClick={() => setShowEmailModal(true)}
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
            />

            {/* Phone */}
            <AppInput
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              leftIcon={<Phone className="w-5 h-5" />}
            />

            {/* Bio */}
            <AppTextarea
              label="Bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself and your photography style..."
              rows={4}
              error={fieldErrors.bio}
              helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters`}
            />

            {/* Timezone */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Timezone
              </label>
              <TimezonePicker value={timezone} onChange={setTimezone} />
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end mt-8 pt-6 border-t border-border">
            <AppButton type="submit" disabled={isSaving || !isDirty}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </AppButton>
          </div>
        </section>
      </form>

      {/* Email Change Modal */}
      {showEmailModal && (
        <EmailChangeModal
          isOpen={showEmailModal}
          onClose={() => setShowEmailModal(false)}
          currentEmail={profile?.email || ''}
          onSubmit={async (newEmail: string, password: string) => {
            await requestEmailChange(newEmail, password);
            toast.success('Verification email sent to your new address');
          }}
        />
      )}
    </div>
  );
}

export default ProfileTabContent;
