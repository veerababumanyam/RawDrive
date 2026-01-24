/**
 * PersonalProfileTabContent Component
 *
 * Tab content for creating and editing Personal Profile Digital Visiting Cards.
 * Displays a form on the left and a preview on the right (stacked on mobile).
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Image,
  Save,
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
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToastActions } from '../ui/Toast';
import { AppButton } from '../ui/AppButton';
import { AppInput, AppTextarea } from '../ui/AppInput';
import { AvatarUploader } from './AvatarUploader';
import { PersonalProfilePreview } from './PersonalProfilePreview';
import { PersonalProfileAIAssistant } from './PersonalProfileAIAssistant';
import { VisibilityToggle } from './VisibilityToggle';
import { ThemePreviewCard } from './ThemePreviewCard';
import { ThemeCustomization } from '../features/settings/ThemeCustomization';
import { ProfileStatusBar } from '../profile/ProfileStatusBar';
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


export function PersonalProfileTabContent({ className }: TabContentProps) {
  const { workspace, isLoading: isAuthLoading } = useAuth();
  const workspaceId = workspace?.workspace_id;
  const toast = useToastActions();

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [profileExists, setProfileExists] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [profileTitle, setProfileTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [backgroundTheme, setBackgroundTheme] = useState<BackgroundTheme>('theme-clean-slate');
  const [selectedTheme, setSelectedTheme] = useState(PREBUILT_THEMES.find(t => t.theme_id === 'theme-clean-slate') || null);
  const [themeCustomization, setThemeCustomization] = useState<Record<string, any> | null>(null);
  const [showCustomization, setShowCustomization] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [embeddedMedia, setEmbeddedMedia] = useState<EmbeddedMedia>({});
  const [bookingCalendarUrl, setBookingCalendarUrl] = useState('');
  const [visibilityConfig, setVisibilityConfig] = useState<Partial<PersonalVisibilityConfig>>({});
  const [seoMetadata, setSeoMetadata] = useState<SEOMetadata>({});

  // Secondary contacts
  const [secondaryEmails, setSecondaryEmails] = useState<SecondaryContact[]>([]);
  const [secondaryPhones, setSecondaryPhones] = useState<SecondaryContact[]>([]);

  // Validation
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugError, setSlugError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Load profile on mount
  useEffect(() => {
    // Wait for auth to finish loading before checking workspace
    if (isAuthLoading) {
      return;
    }

    if (!workspaceId) {
      setIsLoading(false);
      return;
    }

    const loadProfile = async () => {
      setIsLoading(true);
      try {
        // Check if profile exists
        const existsResponse = await personalProfileService.checkProfileExists(workspaceId);
        setProfileExists(existsResponse.exists);

        if (existsResponse.exists) {
          // Load existing profile
          const profileData = await personalProfileService.getProfile(workspaceId);
          setProfile(profileData);
          populateFormFromProfile(profileData);
        } else {
          // Get prefill data for new profile
          const prefill = await personalProfileService.getPrefillData(workspaceId);
          setDisplayName(prefill.display_name || '');
          setEmail(prefill.email || '');
          setPhone(prefill.phone || '');
          setBio(prefill.bio || '');
          setAvatarUrl(prefill.avatar_url || '');
          setLocation(prefill.location || '');
          // Generate initial slug from name
          if (prefill.display_name) {
            setSlug(personalProfileService.generateSlugFromName(prefill.display_name));
          }
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

  // Populate form from profile data
  const populateFormFromProfile = (data: PersonalProfile) => {
    setDisplayName(data.display_name || '');
    setProfileTitle(data.profile_title || '');
    setSlug(data.slug || '');
    setEmail(data.email || '');
    setPhone(data.phone || '');
    setWebsite(data.website || '');
    setBio(data.bio || '');
    setLocation(data.location || '');
    setAvatarUrl(data.avatar_url || '');
    setSocials(data.socials || {});
    setCustomLinks(data.custom_links || []);
    setCategories(data.categories || []);
    setServiceAreas(data.service_areas || []);
    const themeId = data.background_theme || 'theme-clean-slate';
    setBackgroundTheme(themeId);
    // Also update selectedTheme to keep them in sync
    const theme = PREBUILT_THEMES.find(t => t.theme_id === themeId);
    setSelectedTheme(theme || null);
    setIsPublic(data.is_public || false);
    setEmbeddedMedia(data.embedded_media || {});
    setBookingCalendarUrl(data.booking_calendar_url || '');
    setVisibilityConfig(data.visibility_config || {});
    setSeoMetadata(data.seo_metadata || {});
    setSecondaryEmails(data.secondary_emails || []);
    setSecondaryPhones(data.secondary_phones || []);
  };

  // Check slug availability with debounce
  useEffect(() => {
    if (!workspaceId || !slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugError('');
      return;
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      setSlugError('Only lowercase letters, numbers, and hyphens allowed');
      setSlugAvailable(false);
      return;
    }

    // Skip check if slug matches current profile
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

  // Validate form
  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};

    if (displayName.length < CONSTRAINTS.displayName.min) {
      errors.displayName = 'Display name is required';
    } else if (displayName.length > CONSTRAINTS.displayName.max) {
      errors.displayName = `Max ${CONSTRAINTS.displayName.max} characters`;
    }

    if (slug.length < CONSTRAINTS.slug.min) {
      errors.slug = 'Slug must be at least 3 characters';
    } else if (slug.length > CONSTRAINTS.slug.max) {
      errors.slug = `Max ${CONSTRAINTS.slug.max} characters`;
    } else if (!slugAvailable && profile?.slug !== slug) {
      errors.slug = 'This URL is not available';
    }

    if (!email) {
      errors.email = 'Email is required';
    }

    if (bio.length > CONSTRAINTS.bio.max) {
      errors.bio = `Max ${CONSTRAINTS.bio.max} characters`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [displayName, slug, email, bio, slugAvailable, profile?.slug]);

  // Handle save
  const handleSave = async () => {
    if (!workspaceId) return;

    if (!validateForm()) {
      toast.error('Please fix the validation errors');
      return;
    }

    setIsSaving(true);
    try {
      const data: CreatePersonalProfileRequest | UpdatePersonalProfileRequest = {
        display_name: displayName,
        profile_title: profileTitle || undefined,
        slug,
        email,
        phone: phone || undefined,
        website: website || undefined,
        bio: bio || undefined,
        location: location || undefined,
        socials: Object.keys(socials).length > 0 ? socials : undefined,
        custom_links: customLinks.length > 0 ? customLinks : undefined,
        categories: categories.length > 0 ? categories : undefined,
        service_areas: serviceAreas.length > 0 ? serviceAreas : undefined,
        background_theme: backgroundTheme || undefined,
        is_public: isPublic,
        embedded_media: Object.keys(embeddedMedia).length > 0 ? embeddedMedia : undefined,
        booking_calendar_url: bookingCalendarUrl || undefined,
        visibility_config: Object.keys(visibilityConfig).length > 0 ? visibilityConfig : undefined,
        seo_metadata: Object.keys(seoMetadata).length > 0 ? seoMetadata : undefined,
        secondary_emails: secondaryEmails.length > 0 ? secondaryEmails : undefined,
        secondary_phones: secondaryPhones.length > 0 ? secondaryPhones : undefined,
      };

      let result: PersonalProfile;
      if (profileExists) {
        result = await personalProfileService.updateProfile(workspaceId, data);
        toast.success('Profile updated successfully');
      } else {
        result = await personalProfileService.createProfile(workspaceId, data as CreatePersonalProfileRequest);
        setProfileExists(true);
        toast.success('Profile created successfully');
      }

      setProfile(result);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle avatar upload
  const handleAvatarUpload = async (file: File) => {
    if (!workspaceId) return;

    setIsUploadingAvatar(true);
    try {
      const result = await personalProfileService.uploadAvatar(workspaceId, file);
      setAvatarUrl(result.avatar_url);
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
      setAvatarUrl('');
      toast.success('Avatar removed');
    } catch {
      toast.error('Failed to remove avatar');
    }
  };

  // Add custom link
  const addCustomLink = () => {
    if (customLinks.length >= 10) {
      toast.error('Maximum 10 custom links allowed');
      return;
    }
    setCustomLinks([...customLinks, { label: '', url: '' }]);
  };

  // Remove custom link
  const removeCustomLink = (index: number) => {
    setCustomLinks(customLinks.filter((_, i) => i !== index));
  };

  // Update custom link
  const updateCustomLink = (index: number, field: keyof CustomLink, value: string) => {
    const updated = [...customLinks];
    updated[index] = { ...updated[index], [field]: value };
    setCustomLinks(updated);
  };

  // Toggle category
  const toggleCategory = (category: string) => {
    if (categories.includes(category)) {
      setCategories(categories.filter((c) => c !== category));
    } else if (categories.length < 10) {
      setCategories([...categories, category]);
    } else {
      toast.error('Maximum 10 categories allowed');
    }
  };

  // AI callback handlers
  const handleBioGenerated = useCallback((bio: string) => {
    setBio(bio);
    toast.success('AI generated bio applied');
  }, [toast]);

  const handleTaglineGenerated = useCallback((tagline: string) => {
    setProfileTitle(tagline);
    toast.success('AI generated tagline applied to Professional Title');
  }, [toast]);

  const handleSEOGenerated = useCallback((seo: OptimizeSEOResponse) => {
    setSeoMetadata((prev) => ({
      ...prev,
      meta_title: seo.meta_title,
      meta_description: seo.meta_description,
    }));
    toast.success('AI generated SEO metadata applied');
  }, [toast]);

  const handleCategoriesSuggested = useCallback((suggested: string[]) => {
    // Merge with existing categories, up to 10
    const merged = [...new Set([...categories, ...suggested])].slice(0, 10);
    setCategories(merged);
    toast.success(`${suggested.length} category suggestions added`);
  }, [categories, toast]);

  // Handle visibility toggle
  const handleVisibilityToggle = (key: keyof PersonalVisibilityConfig, value: boolean) => {
    setVisibilityConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle theme selection
  const handleThemeSelect = useCallback((themeId: string) => {
    setBackgroundTheme(themeId as BackgroundTheme);
    const theme = PREBUILT_THEMES.find(t => t.theme_id === themeId);
    setSelectedTheme(theme || null);
    // Clear customization when switching themes
    if (themeCustomization && themeId !== backgroundTheme) {
      setThemeCustomization(null);
      setShowCustomization(false);
    }
  }, [backgroundTheme, themeCustomization]);

  // Handle theme customization change
  const handleThemeCustomizationChange = useCallback((customization: Record<string, any>) => {
    setThemeCustomization(customization);
  }, []);

  // Handle theme reset
  const handleThemeReset = useCallback(() => {
    setThemeCustomization(null);
  }, []);

  // Get preview data
  const previewData = useMemo(
    () => ({
      display_name: displayName,
      profile_title: profileTitle,
      slug,
      email,
      phone,
      website,
      bio,
      location,
      avatar_url: avatarUrl,
      socials,
      custom_links: customLinks,
      categories,
      service_areas: serviceAreas,
      background_theme: backgroundTheme,
      is_public: isPublic,
      embedded_media: embeddedMedia,
      booking_calendar_url: bookingCalendarUrl,
      visibility_config: visibilityConfig,
      secondary_emails: secondaryEmails,
      secondary_phones: secondaryPhones,
      is_verified: profile?.is_verified || false,
      badges: profile?.badges || [],
    }),
    [
      displayName,
      profileTitle,
      slug,
      email,
      phone,
      website,
      bio,
      location,
      avatarUrl,
      socials,
      customLinks,
      categories,
      serviceAreas,
      backgroundTheme,
      isPublic,
      embeddedMedia,
      bookingCalendarUrl,
      visibilityConfig,
      secondaryEmails,
      secondaryPhones,
      profile,
    ]
  );

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
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${className || ''}`}>
      {/* Form Panel */}
      <div className="space-y-6">
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
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold text-text-primary">Basic Information</h2>
            <ProfileStatusBar
              personalProfile={previewData}
              section="personal"
            />
          </div>
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
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                error={fieldErrors.displayName}
                isRequired
                leftIcon={<User className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Professional Title
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.profile_title ?? true}
                  onChange={(v) => handleVisibilityToggle('profile_title', v)}
                />
              </div>
              <AppInput
                value={profileTitle}
                onChange={(e) => setProfileTitle(e.target.value)}
                placeholder="e.g., Wedding Photographer & Filmmaker"
                leftIcon={<FileText className="w-5 h-5" />}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">
                Profile URL <span className="text-error">*</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-text-tertiary text-sm">
                  {personalProfileService.getPublicUrlPrefix()}
                </span>
                <div className="flex-1">
                  <AppInput
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
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
                <label className="block text-sm font-medium text-text-primary">
                  Bio
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.bio ?? true}
                  onChange={(v) => handleVisibilityToggle('bio', v)}
                />
              </div>
              <AppTextarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell visitors about yourself and your photography style..."
                rows={4}
                error={fieldErrors.bio}
                helperText={`${bio.length}/${CONSTRAINTS.bio.max} characters`}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Location
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.location ?? true}
                  onChange={(v) => handleVisibilityToggle('location', v)}
                />
              </div>
              <AppInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
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
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                error={fieldErrors.email}
                isRequired
                leftIcon={<Mail className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Phone
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.phone ?? true}
                  onChange={(v) => handleVisibilityToggle('phone', v)}
                />
              </div>
              <AppInput
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 123-4567"
                leftIcon={<Phone className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Website
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.website ?? true}
                  onChange={(v) => handleVisibilityToggle('website', v)}
                />
              </div>
              <AppInput
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://your-website.com"
                leftIcon={<Globe className="w-5 h-5" />}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-text-primary">
                  Booking Calendar
                </label>
                <VisibilityToggle
                  isVisible={visibilityConfig.booking_calendar ?? true}
                  onChange={(v) => handleVisibilityToggle('booking_calendar', v)}
                />
              </div>
              <AppInput
                type="url"
                value={bookingCalendarUrl}
                onChange={(e) => setBookingCalendarUrl(e.target.value)}
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
                    <label className="block text-sm font-medium text-text-primary">
                      {platform.label}
                    </label>
                    <VisibilityToggle
                      isVisible={visibilityConfig[visibilityKey] ?? true}
                      onChange={(v) => handleVisibilityToggle(visibilityKey, v)}
                    />
                  </div>
                  <AppInput
                    value={socials[platform.key] || ''}
                    onChange={(e) =>
                      setSocials((prev) => ({
                        ...prev,
                        [platform.key]: e.target.value,
                      }))
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
              <p className="text-text-secondary text-sm">
                Select up to 10 categories that describe your services.
              </p>
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
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${categories.includes(category)
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
              <AppButton
                type="button"
                variant="outline"
                size="sm"
                onClick={addCustomLink}
                disabled={customLinks.length >= 10}
              >
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
                <AppButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCustomLink(index)}
                >
                  <Trash2 className="w-4 h-4 text-error" />
                </AppButton>
              </div>
            ))}
            {customLinks.length === 0 && (
              <p className="text-text-tertiary text-sm text-center py-4">
                No custom links added yet.
              </p>
            )}
          </div>
        </section>

        {/* Branding (Simplified to just Background Theme) */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6">Branding</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-3">
                Background Theme
              </label>
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

              {/* Customize button */}
              {selectedTheme && (
                <button
                  type="button"
                  onClick={() => setShowCustomization(!showCustomization)}
                  className="mt-3 text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {showCustomization ? '▼' : '▶'} Customize Theme
                </button>
              )}

              {/* Customization panel */}
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
          </div>
        </section>

        {/* Public Toggle & Save */}
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
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
              onClick={() => setIsPublic(!isPublic)}
              title={isPublic ? 'Enabled' : 'Disabled'}
              className={`
                group
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors 
                bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500
                aria-checked:bg-green-500 aria-checked:hover:bg-green-600
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform 
                  translate-x-1 group-aria-checked:translate-x-6
                `}
              />
            </button>
          </div>

          <div className="flex justify-end gap-3">
            {profileExists && profile && (
              <AppButton
                type="button"
                variant="outline"
                onClick={() => window.open(personalProfileService.getPublicProfileUrl(profile.slug), '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Public Profile
              </AppButton>
            )}
            <AppButton onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {profileExists ? 'Save Changes' : 'Create Profile'}
                </>
              )}
            </AppButton>
          </div>
        </section>
      </div>

      {/* Preview Panel */}
      <div className="lg:sticky lg:top-6 h-fit">
        {/* Preview */}
        <PersonalProfilePreview data={previewData} />
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

export default PersonalProfileTabContent;
