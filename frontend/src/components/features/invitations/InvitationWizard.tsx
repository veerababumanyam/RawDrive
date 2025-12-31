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
  ChevronRight,
  AlertCircle,
  Loader2,
  Languages,
} from 'lucide-react';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppCard } from '@/components/ui/AppCard';
import {
  Select,
  Checkbox,
  Toggle,
  RadioGroup,
  Radio,
} from '@/components/ui/FormControls';
import * as invitationService from '@/services/invitationService';
import type {
  EventType,
  VenueInfo,
  RSVPSettings,
  RSVPCustomQuestion,
  InvitationTemplate,
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

  // Step 2: Template
  template_id?: string;
  customization: Record<string, unknown>;

  // Step 3: RSVP Settings
  rsvp_settings: RSVPSettings;
}

interface InvitationWizardProps {
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
 */
const LANGUAGES = [
  { value: 'en', label: 'English', nativeLabel: 'English', fontClass: 'font-lang-en' },
  { value: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', fontClass: 'font-lang-hi' },
  { value: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', fontClass: 'font-lang-ta' },
  { value: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', fontClass: 'font-lang-te' },
  { value: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', fontClass: 'font-lang-kn' },
  { value: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', fontClass: 'font-lang-ml' },
];

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
    ta: 'நீங்கள் அன்புடன் அழைக்கப்படுகிறீர்கள்',
    te: 'మీకు ఆహ్వానం పంపబడుతోంది',
    kn: 'ನಿಮ್ಮನ್ನು ಪ್ರೀತಿಯಿಂದ ಆಹ್ವಾನಿಸಲಾಗಿದೆ',
    ml: 'നിങ്ങളെ സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു',
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
}

const Step1EventDetails: React.FC<Step1Props> = ({
  data,
  onChange,
  onNext,
  errors,
}) => {
  const [hostInput, setHostInput] = useState('');

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

          <AppInput
            label="Description (Optional)"
            placeholder="Share a brief message about your event..."
            value={data.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
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
          <AppInput
            label="Event Date & Time"
            type="datetime-local"
            value={data.event_datetime}
            onChange={(e) => onChange({ event_datetime: e.target.value })}
            error={errors.event_datetime}
            isRequired
          />

          <AppInput
            label="End Date & Time (Optional)"
            type="datetime-local"
            value={data.event_end_datetime || ''}
            onChange={(e) => onChange({ event_end_datetime: e.target.value })}
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

        <div className="space-y-4">
          <AppInput
            label="Venue Name"
            placeholder="e.g., The Grand Ballroom"
            value={data.venue.name || ''}
            onChange={(e) =>
              onChange({
                venue: { ...data.venue, name: e.target.value },
              })
            }
          />

          <AppInput
            label="Address"
            placeholder="Street address"
            value={data.venue.address || ''}
            onChange={(e) =>
              onChange({
                venue: { ...data.venue, address: e.target.value },
              })
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AppInput
              label="City"
              placeholder="City"
              value={data.venue.city || ''}
              onChange={(e) =>
                onChange({
                  venue: { ...data.venue, city: e.target.value },
                })
              }
            />

            <AppInput
              label="State/Province"
              placeholder="State"
              value={data.venue.state || ''}
              onChange={(e) =>
                onChange({
                  venue: { ...data.venue, state: e.target.value },
                })
              }
            />

            <Select
              label="Country"
              options={COUNTRIES}
              value={data.venue.country}
              onChange={(e) =>
                onChange({
                  venue: { ...data.venue, country: e.target.value },
                })
              }
            />

            <AppInput
              label="Postal Code"
              placeholder="Postal code"
              value={data.venue.postal_code || ''}
              onChange={(e) =>
                onChange({
                  venue: { ...data.venue, postal_code: e.target.value },
                })
              }
            />
          </div>

          <AppInput
            label="Google Maps Link (Optional)"
            placeholder="https://maps.google.com/..."
            value={data.venue.map_url || ''}
            onChange={(e) =>
              onChange({
                venue: { ...data.venue, map_url: e.target.value },
              })
            }
          />
        </div>
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
  data: WizardData;
  onChange: (data: Partial<WizardData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const Step2TemplateSelection: React.FC<Step2Props> = ({
  data,
  onChange,
  onNext,
  onBack,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>(
    data.event_type || 'wedding'
  );

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['templates', selectedCategory],
    queryFn: () =>
      invitationService.listTemplates({
        category: selectedCategory,
        includeSystem: true,
        includePremium: true,
        limit: 50,
      }),
  });

  const templates = templatesData?.data || [];

  const handleSelectTemplate = useCallback(
    (template: InvitationTemplate) => {
      onChange({
        template_id: template.template_id,
        customization: {
          ...data.customization,
          colors: template.layout.colors,
          fonts: template.layout.fonts,
        },
      });
    },
    [data.customization, onChange]
  );

  return (
    <div className="space-y-8">
      {/* Category Filter */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          Choose a Template
        </h3>

        <div className="flex flex-wrap gap-2 mb-6">
          {EVENT_TYPES.map((type) => (
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
            <p>No templates found for this category.</p>
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

      {/* Customization Preview (if template selected) */}
      {data.template_id && (
        <section className="bg-surface-hover rounded-lg p-6">
          <h4 className="text-base font-medium text-text-primary mb-4">
            Customize Colors
          </h4>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Primary Color
              </label>
              <input
                type="color"
                value={
                  (data.customization.colors as Record<string, string>)
                    ?.primary || '#6366f1'
                }
                onChange={(e) =>
                  onChange({
                    customization: {
                      ...data.customization,
                      colors: {
                        ...(data.customization.colors as Record<
                          string,
                          string
                        >),
                        primary: e.target.value,
                      },
                    },
                  })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Secondary Color
              </label>
              <input
                type="color"
                value={
                  (data.customization.colors as Record<string, string>)
                    ?.secondary || '#8b5cf6'
                }
                onChange={(e) =>
                  onChange({
                    customization: {
                      ...data.customization,
                      colors: {
                        ...(data.customization.colors as Record<
                          string,
                          string
                        >),
                        secondary: e.target.value,
                      },
                    },
                  })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Accent Color
              </label>
              <input
                type="color"
                value={
                  (data.customization.colors as Record<string, string>)
                    ?.accent || '#f59e0b'
                }
                onChange={(e) =>
                  onChange({
                    customization: {
                      ...data.customization,
                      colors: {
                        ...(data.customization.colors as Record<
                          string,
                          string
                        >),
                        accent: e.target.value,
                      },
                    },
                  })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-2">
                Background
              </label>
              <input
                type="color"
                value={
                  (data.customization.colors as Record<string, string>)
                    ?.background || '#ffffff'
                }
                onChange={(e) =>
                  onChange({
                    customization: {
                      ...data.customization,
                      colors: {
                        ...(data.customization.colors as Record<
                          string,
                          string
                        >),
                        background: e.target.value,
                      },
                    },
                  })
                }
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>
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
  const [newQuestion, setNewQuestion] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<
    'text' | 'select' | 'checkbox'
  >('text');

  const updateRSVPSettings = useCallback(
    (updates: Partial<RSVPSettings>) => {
      onChange({
        rsvp_settings: { ...data.rsvp_settings, ...updates },
      });
    },
    [data.rsvp_settings, onChange]
  );

  const addCustomQuestion = useCallback(() => {
    if (!newQuestion.trim()) return;

    const question: RSVPCustomQuestion = {
      question: newQuestion.trim(),
      type: newQuestionType,
      required: false,
      options: newQuestionType === 'select' ? ['Option 1', 'Option 2'] : undefined,
    };

    updateRSVPSettings({
      custom_questions: [...data.rsvp_settings.custom_questions, question],
    });

    setNewQuestion('');
  }, [
    newQuestion,
    newQuestionType,
    data.rsvp_settings.custom_questions,
    updateRSVPSettings,
  ]);

  const removeCustomQuestion = useCallback(
    (index: number) => {
      updateRSVPSettings({
        custom_questions: data.rsvp_settings.custom_questions.filter(
          (_, i) => i !== index
        ),
      });
    },
    [data.rsvp_settings.custom_questions, updateRSVPSettings]
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
          <section>
            <h4 className="text-base font-medium text-text-primary mb-4">
              Custom Questions
            </h4>

            {/* Existing Questions */}
            {data.rsvp_settings.custom_questions.length > 0 && (
              <div className="space-y-3 mb-4">
                {data.rsvp_settings.custom_questions.map((q, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-surface-hover rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {q.question}
                      </p>
                      <p className="text-xs text-text-tertiary capitalize">
                        {q.type} • {q.required ? 'Required' : 'Optional'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCustomQuestion(index)}
                      className="text-text-tertiary hover:text-error p-1"
                      aria-label="Remove question"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add New Question */}
            <div className="flex gap-2">
              <AppInput
                placeholder="Add a custom question..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                containerClassName="flex-1"
              />
              <Select
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'select', label: 'Choice' },
                  { value: 'checkbox', label: 'Yes/No' },
                ]}
                value={newQuestionType}
                onChange={(e) =>
                  setNewQuestionType(
                    e.target.value as 'text' | 'select' | 'checkbox'
                  )
                }
                fullWidth={false}
                className="w-32"
              />
              <AppButton
                variant="outline"
                onClick={addCustomQuestion}
                disabled={!newQuestion.trim()}
              >
                Add
              </AppButton>
            </div>
          </section>
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
          />
        );
      case 2:
        return (
          <Step2TemplateSelection
            data={data}
            onChange={onDataChange}
            onNext={handleStep2Next}
            onBack={handleBack}
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
