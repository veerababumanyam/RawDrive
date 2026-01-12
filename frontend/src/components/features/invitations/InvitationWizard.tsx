/**
 * InvitationWizard: Multi-step wizard for creating digital invitations
 *
 * Steps:
 * 1. Event Details - title, date, venue, host info
 * 2. Template Selection - browse and customize templates
 * 3. RSVP Settings - configure RSVP options
 *
 * Feature: 016-save-the-date
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  MapPin,
  Users,
  Palette,
  Settings,
  Loader2,
  Languages,
  ChevronRight,
  Video,
  Music,
  Wand2,
  LayoutTemplate,
  CreditCard,
  Image as ImageIcon,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput, AppTextarea } from '@/components/ui/AppInput';
import { AppCard } from '@/components/ui/AppCard';
import { DateTimePicker } from '@/components/invitations/DateTimePicker';
import { VenueInput } from '@/components/invitations/VenueInput';
import { ColorPicker } from '@/components/invitations/ColorPicker';
import { FontSelector } from '@/components/invitations/FontSelector';
import { LayoutDensitySelector } from '@/components/invitations/LayoutDensitySelector';
import { InvitationFontSelector, type CustomFont } from '@/components/features/invitations/InvitationFontSelector';
import { MediaUploader } from '@/components/features/media/MediaUploader';
import { RSVPQuestionBuilder } from '@/components/features/invitations/RSVPQuestionBuilder';
import { AITextGenerator } from '@/components/features/invitations/AITextGenerator';
import {
  Select,
  Checkbox,
  Toggle,
  RadioGroup,
  Radio,
} from '@/components/ui/FormControls';
import * as invitationService from '@/services/invitationService';
import { SUPPORTED_LANGUAGES } from '@/i18n/config';
import type {
  EventType,
  VenueInfo,
  RSVPSettings,
  RSVPCustomQuestion,
  InvitationTemplate,
  InvitationMedia,
  LayoutConfig,
  TaglineConfig,
} from '@/types/invitations';
import { TaglineEditor } from '@/components/features/invitations/TaglineEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardData {
  // Step 1: Event Details
  title: string;
  description?: string;
  event_type: string;
  event_datetime: string;
  event_end_datetime?: string;
  event_timezone: string;
  venue: VenueInfo;
  host_names: string[];
  host_contact_phone?: string;
  host_contact_email?: string;
  primary_language: string;
  secondary_language?: string;

  // Metadata
  invitation_id?: string;
  slug?: string;

  // Step 2: Template & Design
  template_id?: string;
  customization: Record<string, unknown> & {
    tagline?: TaglineConfig;
    layout_config?: LayoutConfig;
    colors?: Record<string, string>;
  };
  font_heading?: string;
  font_body?: string;
  layout_density?: 'compact' | 'normal' | 'spacious';
  video_object_key?: string;
  video_url?: string;
  audio_object_key?: string;
  audio_url?: string;
  main_card_object_key?: string;
  main_card_url?: string;

  // Step 3: RSVP Settings
  rsvp_settings: RSVPSettings;
  notification_preference?: 'immediate' | 'daily_digest' | 'disabled';
}

interface InvitationWizardProps {
  workspaceId: string;
  currentStep: number;
  data: WizardData;
  onNext: (stepData: Partial<WizardData>) => void;
  onStepChange: (step: number) => void;
  onComplete: (finalData: Partial<WizardData>) => void;
  onDataChange: (data: Partial<WizardData>) => void;
  isSubmitting: boolean;
  onCreateDraft?: () => Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPES: Array<{ value: EventType; label: string }> = [
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'anniversary', label: 'Anniversary' },
  { value: 'baby_shower', label: 'Baby Shower' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'festival', label: 'Festival' },
  { value: 'corporate', label: 'Corporate Event' },
  { value: 'other', label: 'Other' },
];

/** Template category filter includes 'all' option to show all templates */
const TEMPLATE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'festival', label: 'Festival' },
  { value: 'corporate', label: 'Corporate' },
];

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'London (GMT)' },
  { value: 'Europe/Paris', label: 'Central European (CET)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEDT)' },
];

/**
 * Supported languages with native script labels.
 * Font CSS classes are in index.css (font-lang-{code}).
 * Derived from centralized SUPPORTED_LANGUAGES in i18n/config.ts
 * Feature: 019-invitation-indian-languages
 */
const LANGUAGES = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang.code,
  label: lang.name,
  nativeLabel: lang.nativeName,
  fontClass: `font-lang-${lang.code}`,
  dir: lang.dir,
}));

const COUNTRIES = [
  { value: 'India', label: 'India' },
  { value: 'United States', label: 'United States' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'UAE', label: 'United Arab Emirates' },
];

/**
 * Get preview text in the selected language for font demonstration.
 * Shows "You are cordially invited" in each supported language.
 */
