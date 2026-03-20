/**
 * PersonalProfileTabContent Component
 *
 * Tab content for creating and editing Personal Profile Digital Visiting Cards.
 * Features: live preview via PublicProfileRenderer, DnD section reordering,
 * gradient color picker, device frame toggle, and auto-save.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Image,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Youtube,
  Music,
  Palette,
  Calendar,
  FileText,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToastActions } from '../ui/Toast';
import { AppButton } from '../ui/AppButton';
import { AppInput, AppTextarea } from '../ui/AppInput';
import { AvatarUploader } from './AvatarUploader';
import { PersonalProfileAIAssistant } from './PersonalProfileAIAssistant';
import { VisibilityToggle } from './VisibilityToggle';
import { ThemePreviewCard } from './ThemePreviewCard';
import { ThemeCustomization } from '../features/settings/ThemeCustomization';
import { ProfileStatusBar } from '../profile/ProfileStatusBar';
import { ProfileEditorProvider, useProfileEditor, useProfileEditorDispatch } from '../../contexts/ProfileEditorContext';
import { useProfileAutoSave } from '../../hooks/useProfileAutoSave';
import { DndSectionList } from '../features/settings/DndSectionList';
import { DeviceFramePreview } from '../features/settings/DeviceFramePreview';
import { GradientColorPicker } from '../features/settings/GradientColorPicker';
import { PublicProfileRenderer } from '../features/profile/shared/PublicProfileRenderer';
import { personalProfileService } from '../../services/personalProfileService';
import { PREBUILT_THEMES } from '../../constants/themes';
import type { OptimizeSEOResponse } from '../../services/personalProfileAIService';
import type { TabContentProps } from '../../types/settings';
import type {
  PersonalProfile,
  CreatePersonalProfileRequest,
  UpdatePersonalProfileRequest,
  PersonalVisibilityConfig,
  CustomLink,
  SecondaryContact,
  EmbeddedMedia,
  SEOMetadata,
  BackgroundTheme,
} from '../../types/personalProfile';

// Form constraints
const CONSTRAINTS = {
  displayName: { min: 1, max: 255 },
  profileTitle: { max: 255 },
  slug: { min: 3, max: 100 },
  bio: { max: 500 },
  location: { max: 255 },
  phone: { max: 50 },
};

// Social media platforms with their icons
const SOCIAL_PLATFORMS = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, placeholder: 'https://instagram.com/username' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, placeholder: 'https://facebook.com/page' },
  { key: 'twitter', label: 'Twitter/X', icon: Twitter, placeholder: 'https://twitter.com/username' },
  { key: 'linkedin', label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/in/username' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/@channel' },
  { key: 'tiktok', label: 'TikTok', icon: Music, placeholder: 'https://tiktok.com/@username' },
  { key: 'pinterest', label: 'Pinterest', icon: Image, placeholder: 'https://pinterest.com/username' },
  { key: 'behance', label: 'Behance', icon: Palette, placeholder: 'https://behance.net/username' },
  { key: 'dribbble', label: 'Dribbble', icon: Palette, placeholder: 'https://dribbble.com/username' },
  { key: 'spotify', label: 'Spotify', icon: Music, placeholder: 'https://open.spotify.com/artist/...' },
  { key: 'whatsapp', label: 'WhatsApp', icon: Phone, placeholder: 'https://wa.me/1234567890' },
] as const;

// Category options
const CATEGORY_OPTIONS = [
  'Photography',
  'Videography',
  'Wedding Services',
  'Commercial Production',
  'Portrait Photography',
  'Event Photography',
  'Creative Services',
  'Travel Photography',
  'Fashion Photography',
  'Product Photography',
  'Real Estate Photography',
  'Food Photography',
  'Sports Photography',
  'Documentary',
  'Fine Art',
];

// ---------------------------------------------------------------------------
// Auto-save status indicator
// ---------------------------------------------------------------------------

function AutoSaveStatus({ isSaving, lastSavedAt, isDirty }: { isSaving: boolean; lastSavedAt: string | null; isDirty: boolean }) {
  if (isSaving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving...
      </span>
    );
  }
  if (isDirty) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
        <AlertCircle className="w-3 h-3" />
        Unsaved changes
      </span>
    );
  }
  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
        <CheckCircle className="w-3 h-3" />
        Saved
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inner component (has access to ProfileEditorContext)
// ---------------------------------------------------------------------------

function PersonalProfileEditorInner({ className }: { className?: string }) {
  const { workspace, isLoading: isAuthLoading } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const toast = useToastActions();

  const editorState = useProfileEditor();
  const dispatch = useProfileEditorDispatch();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [profileExists, setProfileExists] = useState(false);

  // Theme state
  const [selectedTheme, setSelectedTheme] = useState(PREBUILT_THEMES.find(t => t.theme_id === 'theme-clean-slate') || null);
  const [themeCustomization, setThemeCustomization] = useState<Record<string, any> | null>(null);
  const [showCustomization, setShowCustomization] = useState(false);

  // Section order panel
  const [showSectionOrder, setShowSectionOrder] = useState(false);

  // Color picker state
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Validation
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Helper to read fields from editor state
  const p = editorState.profile;
  const displayName = (p.display_name as string) || '';
  const profileTitle = (p.profile_title as string) || '';
  const slug = (p.slug as string) || '';
  const email = (p.email as string) || '';
  const phone = (p.phone as string) || '';
  const website = (p.website as string) || '';
  const bio = (p.bio as string) || '';
  const location = (p.location as string) || '';
  const avatarUrl = (p.avatar_url as string) || '';
  const socials = (p.socials as Record<string, string>) || {};
  const customLinks = (p.custom_links as CustomLink[]) || [];
  const categories = (p.categories as string[]) || [];
  const serviceAreas = (p.service_areas as string[]) || [];
  const backgroundTheme = (p.background_theme as BackgroundTheme) || 'theme-clean-slate';
  const isPublic = (p.is_public as boolean) || false;
  const embeddedMedia = (p.embedded_media as EmbeddedMedia) || {};
  const bookingCalendarUrl = (p.booking_calendar_url as string) || '';
  const visibilityConfig = (p.visibility_config as Partial<PersonalVisibilityConfig>) || {};
  const seoMetadata = (p.seo_metadata as SEOMetadata) || {};
  const secondaryEmails = (p.secondary_emails as SecondaryContact[]) || [];
  const secondaryPhones = (p.secondary_phones as SecondaryContact[]) || [];

  // Dispatcher helpers
  const setField = useCallback((field: string, value: unknown) => {
    dispatch({ type: 'SET_FIELD', field, value });
  }, [dispatch]);

  // Auto-save integration
  const { isSaving, lastSavedAt, saveNow } = useProfileAutoSave({
    profileType: 'personal',
    profileData: editorState.profile,
    isDirty: editorState.isDirty && profileExists,
    onSaved: () => dispatch({ type: 'MARK_SAVED' }),
  });

  // Load profile on mount
  useEffect(() => {
    if (isAuthLoading) return;
    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        const existsResponse = await personalProfileService.checkProfileExists(workspaceId);
        setProfileExists(existsResponse.exists);

        if (existsResponse.exists) {
          const profileData = await personalProfileService.getProfile(workspaceId);
          setProfile(profileData);
          dispatch({ type: 'RESET', profile: profileData as unknown as Record<string, unknown> });

          // Sync theme
          const themeId = profileData.background_theme || 'theme-clean-slate';
          const theme = PREBUILT_THEMES.find(t => t.theme_id === themeId);
          setSelectedTheme(theme || null);
        } else {
          const prefill = await personalProfileService.getPrefillData(workspaceId);
          const initialData: Record<string, unknown> = {
            display_name: prefill.display_name || '',
            email: prefill.email || '',
            phone: prefill.phone || '',
            bio: prefill.bio || '',
            avatar_url: prefill.avatar_url || '',
            location: prefill.location || '',
            slug: prefill.display_name ? personalProfileService.generateSlugFromName(prefill.display_name) : '',
            background_theme: 'theme-clean-slate',
          };
          dispatch({ type: 'RESET', profile: initialData });
        }
      } catch (error: any) {
        if (error.response?.status !== 404) {
          toast.error('Failed to load profile');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [workspaceId, isAuthLoading]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!workspaceId || !slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugError('');
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugError('Only lowercase letters, numbers, and hyphens allowed');
      setSlugAvailable(false);
      return;
    }
    if (profile?.slug === slug) {
      setSlugAvailable(true);
      setSlugError('');
      return;
    }
    const timeoutId = setTimeout(async () => {
      setIsCheckingSlug(true);
      try {
        const result = await personalProfileService.checkSlugAvailability(workspaceId, slug);
        setSlugAvailable(result.available);
        setSlugError(result.available ? '' : 'This URL is already taken');
      } catch {
        setSlugError('Failed to check availability');
      } finally {
        setIsCheckingSlug(false);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [slug, workspaceId, profile?.slug]);

  // Handle save (for new profiles - auto-save only works for existing profiles)
  const handleCreateProfile = async () => {
    if (!workspaceId) return;

    const errors: Record<string, string> = {};
    if (displayName.length < CONSTRAINTS.displayName.min) errors.displayName = 'Display name is required';
    if (slug.length < CONSTRAINTS.slug.min) errors.slug = 'Slug must be at least 3 characters';
    if (!email) errors.email = 'Email is required';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the validation errors');
      return;
    }

    dispatch({ type: 'SET_SAVING', isSaving: true });
    try {
      const data: CreatePersonalProfileRequest = editorState.profile as any;
      const result = await personalProfileService.createProfile(workspaceId, data);
      setProfileExists(true);
      setProfile(result);
      dispatch({ type: 'MARK_SAVED' });
      toast.success('Profile created successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create profile');
    } finally {
      dispatch({ type: 'SET_SAVING', isSaving: false });
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    if (!workspaceId) return;
    setIsUploadingAvatar(true);
    try {
      const result = await personalProfileService.uploadAvatar(workspaceId, file);
      setField('avatar_url', result.avatar_url);
      toast.success('Avatar uploaded');
    } catch {
      toast.error('Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle avatar delete
  const handleAvatarDelete = async () => {
    if (!workspaceId) return;
    try {
      await personalProfileService.deleteAvatar(workspaceId);
      setField('avatar_url', '');
      toast.success('Avatar removed');
    } catch {
      toast.error('Failed to remove avatar');
    }
  };

  // Custom link helpers
  const addCustomLink = () => {
    if (customLinks.length >= 10) {
      toast.error('Maximum 10 custom links allowed');
      return;
    }
    setField('custom_links', [...customLinks, { label: '', url: '' }]);
  };
  const removeCustomLink = (index: number) => {
    setField('custom_links', customLinks.filter((_, i) => i !== index));
  };
  const updateCustomLink = (index: number, field: keyof CustomLink, value: string) => {
    const updated = [...customLinks];
    updated[index] = { ...updated[index], [field]: value };
    setField('custom_links', updated);
  };

  // Toggle category
  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      setField('categories', categories.filter((c) => c !== category));
    } else if (categories.length < 10) {
      setField('categories', [...categories, category]);
    } else {
      toast.error('Maximum 10 categories allowed');
    }
  };

  // AI callbacks
  const handleBioGenerated = useCallback((bio: string) => {
    setField('bio', bio);
    toast.success('AI generated bio applied');
  }, [setField, toast]);

  const handleTaglineGenerated = useCallback((tagline: string) => {
    setField('profile_title', tagline);
    toast.success('AI generated tagline applied to Professional Title');
  }, [setField, toast]);

  const handleSEOGenerated = useCallback((seo: OptimizeSEOResponse) => {
    setField('seo_metadata', {
      ...(seoMetadata || {}),
      meta_title: seo.meta_title,
      meta_description: seo.meta_description,
    });
    toast.success('AI generated SEO metadata applied');
  }, [seoMetadata, setField, toast]);

  const handleCategoriesSuggested = useCallback((suggested: string[]) => {
    const merged = [...new Set([...categories, ...suggested])].slice(0, 10);
    setField('categories', merged);
    toast.success(`${suggested.length} category suggestions added`);
  }, [categories, setField, toast]);

  // Visibility toggle
  const handleVisibilityToggle = (key: keyof PersonalVisibilityConfig, value: boolean) => {
    setField('visibility_config', { ...visibilityConfig, [key]: value });
  };

  // Theme selection
  const handleThemeSelect = useCallback((themeId: string) => {
    setField('background_theme', themeId);
    const theme = PREBUILT_THEMES.find(t => t.theme_id === themeId);
    setSelectedTheme(theme || null);
    if (themeCustomization && themeId !== backgroundTheme) {
      setThemeCustomization(null);
      setShowCustomization(false);
    }
  }, [backgroundTheme, themeCustomization, setField]);

  const handleThemeCustomizationChange = useCallback((customization: Record<string, any>) => {
    setThemeCustomization(customization);
  }, []);

  const handleThemeReset = useCallback(() => {
    setThemeCustomization(null);
  }, []);

  // Preview data from context
  const previewData = useMemo(() => editorState.profile, [editorState.profile]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-text-tertiary" />
      </div>
    );
  }

  // No workspace state
  if (!workspaceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-text-secondary">
        <User className="w-12 h-12 mb-4 opacity-50" />
        <p>Please select a workspace to manage your profile.</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col lg:flex-row gap-6 ${className || ''}`}>
      {/* Form Panel (~60%) */}
      <div className="w-full lg:w-[60%] space-y-6">
        {/* Auto-save status bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ProfileStatusBar personalProfile={previewData} section="personal" />
          </div>
          <div className="flex items-center gap-3">
            <AutoSaveStatus isSaving={isSaving} lastSavedAt={lastSavedAt} isDirty={editorState.isDirty} />
            {!profileExists && (
              <AppButton onClick={handleCreateProfile} disabled={editorState.isSaving} size="sm">
                Create Profile
              </AppButton>
            )}
            {profileExists && profile && (
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.open(personalProfileService.getPublicProfileUrl(profile.slug), '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                View
              </AppButton>
            )}
          </div>
        </div>

        {/* Avatar Section */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Profile Photo</h2>
            <VisibilityToggle
              isVisible={visibilityConfig.avatar_url ?? true}
              onChange={(v) => handleVisibilityToggle('avatar_url', v)}
            />
          </div>
          <AvatarUploader
            currentAvatarUrl={avatarUrl}
            displayName={displayName || 'User'}
            onUpload={handleAvatarUpload}
            onDelete={handleAvatarDelete}
            isUploading={isUploadingAvatar}
          />
        </section>

        {/* Basic Info */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Display Name <span className="text-error">*</span>
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.display_name ?? true}
                  onChange={(v) => handleVisibilityToggle('display_name', v)}
                />
              </div>
              <AppInput
                value={displayName}
                onChange={(e) => setField('display_name', e.target.value)}
                placeholder="Your name"
                error={fieldErrors.displayName}
                isRequired
                leftIcon={<User className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Professional Title</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.profile_title ?? true}
                  onChange={(v) => handleVisibilityToggle('profile_title', v)}
                />
              </div>
              <AppInput
                value={profileTitle}
                onChange={(e) => setField('profile_title', e.target.value)}
                placeholder="e.g., Wedding Photographer & Filmmaker"
                leftIcon={<FileText className="w-5 h-5" />}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Profile URL <span className="text-error">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-text-tertiary text-sm">{personalProfileService.getPublicUrlPrefix()}</span>
                <div className="flex-1">
                  <AppInput
                    value={slug}
                    onChange={(e) => setField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="your-name"
                    error={slugError || fieldErrors.slug}
                    rightIcon={
                      isCheckingSlug ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : slugAvailable === true ? (
                        <span className="text-success text-xs">Available</span>
                      ) : slugAvailable === false ? (
                        <span className="text-error text-xs">Taken</span>
                      ) : null
                    }
                  />
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Bio</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.bio ?? true}
                  onChange={(v) => handleVisibilityToggle('bio', v)}
                />
              </div>
              <AppTextarea
                value={bio}
                onChange={(e) => setField('bio', e.target.value)}
                placeholder="Tell visitors about yourself and your photography style..."
                rows={4}
                error={fieldErrors.bio}
                helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters`}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Location</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.location ?? true}
                  onChange={(v) => handleVisibilityToggle('location', v)}
                />
              </div>
              <AppInput
                value={location}
                onChange={(e) => setField('location', e.target.value)}
                placeholder="Based in Berlin - Available Worldwide"
                leftIcon={<MapPin className="w-5 h-5" />}
              />
            </div>
          </div>
        </section>

        {/* Contact Info */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Contact Information</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Email <span className="text-error">*</span>
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.email ?? true}
                  onChange={(v) => handleVisibilityToggle('email', v)}
                />
              </div>
              <AppInput
                type="email"
                value={email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="your@email.com"
                error={fieldErrors.email}
                isRequired
                leftIcon={<Mail className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Phone</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.phone ?? true}
                  onChange={(v) => handleVisibilityToggle('phone', v)}
                />
              </div>
              <AppInput
                type="tel"
                value={phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
                leftIcon={<Phone className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Website</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.website ?? true}
                  onChange={(v) => handleVisibilityToggle('website', v)}
                />
              </div>
              <AppInput
                type="url"
                value={website}
                onChange={(e) => setField('website', e.target.value)}
                placeholder="https://your-website.com"
                leftIcon={<Globe className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">Booking Calendar</label>
                <VisibilityToggle
                  isVisible={visibilityConfig.booking_calendar ?? true}
                  onChange={(v) => handleVisibilityToggle('booking_calendar', v)}
                />
              </div>
              <AppInput
                type="url"
                value={bookingCalendarUrl}
                onChange={(e) => setField('booking_calendar_url', e.target.value)}
                placeholder="https://calendly.com/your-name"
                leftIcon={<Calendar className="w-5 h-5" />}
              />
            </div>
          </div>
        </section>

        {/* Social Media */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Social Media</h2>
          <div className="space-y-4">
            {SOCIAL_PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              const visibilityKey = `socials_${platform.key}` as keyof PersonalVisibilityConfig;
              return (
                <div key={platform.key}>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-text-primary">{platform.label}</label>
                    <VisibilityToggle
                      isVisible={visibilityConfig[visibilityKey] ?? true}
                      onChange={(v) => handleVisibilityToggle(visibilityKey, v)}
                    />
                  </div>
                  <AppInput
                    value={socials[platform.key] || ''}
                    onChange={(e) =>
                      setField('socials', { ...socials, [platform.key]: e.target.value })
                    }
                    placeholder={platform.placeholder}
                    leftIcon={<Icon className="w-5 h-5" />}
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Categories */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Categories</h2>
              <p className="text-text-secondary text-sm">Select up to 10 categories that describe your services.</p>
            </div>
            <VisibilityToggle
              isVisible={visibilityConfig.categories ?? true}
              onChange={(v) => handleVisibilityToggle('categories', v)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  categories.includes(category)
                    ? 'bg-primary text-white'
                    : 'bg-surface-hover text-text-secondary hover:text-text-primary'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        {/* Custom Links */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Custom Links</h2>
            <div className="flex items-center gap-2">
              <VisibilityToggle
                isVisible={visibilityConfig.custom_links ?? true}
                onChange={(v) => handleVisibilityToggle('custom_links', v)}
              />
              <AppButton type="button" variant="outline" size="sm" onClick={addCustomLink} disabled={customLinks.length >= 10}>
                <Plus className="w-4 h-4 mr-1" />
                Add Link
              </AppButton>
            </div>
          </div>
          <div className="space-y-4">
            {customLinks.map((link, index) => (
              <div key={index} className="flex gap-2">
                <AppInput
                  placeholder="Label"
                  value={link.label}
                  onChange={(e) => updateCustomLink(index, 'label', e.target.value)}
                  className="flex-1"
                />
                <AppInput
                  placeholder="https://..."
                  value={link.url}
                  onChange={(e) => updateCustomLink(index, 'url', e.target.value)}
                  className="flex-[2]"
                />
                <AppButton type="button" variant="ghost" size="icon" onClick={() => removeCustomLink(index)}>
                  <Trash2 className="w-4 h-4 text-error" />
                </AppButton>
              </div>
            ))}
            {customLinks.length === 0 && (
              <p className="text-text-tertiary text-sm text-center py-4">No custom links added yet.</p>
            )}
          </div>
        </section>

        {/* Branding */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Branding</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">Background Theme</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-max">
                {PREBUILT_THEMES.map((theme) => (
                  <ThemePreviewCard
                    key={theme.theme_id}
                    theme={theme}
                    isSelected={backgroundTheme === theme.theme_id}
                    onSelect={handleThemeSelect}
                  />
                ))}
              </div>
              <p className="text-xs text-text-secondary mt-3">
                Selected: <span className="font-medium text-text-primary">{PREBUILT_THEMES.find(t => t.theme_id === backgroundTheme)?.name}</span>
              </p>

              {selectedTheme && (
                <button
                  type="button"
                  onClick={() => setShowCustomization(!showCustomization)}
                  className="mt-3 text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {showCustomization ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Customize Theme
                </button>
              )}

              {showCustomization && selectedTheme && (
                <div className="mt-4 border border-border rounded-xl p-4 bg-surface-hover/30">
                  <ThemeCustomization
                    theme={selectedTheme}
                    customization={themeCustomization}
                    onChange={handleThemeCustomizationChange}
                    onReset={handleThemeReset}
                  />
                </div>
              )}
            </div>

            {/* Gradient Color Picker for accent color */}
            <div>
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                {showColorPicker ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Accent Color
              </button>
              {showColorPicker && (
                <div className="mt-3 border border-border rounded-xl p-4 bg-surface-hover/30">
                  <GradientColorPicker
                    value={(p.brand_color as string) || '#3B82F6'}
                    onChange={(val) => setField('brand_color', val)}
                    label="Profile Accent Color"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section Order (DnD) */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <button
            type="button"
            onClick={() => setShowSectionOrder(!showSectionOrder)}
            className="flex items-center gap-2 w-full text-left"
          >
            {showSectionOrder ? <ChevronDown className="w-5 h-5 text-text-secondary" /> : <ChevronRight className="w-5 h-5 text-text-secondary" />}
            <h2 className="text-lg font-semibold text-text-primary">Section Order</h2>
          </button>
          {showSectionOrder && (
            <div className="mt-4">
              <p className="text-text-secondary text-sm mb-3">Drag sections to reorder how they appear on your public profile.</p>
              <DndSectionList />
            </div>
          )}
        </section>

        {/* Public Toggle */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Public Profile</h2>
              <p className="text-text-secondary text-sm mt-1">
                Make your profile visible at {personalProfileService.getPublicProfileUrl(profile?.slug || slug || 'your-slug')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isPublic}
              onClick={() => setField('is_public', !isPublic)}
              title={isPublic ? 'Enabled' : 'Disabled'}
              className={`
                group relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500
                aria-checked:bg-green-500 aria-checked:hover:bg-green-600
              `}
            >
              <span className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                translate-x-1 group-aria-checked:translate-x-6
              `} />
            </button>
          </div>
        </section>
      </div>

      {/* Preview Panel (~40%) */}
      <div className="w-full lg:w-[40%] lg:sticky lg:top-6 h-fit">
        <DeviceFramePreview>
          <PublicProfileRenderer
            profileData={editorState.profile}
            profileType="personal"
            themeId={backgroundTheme}
            sectionOrder={editorState.sectionOrder}
          />
        </DeviceFramePreview>
      </div>

      {/* AI Assistant (floating button) */}
      {workspaceId && (
        <PersonalProfileAIAssistant
          workspaceId={workspaceId}
          profileData={previewData}
          onBioGenerated={handleBioGenerated}
          onTaglineGenerated={handleTaglineGenerated}
          onSEOGenerated={handleSEOGenerated}
          onCategoriesSuggested={handleCategoriesSuggested}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported wrapper component with ProfileEditorProvider
// ---------------------------------------------------------------------------

export function PersonalProfileTabContent({ className }: TabContentProps) {
  return (
    <ProfileEditorProvider
      initialProfile={{}}
      profileType="personal"
      initialSectionOrder={['header', 'bio', 'contact', 'socials']}
    >
      <PersonalProfileEditorInner className={className} />
    </ProfileEditorProvider>
  );
}

export default PersonalProfileTabContent;
