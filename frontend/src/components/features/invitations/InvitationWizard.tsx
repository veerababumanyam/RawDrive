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

import React, { useState, useCallback, useMemo } from 'react';
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
} from '@/types/invitations';

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

  // Step 2: Template & Design
  template_id?: string;
  customization: Record<string, unknown>;
  font_heading?: string;
  font_body?: string;
  layout_density?: 'compact' | 'normal' | 'spacious';
  video_object_key?: string;
  video_url?: string;
  audio_object_key?: string;
  audio_url?: string;

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
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Primary Language
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => onChange({ primary_language: lang.value })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    data.primary_language === lang.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/50 hover:bg-surface-hover'
                  }`}
                >
                  <span className={`block text-sm font-medium text-text-primary ${lang.fontClass}`}>
                    {lang.nativeLabel}
                  </span>
                  <span className="block text-xs text-text-tertiary mt-0.5">
                    {lang.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Secondary Language Selection (Optional) */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Secondary Language <span className="text-text-tertiary font-normal">(Optional)</span>
            </label>
            <p className="text-xs text-text-secondary mb-2">
              Add a second language for bilingual invitations
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {/* None option */}
              <button
                type="button"
                onClick={() => onChange({ secondary_language: undefined })}
                className={`p-3 rounded-lg border-2 text-left transition-all ${
                  !data.secondary_language
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-border hover:border-primary/50 hover:bg-surface-hover'
                }`}
              >
                <span className="block text-sm font-medium text-text-primary">None</span>
                <span className="block text-xs text-text-tertiary mt-0.5">Single language</span>
              </button>
              {LANGUAGES.filter((lang) => lang.value !== data.primary_language).map((lang) => (
                <button
                  key={lang.value}
                  type="button"
                  onClick={() => onChange({ secondary_language: lang.value })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    data.secondary_language === lang.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-primary/50 hover:bg-surface-hover'
                  }`}
                >
                  <span className={`block text-sm font-medium text-text-primary ${lang.fontClass}`}>
                    {lang.nativeLabel}
                  </span>
                  <span className="block text-xs text-text-tertiary mt-0.5">
                    {lang.label}
                  </span>
                </button>
              ))}
            </div>
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
      </section>

      {/* Date & Time */}
      <section>
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
      </section>

      {/* Venue */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary" />
          Venue Details
        </h3>

        <VenueInput
          value={data.venue}
          onChange={(venue) => onChange({ venue })}
        />
      </section>

      {/* Host Info */}
      <section>
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
      </section>

      {/* Navigation */}
      <div className="flex justify-end pt-6 border-t border-border">
        <AppButton onClick={onNext} className="min-w-[140px]">
          Continue
          <ChevronRight className="w-4 h-4 ml-1" />
        </AppButton>
      </div>
    </div>
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
  onCreateDraft: () => Promise<void>;
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
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
              showLanguageCompatibleOnly
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
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === type.value
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
                className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                  data.template_id === template.template_id
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
                        background: `linear-gradient(135deg, ${
                          template.layout.colors?.primary || '#6366f1'
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
          <div>
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

          <div className="border-t border-border pt-6">
            <h4 className="text-base font-medium text-text-primary mb-4 flex items-center gap-2">
              <Video className="w-4 h-4 text-primary" />
              Hero Media
            </h4>
            
            {!data.invitation_id ? (
               <div className="bg-surface p-4 rounded-lg border border-border text-center">
                 <p className="text-sm text-text-secondary mb-3">
                   Save a draft to upload videos or audio for your invitation.
                 </p>
                 <AppButton variant="outline" size="sm" onClick={onCreateDraft}>
                   Enable Media Upload
                 </AppButton>
               </div>
            ) : (
              <div className="space-y-6">
                 <div>
                   <label className="block text-sm font-medium text-text-primary mb-2">
                     Hero Video / Background Music
                   </label>
                   <MediaUploader
                     workspaceId={workspaceId}
                     invitationId={data.invitation_id}
                     onUploadComplete={(media: InvitationMedia) => {
                        const updates: Partial<WizardData> = {};
                        if (media.media_type === 'video') {
                          updates.video_object_key = media.object_key;
                          updates.video_url = media.url; // Use resolved URL for preview
                        } else if (media.media_type === 'audio') {
                          updates.audio_object_key = media.object_key;
                          updates.audio_url = media.url;
                        }
                        onChange(updates);
                     }}
                   />
                 </div>

                 {(data.video_url || data.audio_url) && (
                   <div className="bg-surface p-3 rounded-lg border border-border text-xs text-text-secondary">
                      {data.video_url && <div className="flex items-center gap-2"><Video size={14}/> Video uploaded</div>}
                      {data.audio_url && <div className="flex items-center gap-2 mt-1"><Music size={14}/> Audio uploaded</div>}
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
          <div className="flex justify-between">
            <dt className="text-text-secondary">RSVP:</dt>
            <dd className="text-text-primary">
              {data.rsvp_settings.enabled ? 'Enabled' : 'Disabled'}
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
            onCreateDraft={async () => {
              try {
                // Determine a template ID if not yet selected (or require it? Invitation needs template?)
                // Actually create_invitation schema makes template_id optional? Let's check.
                // Yes, schema says template_id optional.
                
                const draft = await invitationService.createInvitation(workspaceId, {
                  title: data.title,
                  description: data.description,
                  event_type: data.event_type as any, // Cast if needed
                  event_datetime: data.event_datetime,
                  event_end_datetime: data.event_end_datetime,
                  event_timezone: data.event_timezone,
                  venue: data.venue,
                  host_names: data.host_names,
                  rsvp_settings: data.rsvp_settings,
                  primary_language: data.primary_language,
                  secondary_language: data.secondary_language,
                  template_id: data.template_id, // Might be undefined, which is OK
                  customization: data.customization,
                  notification_preference: data.notification_preference,
                });
                onDataChange({ invitation_id: draft.invitation_id });
              } catch (e) {
                console.error("Failed to create draft", e);
                // Optionally set error state
              }
            }}
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