const getLanguagePreviewText = (langCode: string): string => {
  const previews: Record<string, string> = {
    en: 'You are cordially invited',
    hi: 'आप सादर आमंत्रित हैं',
    mr: 'आपणास हार्दिक निमंत्रण आहे',
    ta: 'நீங்கள் அன்புடன் அழைக்கப்படுகிறீர்கள்',
    te: 'మీకు ఆహ్వానం పంపబడుతోంది',
    kn: 'ನಿಮ್ಮನ್ನು ಪ್ರೀತಿಯಿಂದ ಆಹ್ವಾನಿಸಲಾಗಿದೆ',
    ml: 'നിങ്ങളെ സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു',
    bn: 'আপনাকে সাদর আমন্ত্রণ জানাচ্ছি',
    as: 'আপোনাক আন্তৰিকতাৰে নিমন্ত্ৰণ জনাইছোঁ',
    gu: 'તમને હૃદયપૂર્વક આમંત્રણ છે',
    or: 'ଆପଣଙ୍କୁ ସାଦର ନିମନ୍ତ୍ରଣ',
    pa: 'ਤੁਹਾਨੂੰ ਦਿਲੋਂ ਸੱਦਾ ਹੈ',
    ur: 'آپ کو خلوص سے مدعو کیا جاتا ہے',
  };
  return previews[langCode] || previews.en;
};

// ---------------------------------------------------------------------------
// Step 1: Event Details
// ---------------------------------------------------------------------------

interface Step1Props {
  data: WizardData;
  onChange: (data: Partial<WizardData>) => void;
  onNext: () => void;
  errors: Record<string, string>;
  workspaceId: string;
}

const Step1EventDetails: React.FC<Step1Props> = ({
  data,
  onChange,
  onNext,
  errors,
  workspaceId,
}) => {
  const [hostInput, setHostInput] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);

  const addHost = useCallback(() => {
    const trimmed = hostInput.trim();
    if (trimmed && !data.host_names.includes(trimmed)) {
      onChange({ host_names: [...data.host_names, trimmed] });
      setHostInput('');
    }
  }, [hostInput, data.host_names, onChange]);

  const removeHost = useCallback(
    (index: number) => {
      onChange({
        host_names: data.host_names.filter((_, i) => i !== index),
      });
    },
    [data.host_names, onChange]
  );

  const handleHostKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addHost();
    }
  };

  return (
    <div className="space-y-8">
      {/* Basic Info */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Event Information
        </h3>

        <div className="space-y-4">
          <AppInput
            label="Event Title"
            placeholder="e.g., Sarah & John's Wedding"
            value={data.title}
            onChange={(e) => onChange({ title: e.target.value })}
            error={errors.title}
            isRequired
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Event Type"
              options={EVENT_TYPES}
              value={data.event_type}
              onChange={(e) => onChange({ event_type: e.target.value })}
              error={errors.event_type}
            />
          </div>

          <div className="pt-2 pb-4">
            <TaglineEditor
              tagline={data.customization.tagline}
              eventType={data.event_type}
              workspaceId={workspaceId}
              onChange={(newTagline) => {
                onChange({
                  customization: {
                    ...data.customization,
                    tagline: newTagline,
                  }
                });
              }}
            />
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-text-primary">
                Description <span className="text-text-tertiary font-normal">(Optional)</span>
              </label>
              <AppButton
                variant="ghost"
                size="sm"
                onClick={() => setShowAIModal(true)}
                className="text-primary h-7 px-2 -mr-2"
                leftIcon={<Wand2 className="w-3.5 h-3.5" />}
              >
                Magic Write
              </AppButton>
            </div>
            <AppTextarea
              placeholder="Share a brief message about your event..."
              value={data.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={4}
            />

            <AITextGenerator
              isOpen={showAIModal}
              onClose={() => setShowAIModal(false)}
              onApply={(title, description) => {
                onChange({
                  title: title || data.title,
                  description
                });
              }}
              workspaceId={workspaceId}
              initialEventType={data.event_type}
              initialLanguage={data.primary_language}
            />
          </div>
        </div>
      </section>

      {/* Language Settings - Feature: 016-save-the-date Phase 9 */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" />
          Language Settings
        </h3>

        <div className="space-y-4">
          {/* Primary Language Selection */}
          <div>
            <Select
              label="Primary Language"
              options={LANGUAGES.map(lang => ({
                value: lang.value,
                label: `${lang.nativeLabel} (${lang.label})`,
              }))}
              value={data.primary_language}
              onChange={(e) => onChange({ primary_language: e.target.value })}
              placeholder="Select language"
            />
          </div>

          {/* Secondary Language Selection (Optional) */}
          <div>
            <Select
              label="Secondary Language (Optional)"
              options={[
                { value: '', label: 'None (Single language)' },
                ...LANGUAGES.filter(lang => lang.value !== data.primary_language).map(lang => ({
                  value: lang.value,
                  label: `${lang.nativeLabel} (${lang.label})`,
                }))
              ]}
              value={data.secondary_language || ''}
              onChange={(e) => onChange({ secondary_language: e.target.value || undefined })}
              placeholder="Select secondary language"
              helperText="Add a second language for bilingual invitations"
            />
          </div>

          {/* Language Preview */}
          {data.primary_language && (
            <div className="mt-4 p-4 bg-surface-hover rounded-lg">
              <p className="text-xs text-text-tertiary mb-2">Preview</p>
              <div className="space-y-1">
                <p
                  className={`text-lg font-medium text-text-primary font-lang-${data.primary_language}`}
                  data-lang={data.primary_language}
                >
                  {getLanguagePreviewText(data.primary_language)}
                </p>
                {data.secondary_language && (
                  <p
                    className={`text-base text-text-secondary font-lang-${data.secondary_language}`}
                    data-lang={data.secondary_language}
                  >
                    {getLanguagePreviewText(data.secondary_language)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section >

      {/* Date & Time */}
      < section >
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Date & Time
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DateTimePicker
            label="Event Date & Time"
            value={data.event_datetime}
            onChange={(date) => onChange({ event_datetime: date })}
            error={errors.event_datetime}
          />

          <DateTimePicker
            label="End Date & Time (Optional)"
            value={data.event_end_datetime}
            onChange={(date) => onChange({ event_end_datetime: date })}
          />
        </div>

        <div className="mt-4">
          <Select
            label="Timezone"
            options={TIMEZONES}
            value={data.event_timezone}
            onChange={(e) => onChange({ event_timezone: e.target.value })}
          />
        </div>
      </section >

      {/* Venue */}
      < section >
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Venue Details
        </h3>

        <VenueInput
          value={data.venue}
          onChange={(venue) => onChange({ venue })}
        />
      </section >

      {/* Host Info */}
      < section >
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Host Information
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Host Names
            </label>
            <div className="flex gap-2">
              <AppInput
                placeholder="Add a host name..."
                value={hostInput}
                onChange={(e) => setHostInput(e.target.value)}
                onKeyDown={handleHostKeyDown}
                containerClassName="flex-1"
              />
              <AppButton
                variant="outline"
                onClick={addHost}
                disabled={!hostInput.trim()}
              >
                Add
              </AppButton>
            </div>

            {data.host_names.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {data.host_names.map((name, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-surface-hover rounded-full text-sm text-text-primary"
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => removeHost(index)}
                      className="text-text-tertiary hover:text-error ml-1"
                      aria-label={`Remove ${name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AppInput
              label="Contact Phone (Optional)"
              type="tel"
              placeholder="+91 98765 43210"
              value={data.host_contact_phone || ''}
              onChange={(e) =>
                onChange({ host_contact_phone: e.target.value })
              }
            />

            <AppInput
              label="Contact Email (Optional)"
              type="email"
              placeholder="contact@example.com"
              value={data.host_contact_email || ''}
              onChange={(e) =>
                onChange({ host_contact_email: e.target.value })
              }
            />
          </div>
        </div>
      </section >

      {/* Navigation */}
      < div className="flex justify-end pt-6 border-t border-border" >
        <AppButton onClick={onNext} className="min-w-[140px]">
          Continue
          <ChevronRight className="w-4 h-4 ml-1" />
        </AppButton>
      </div >
    </div >
  );
};

// ---------------------------------------------------------------------------
// Step 2: Template Selection
// ---------------------------------------------------------------------------

interface Step2Props {
  workspaceId: string;
  data: WizardData;
  onChange: (data: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
  onCreateDraft: () => Promise<string | undefined>;
}

const Step2TemplateSelection: React.FC<Step2Props> = ({
  workspaceId,
  data,
  onChange,
  onNext,
  onBack,
  onCreateDraft,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLanguageCompatibleOnly, setShowLanguageCompatibleOnly] = useState(false);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [hasRequestedInvitation, setHasRequestedInvitation] = useState(false);
  const [existingMedia, setExistingMedia] = useState<InvitationMedia[]>([]);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', workspaceId, selectedCategory],
    queryFn: () =>
      invitationService.listTemplates(workspaceId, {
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        includeSystem: true,
        includePremium: true,
        limit: 50,
      }),
    enabled: !!workspaceId,
  });

  /**
   * Filter templates by language compatibility.
   * A template is compatible if:
   * 1. It has no supported_languages defined (universal template)
   * 2. It includes the user's primary_language in supported_languages
   * 3. If secondary_language is set, it should also include that
   * Feature: 019-invitation-indian-languages (P3)
   */
  const templates = useMemo(() => {
    const allTemplates = templatesData?.data || [];
    if (!showLanguageCompatibleOnly) return allTemplates;

    return allTemplates.filter((template) => {
      // Universal templates (no supported_languages) work with all languages
      if (!template.supported_languages || template.supported_languages.length === 0) {
        return true;
      }
      // Check primary language compatibility
      const hasPrimary = template.supported_languages.includes(data.primary_language);
      // If secondary language is selected, check that too
      if (data.secondary_language) {
        return hasPrimary && template.supported_languages.includes(data.secondary_language);
      }
      return hasPrimary;
    });
  }, [templatesData?.data, showLanguageCompatibleOnly, data.primary_language, data.secondary_language]);

  const handleSelectTemplate = useCallback(
    (template: InvitationTemplate) => {
      onChange({
        template_id: template.template_id,
        font_heading: template.layout.fonts.heading,
        font_body: template.layout.fonts.body,
        layout_density: 'normal',
        customization: {
          ...data.customization,
          colors: template.layout.colors,
        },
      });
    },
    [data.customization, onChange]
  );

  const colors = (data.customization.colors as Record<string, string>) || {};

  const handleColorChange = (key: string, value: string) => {
    onChange({
      customization: {
        ...data.customization,
        colors: {
          ...colors,
          [key]: value,
        },
      },
    });
  };

  const layoutConfig: LayoutConfig = (data.customization.layout_config as LayoutConfig) || {
    mode: 'standard',
    show_hero_overlay: true,
    show_details_text: true,
  };

  const updateLayoutConfig = (updates: Partial<LayoutConfig>) => {
    onChange({
      customization: {
        ...data.customization,
        layout_config: { ...layoutConfig, ...updates },
      },
    });
  };

  // Ensure an invitation exists once the user reaches Step 2 so media uploads are immediately available
  useEffect(() => {
    if (!workspaceId || data.invitation_id || isCreatingInvitation || hasRequestedInvitation) return;

    setHasRequestedInvitation(true);
    setIsCreatingInvitation(true);
    setCreateError(null);

    onCreateDraft()
      .then((draft) => {
        // If the draft creation returns an ID (which it does via onCreateDraft prop logic in parent),
        // we rely on parent to update data. But here we just catch errors.
        // Actually, looking at parent implementation, onCreateDraft returns promise of string (id).
        // We need the parent to also update the slug.
      })
      .catch((err) => {
        console.error('Failed to auto-create invitation draft', err);
        setCreateError(err?.message || 'Failed to create invitation draft');
      })
      .finally(() => setIsCreatingInvitation(false));
  }, [workspaceId, data.invitation_id, isCreatingInvitation, hasRequestedInvitation, onCreateDraft]);

  // Load existing media for gallery selection
  useEffect(() => {
    if (!workspaceId || !data.invitation_id) return;

    setIsLoadingMedia(true);
    invitationService
      .listMedia(workspaceId, data.invitation_id)
      .then((items) => setExistingMedia(items))
      .catch((err) => {
        console.error('Failed to load invitation media', err);
      })
      .finally(() => setIsLoadingMedia(false));
  }, [workspaceId, data.invitation_id]);

  const handleUploadComplete = useCallback(
    (media: InvitationMedia) => {
      const objectKey = media.object_key || media.original_object_key;
      const resolvedUrl = media.url || media.media_url || media.original_url;
      const updates: Partial<WizardData> = {};

      if (media.purpose === 'main_card') {
        updates.main_card_object_key = objectKey;
        updates.main_card_url = resolvedUrl;
      } else if (media.media_type === 'video') {
        updates.video_object_key = objectKey;
        updates.video_url = resolvedUrl;
      } else if (media.media_type === 'audio') {
        updates.audio_object_key = objectKey;
        updates.audio_url = resolvedUrl;
      } else if (media.media_type === 'image' && media.purpose === 'content') {
        // Treat content images (hero) as video/poster for now, or just cover
        updates.video_object_key = objectKey; // Reuse video key for hero image?
        updates.video_url = resolvedUrl;
      }

      onChange(updates);
      setExistingMedia((prev) => [media, ...prev.filter((m) => m.media_id !== media.media_id)]);
    },
    [onChange]
  );

  return (
    <div className="space-y-8">
      {/* Category Filter */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            Choose a Template
          </h3>

          {/* Language compatibility toggle - Feature: 019-invitation-indian-languages */}
          <button
            type="button"
            onClick={() => setShowLanguageCompatibleOnly(!showLanguageCompatibleOnly)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${showLanguageCompatibleOnly
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
              }`}
            title={showLanguageCompatibleOnly
              ? `Showing templates for ${data.primary_language}${data.secondary_language ? ` + ${data.secondary_language}` : ''}`
              : 'Showing all templates'
            }
          >
            <Languages className="w-4 h-4" />
            <span className="hidden sm:inline">
              {showLanguageCompatibleOnly ? 'Language Match' : 'All Templates'}
            </span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {TEMPLATE_CATEGORIES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setSelectedCategory(type.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${selectedCategory === type.value
                ? 'bg-primary text-white'
                : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </section>

      {/* Template Grid */}
      <section>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-text-secondary">
            {showLanguageCompatibleOnly && (templatesData?.data?.length || 0) > 0 ? (
              <>
                <Languages className="w-10 h-10 mx-auto mb-3 text-text-tertiary" />
                <p className="mb-2">No templates support your selected language(s).</p>
                <p className="text-sm text-text-tertiary mb-4">
                  {LANGUAGES.find(l => l.value === data.primary_language)?.nativeLabel}
                  {data.secondary_language && ` + ${LANGUAGES.find(l => l.value === data.secondary_language)?.nativeLabel}`}
                </p>
                <button
                  type="button"
                  onClick={() => setShowLanguageCompatibleOnly(false)}
                  className="text-primary hover:underline text-sm"
                >
                  Show all templates anyway
                </button>
              </>
            ) : (
              <p>No templates found for this category.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {templates.map((template) => (
              <button
                key={template.template_id}
                type="button"
                onClick={() => handleSelectTemplate(template)}
                className={`relative group rounded-lg overflow-hidden border-2 transition-all ${data.template_id === template.template_id
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-primary/50'
                  }`}
              >
                {/* Thumbnail */}
                <div className="aspect-[3/4] bg-surface-hover">
                  {template.thumbnail_url ? (
                    <img
                      src={template.thumbnail_url}
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${template.layout.colors?.primary || '#6366f1'
                          }, ${template.layout.colors?.secondary || '#8b5cf6'})`,
                      }}
                    >
                      <span className="text-white text-4xl font-serif">
                        {template.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Name */}
                <div className="p-3 bg-surface">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {template.name}
                  </p>
                  {template.is_premium && (
                    <span className="inline-block mt-1 px-2 py-0.5 bg-gold/10 text-gold text-xs rounded-full">
                      Premium
                    </span>
                  )}
                </div>

                {/* Selection indicator */}
                {data.template_id === template.template_id && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Design Customization (if template selected) */}
      {data.template_id && (
        <section className="bg-surface-hover rounded-lg p-6 space-y-8">
          {/* Layout Selection */}
          <div>
            <h4 className="text-base font-medium text-text-primary mb-4 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-primary" />
              Invitation Layout
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Standard Mode */}
              <button
                type="button"
                onClick={() => updateLayoutConfig({ mode: 'standard' })}
                className={`p-3 rounded-lg border-2 text-left transition-all ${layoutConfig.mode === 'standard'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/50 bg-surface'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm text-text-primary">Standard</span>
                </div>
                <p className="text-xs text-text-secondary">Hero video/image with event details below.</p>
              </button>

              {/* Design Card Mode */}
              <button
                type="button"
                onClick={() => updateLayoutConfig({ mode: 'card_only' })}
                className={`p-3 rounded-lg border-2 text-left transition-all ${layoutConfig.mode === 'card_only'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/50 bg-surface'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm text-text-primary">Design Card</span>
                </div>
                <p className="text-xs text-text-secondary">Upload your own full invitation design.</p>
              </button>

              {/* Hybrid Mode */}
              <button
                type="button"
                onClick={() => updateLayoutConfig({ mode: 'hybrid' })}
                className={`p-3 rounded-lg border-2 text-left transition-all ${layoutConfig.mode === 'hybrid'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/50 bg-surface'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex -space-x-1">
                    <Video className="w-4 h-4 text-primary" />
                    <CreditCard className="w-4 h-4 text-primary" />
                  </div>
                  <span className="font-medium text-sm text-text-primary">Cinematic</span>
                </div>
                <p className="text-xs text-text-secondary">Hero video top + design card below.</p>
              </button>
            </div>

            {/* Layout Options */}
            <div className="flex flex-wrap gap-4">
              <Checkbox
                label="Show Title Overlay"
                checked={layoutConfig.show_hero_overlay}
                onChange={(e) => updateLayoutConfig({ show_hero_overlay: e.target.checked })}
                description="Display event title over hero media"
              />
              <Checkbox
                label="Show Event Details"
                checked={layoutConfig.show_details_text}
                onChange={(e) => updateLayoutConfig({ show_details_text: e.target.checked })}
                description="List date, time, and venue text"
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h4 className="text-base font-medium text-text-primary mb-4 flex items-center gap-2">
              <Palette className="w-4 h-4 text-primary" />
              Customize Colors
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <ColorPicker
                label="Primary Color"
                value={colors.primary || '#6366f1'}
                onChange={(c) => handleColorChange('primary', c)}
              />
              <ColorPicker
                label="Secondary Color"
                value={colors.secondary || '#8b5cf6'}
                onChange={(c) => handleColorChange('secondary', c)}
              />
              <ColorPicker
                label="Accent Color"
                value={colors.accent || '#f59e0b'}
                onChange={(c) => handleColorChange('accent', c)}
              />
              <ColorPicker
                label="Background"
                value={colors.background || '#ffffff'}
                onChange={(c) => handleColorChange('background', c)}
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <h4 className="text-base font-medium text-text-primary mb-4 flex items-center gap-2">
              <span className="text-primary font-serif">Aa</span>
              Typography
            </h4>
            <p className="text-sm text-text-secondary mb-4">
              Choose fonts that support your invitation language ({LANGUAGES.find(l => l.value === data.primary_language)?.nativeLabel || 'English'})
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InvitationFontSelector
                languageCode={data.primary_language || 'en'}
                selectedFont={data.font_heading || ''}
                onFontChange={(family, name) => onChange({ font_heading: family })}
                label="Heading Font"
                workspaceId={workspaceId}
                allowCustomUpload={true}
              />
              <InvitationFontSelector
                languageCode={data.primary_language || 'en'}
                selectedFont={data.font_body || ''}
                onFontChange={(family, name) => onChange({ font_body: family })}
                label="Body Font"
                workspaceId={workspaceId}
                allowCustomUpload={true}
              />
            </div>
          </div>

          <div className="border-t border-border pt-6">
            <LayoutDensitySelector
              value={data.layout_density || 'normal'}
              onChange={(density) => onChange({ layout_density: density })}
            />
          </div>

          {/* Dynamic Media Upload Section */}
          <div className="border-t border-border pt-6">
            <h4 className="text-base font-medium text-text-primary mb-4 flex items-center gap-2">
              {layoutConfig.mode === 'card_only' ? (
                <ImageIcon className="w-4 h-4 text-primary" />
              ) : (
                <Video className="w-4 h-4 text-primary" />
              )}
              Invitation Media
            </h4>

            {!data.invitation_id || isCreatingInvitation ? (
              <div className="bg-surface p-4 rounded-lg border border-border text-center space-y-3">
                {isCreatingInvitation ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
                    <p className="text-sm text-text-secondary">
                      Preparing your invitation so media uploads are ready...
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-text-secondary">
                      We need to create a draft to attach media. Click below to retry.
                    </p>
                    <AppButton
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setHasRequestedInvitation(true);
                        setIsCreatingInvitation(true);
                        setCreateError(null);
                        onCreateDraft().catch((err) => {
                          setCreateError(err?.message || 'Failed to create invitation draft');
                        }).finally(() => setIsCreatingInvitation(false));
                      }}
                    >
                      Enable Media Upload
                    </AppButton>
                  </>
                )}
                {createError && (
                  <p className="text-xs text-destructive">{createError}</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {existingMedia.length > 0 && (
                  <div className="flex justify-end">
                    <AppButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowMediaLibrary((open) => !open)}
                    >
                      {showMediaLibrary ? 'Hide library' : 'View media library'}
                    </AppButton>
                  </div>
                )}

                {/* Hero Uploader (Standard & Hybrid) */}
                {layoutConfig.mode !== 'card_only' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Hero Video / Cover
                    </label>
                    <MediaUploader
                      workspaceId={workspaceId}
                      invitationId={data.invitation_id}
                      onUploadComplete={handleUploadComplete}
                      purpose="content"
                      label="Upload Hero Video or Photo"
                    />
                  </div>
                )}

                {/* Main Card Uploader (Card Only & Hybrid) */}
                {layoutConfig.mode !== 'standard' && (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-text-primary">
                      Invitation Design Card
                    </label>
                    <MediaUploader
                      workspaceId={workspaceId}
                      invitationId={data.invitation_id}
                      onUploadComplete={handleUploadComplete}
                      purpose="main_card"
                      label="Upload Invitation Design (Image)"
                    />
                  </div>
                )}

                {/* Media Library (Existing code preserved/adapted) */}

                {showMediaLibrary && (
                  <div className="bg-surface p-4 rounded-lg border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-text-primary">Your media</p>
                      {isLoadingMedia && (
                        <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                      )}
                    </div>
                    {!isLoadingMedia && existingMedia.length === 0 && (
                      <p className="text-sm text-text-secondary">No media uploaded yet.</p>
                    )}
                    {!isLoadingMedia && existingMedia.length > 0 && (
                      <div className="space-y-3">
                        {existingMedia.map((media) => {
                          const label = media.original_filename || media.media_type.toUpperCase();
                          const statusLabel = media.processing_status || 'pending';
                          return (
                            <div
                              key={media.media_id}
                              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center text-text-secondary">
                                  {media.media_type === 'video' ? <Video className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-text-primary truncate">{label}</p>
                                  <p className="text-xs text-text-tertiary">{statusLabel}</p>
                                </div>
                              </div>
                              <AppButton
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  handleUploadComplete(media);
                                  setShowMediaLibrary(false);
                                }}
                              >
                                Use
                              </AppButton>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {(data.video_url || data.audio_url) && (
                  <div className="bg-surface p-3 rounded-lg border border-border text-xs text-text-secondary">
                    {data.video_url && (
                      <div className="flex items-center gap-2">
                        <Video size={14} />
                        Video ready
                      </div>
                    )}
                    {data.audio_url && (
                      <div className="flex items-center gap-2 mt-1">
                        <Music size={14} />
                        Audio ready
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t border-border">
        <AppButton variant="outline" onClick={onBack}>
          Back
        </AppButton>
        <AppButton
          onClick={onNext}
          disabled={!data.template_id}
          className="min-w-[140px]"
        >
          Continue
          <ChevronRight className="w-4 h-4 ml-1" />
        </AppButton>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 3: RSVP Settings
// ---------------------------------------------------------------------------

interface Step3Props {
  data: WizardData;
  onChange: (data: Partial<WizardData>) => void;
  onComplete: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

const Step3RSVPSettings: React.FC<Step3Props> = ({
  data,
  onChange,
  onComplete,
  onBack,
  isSubmitting,
}) => {
  const updateRSVPSettings = useCallback(
    (updates: Partial<RSVPSettings>) => {
      onChange({
        rsvp_settings: { ...data.rsvp_settings, ...updates },
      });
    },
    [data.rsvp_settings, onChange]
  );

  return (
    <div className="space-y-8">
      {/* RSVP Toggle */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          RSVP Settings
        </h3>

        <AppCard className="p-6">
          <Toggle
            label="Enable RSVP Collection"
            description="Allow guests to respond to your invitation"
            checked={data.rsvp_settings.enabled}
            onChange={(e) => updateRSVPSettings({ enabled: e.target.checked })}
          />

          {/* Invite-only mode hint */}
          {!data.rsvp_settings.enabled && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                📋 Invite-Only Mode
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                Your invitation will be shared without collecting RSVPs. Guests can view the event details but won&apos;t be able to confirm their attendance. This is ideal for announcements or save-the-dates.
              </p>
            </div>
          )}
        </AppCard>
      </section>

      {data.rsvp_settings.enabled && (
        <>
          {/* RSVP Deadline */}
          <section>
            <h4 className="text-base font-medium text-text-primary mb-4">
              RSVP Deadline
            </h4>

            <AppInput
              label="Deadline (Optional)"
              type="datetime-local"
              value={data.rsvp_settings.deadline || ''}
              onChange={(e) => updateRSVPSettings({ deadline: e.target.value })}
              helperText="Guests won't be able to RSVP after this date"
            />
          </section>

          {/* Party Size */}
          <section>
            <h4 className="text-base font-medium text-text-primary mb-4">
              Party Settings
            </h4>

            <div className="space-y-4">
              <AppInput
                label="Maximum Party Size"
                type="number"
                min={1}
                max={20}
                value={data.rsvp_settings.max_party_size}
                onChange={(e) =>
                  updateRSVPSettings({
                    max_party_size: parseInt(e.target.value, 10) || 1,
                  })
                }
                helperText="Maximum number of guests each invitee can bring"
              />
            </div>
          </section>

          {/* Additional Info Collection */}
          <section>
            <h4 className="text-base font-medium text-text-primary mb-4">
              Information to Collect
            </h4>

            <div className="space-y-3">
              <Checkbox
                label="Collect Dietary Preferences"
                description="Ask guests about food allergies or restrictions"
                checked={data.rsvp_settings.collect_dietary}
                onChange={(e) =>
                  updateRSVPSettings({ collect_dietary: e.target.checked })
                }
              />

              <Checkbox
                label="Collect Phone Number"
                description="Request guest phone numbers for updates"
                checked={data.rsvp_settings.collect_phone}
                onChange={(e) =>
                  updateRSVPSettings({ collect_phone: e.target.checked })
                }
              />
            </div>
          </section>

          {/* Custom Questions */}
          <RSVPQuestionBuilder
            questions={data.rsvp_settings.custom_questions}
            onChange={(questions) => updateRSVPSettings({ custom_questions: questions })}
          />

          <div className="pt-6 border-t border-border mt-6">
            <h4 className="text-base font-medium text-text-primary mb-4">
              Host Notifications
            </h4>
            <RadioGroup
              name="notification_preference"
              value={data.notification_preference || 'immediate'}
              onChange={(val) => onChange({ notification_preference: val as any })}
            >
              <Radio
                value="immediate"
                label="Immediate"
                description="Receive an email as soon as someone RSVPs"
              />
              <Radio
                value="daily_digest"
                label="Daily Digest"
                description="Receive a summary of all RSVPs once a day"
              />
              <Radio
                value="disabled"
                label="Disabled"
                description="Don't send email notifications"
              />
            </RadioGroup>
          </div>
        </>
      )}

      {/* Summary */}
      <section className="bg-surface-hover rounded-lg p-6">
        <h4 className="text-base font-medium text-text-primary mb-4">
          Summary
        </h4>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Event:</dt>
            <dd className="text-text-primary font-medium">{data.title}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Date:</dt>
            <dd className="text-text-primary">
              {data.event_datetime
                ? new Date(data.event_datetime).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
                : '-'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Venue:</dt>
            <dd className="text-text-primary">
              {data.venue.name || data.venue.city || 'Not specified'}
            </dd>
          </div>
          <div className="flex justify-between items-center">
            <dt className="text-text-secondary">RSVP:</dt>
            <dd>
              {data.rsvp_settings.enabled ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">
                  Enabled
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  Invite-Only
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-secondary">Language:</dt>
            <dd className="text-text-primary">
              {LANGUAGES.find(l => l.value === data.primary_language)?.label || 'English'}
              {data.secondary_language && (
                <span className="text-text-tertiary">
                  {' + '}{LANGUAGES.find(l => l.value === data.secondary_language)?.label}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* Navigation */}
      <div className="flex justify-between pt-6 border-t border-border">
        <AppButton variant="outline" onClick={onBack} disabled={isSubmitting}>
          Back
        </AppButton>
        <AppButton
          onClick={onComplete}
          disabled={isSubmitting}
          className="min-w-[160px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Invitation'
          )}
        </AppButton>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Wizard Component
// ---------------------------------------------------------------------------

export const InvitationWizard: React.FC<InvitationWizardProps> = ({
  workspaceId,
  currentStep,
  data,
  onNext,
  onStepChange,
  onComplete,
  onDataChange,
  isSubmitting,
  onCreateDraft,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Validate Step 1
  const validateStep1 = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!data.title.trim()) {
      newErrors.title = 'Event title is required';
    }

    if (!data.event_datetime) {
      newErrors.event_datetime = 'Event date and time is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [data.title, data.event_datetime]);

  // Handle Step 1 Next
  const handleStep1Next = useCallback(() => {
    if (validateStep1()) {
      onNext({
        title: data.title,
        description: data.description,
        event_type: data.event_type,
        event_datetime: data.event_datetime,
        event_end_datetime: data.event_end_datetime,
        event_timezone: data.event_timezone,
        venue: data.venue,
        host_names: data.host_names,
        host_contact_phone: data.host_contact_phone,
        host_contact_email: data.host_contact_email,
        primary_language: data.primary_language,
        secondary_language: data.secondary_language,
        notification_preference: data.notification_preference,
      });
    }
  }, [
    validateStep1,
    onNext,
    data.title,
    data.description,
    data.event_type,
    data.event_datetime,
    data.event_end_datetime,
    data.event_timezone,
    data.venue,
    data.host_names,
    data.host_contact_phone,
    data.host_contact_email,
    data.primary_language,
    data.secondary_language,
    data.notification_preference,
  ]);

  // Handle Step 2 Next
  const handleStep2Next = useCallback(() => {
    if (data.template_id) {
      onNext({
        template_id: data.template_id,
        customization: data.customization,
      });
    }
  }, [onNext, data.template_id, data.customization]);

  // Handle Step 3 Complete
  const handleStep3Complete = useCallback(() => {
    onComplete({
      rsvp_settings: data.rsvp_settings,
    });
  }, [onComplete, data.rsvp_settings]);

  // Handle Back
  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      onStepChange(currentStep - 1);
    }
  }, [currentStep, onStepChange]);

  // Render current step
  const renderStep = useMemo(() => {
    switch (currentStep) {
      case 1:
        return (
          <Step1EventDetails
            data={data}
            onChange={onDataChange}
            onNext={handleStep1Next}
            errors={errors}
            workspaceId={workspaceId}
          />
        );
      case 2:
        return (
          <Step2TemplateSelection
            workspaceId={workspaceId}
            data={data}
            onChange={onDataChange}
            onNext={handleStep2Next}
            onBack={handleBack}
            onCreateDraft={onCreateDraft!}
          />
        );
      case 3:
        return (
          <Step3RSVPSettings
            data={data}
            onChange={onDataChange}
            onComplete={handleStep3Complete}
            onBack={handleBack}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return null;
    }
  }, [
    currentStep,
    workspaceId,
    data,
    onDataChange,
    handleStep1Next,
    handleStep2Next,
    handleStep3Complete,
    handleBack,
    errors,
    isSubmitting,
  ]);

  return (
    <div className="bg-surface rounded-xl border border-border p-6 md:p-8">
      {renderStep}
    </div>
  );
};

export default InvitationWizard;
