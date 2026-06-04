"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DEFAULT_VISIBILITY,
  type PhotographerProfile,
  type ProfileCustomLink,
  type ProfileVisibility,
} from "@/lib/api/photographer-profile";
import type {
  LinkedBusinessProfile,
  LinkedPricingProfile,
} from "@/lib/profile-business-link";
import {
  customLinkHref,
  displayCustomLinkUrl,
  normalizeCustomLinkUrl,
} from "@/lib/profile-custom-links";
import {
  ArrowRight,
  Building2,
  CheckCircle,
  EyeOff,
  FacebookMark,
  Globe,
  InstagramMark,
  LinkedInMark,
  Plus,
  ReceiptText,
  Share,
  Trash,
  XMark,
  YouTubeMark,
} from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface EditFormProps {
  profile: PhotographerProfile;
  linkedBusinessProfile: LinkedBusinessProfile;
  linkedPricingProfile: LinkedPricingProfile;
  publicProfile: {
    enabled: boolean;
    ready: boolean;
    requirements: PublicProfileRequirement[];
    onToggle: (enabled: boolean) => void;
  };
  onChange: (profile: PhotographerProfile) => void;
}

export interface PublicProfileRequirement {
  key: string;
  label: string;
  ok: boolean;
}

type StringField = keyof Pick<
  PhotographerProfile,
  | "first_name"
  | "last_name"
  | "professional_title"
  | "tagline"
  | "short_bio"
  | "long_bio"
  | "primary_email"
  | "primary_phone"
  | "whatsapp_number"
  | "secondary_email"
  | "primary_city"
  | "state"
  | "country"
  | "travel_availability"
  | "payment_terms"
  | "social_instagram"
  | "social_facebook"
  | "social_linkedin"
  | "social_youtube"
  | "social_pinterest"
  | "meta_title"
  | "meta_description"
  | "url_slug"
  | "brand_color"
  | "layout_style"
>;

const VISIBILITY_TOGGLES: {
  field: keyof ProfileVisibility;
  label: string;
  description: string;
}[] = [
  {
    field: "show_profile_photo",
    label: "Profile photo",
    description: "Cropped portrait at the top",
  },
  {
    field: "show_name",
    label: "Name",
    description: "Photographer or studio name",
  },
  {
    field: "show_tagline",
    label: "Tagline",
    description: "Short promise below the name",
  },
  {
    field: "show_location",
    label: "Location",
    description: "City, state, and covered cities",
  },
  {
    field: "show_bio",
    label: "Biography / About",
    description: "Short and long bio sections",
  },
  {
    field: "show_galleries",
    label: "Selected galleries",
    description: "Featured gallery links",
  },
  {
    field: "show_reviews",
    label: "Reviews / testimonials",
    description: "Ratings and testimonial quotes",
  },
  {
    field: "show_pricing",
    label: "Pricing / packages",
    description: "Starting price and package data",
  },
  {
    field: "show_email",
    label: "Email",
    description: "Email action button",
  },
  {
    field: "show_phone",
    label: "Phone",
    description: "Call action button",
  },
  {
    field: "show_whatsapp",
    label: "WhatsApp button",
    description: "WhatsApp action button",
  },
  {
    field: "show_socials",
    label: "Social links",
    description: "Instagram, Facebook, YouTube, LinkedIn",
  },
  {
    field: "show_awards",
    label: "Awards / badges",
    description: "Featured-in and award badges",
  },
  {
    field: "show_services",
    label: "Services",
    description: "Styles, specializations, and languages",
  },
  {
    field: "show_equipment",
    label: "Equipment",
    description: "Camera and production details",
  },
  {
    field: "show_custom_links",
    label: "Custom links",
    description: "Extra tappable link blocks",
  },
];

type SocialField = Extract<
  StringField,
  "social_instagram" | "social_facebook" | "social_linkedin" | "social_youtube"
>;

const SOCIAL_LINKS: {
  field: SocialField;
  label: string;
  placeholder: string;
  baseUrl: string;
  host: string;
  brand: "instagram" | "facebook" | "linkedin" | "youtube";
}[] = [
  {
    field: "social_instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/studio",
    baseUrl: "https://instagram.com/",
    host: "instagram.com",
    brand: "instagram",
  },
  {
    field: "social_facebook",
    label: "Facebook",
    placeholder: "https://facebook.com/studio",
    baseUrl: "https://facebook.com/",
    host: "facebook.com",
    brand: "facebook",
  },
  {
    field: "social_linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/studio",
    baseUrl: "https://linkedin.com/in/",
    host: "linkedin.com",
    brand: "linkedin",
  },
  {
    field: "social_youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@studio",
    baseUrl: "https://youtube.com/",
    host: "youtube.com",
    brand: "youtube",
  },
];

function csv(values: string[] | undefined): string {
  return (values || []).join(", ");
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSocialInput(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("www.")) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function socialProfileUrl(
  spec: (typeof SOCIAL_LINKS)[number],
  value: string,
): string {
  const normalized = normalizeSocialInput(value);
  if (!normalized) return "";
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  const withoutProtocol = normalized.replace(/^@/, "");
  const lower = withoutProtocol.toLowerCase();
  if (
    lower.startsWith(`${spec.host}/`) ||
    lower.startsWith(`www.${spec.host}/`)
  ) {
    return `https://${withoutProtocol.replace(/^www\./, "")}`;
  }

  return `${spec.baseUrl}${withoutProtocol.replace(/^\/+/, "")}`;
}

export function EditForm({
  profile,
  linkedBusinessProfile,
  linkedPricingProfile,
  publicProfile,
  onChange,
}: EditFormProps) {
  const visibility = {
    ...DEFAULT_VISIBILITY,
    ...profile.visibility_config,
  };

  const setField = (field: StringField, value: string) => {
    const next = { ...profile, [field]: value };
    if (field === "first_name" || field === "last_name") {
      next.display_name = [next.first_name, next.last_name]
        .filter(Boolean)
        .join(" ");
    }
    onChange(next);
  };

  const setNumber = (
    field:
      | "service_radius_km"
      | "years_experience"
      | "total_weddings_shot"
      | "starting_price"
      | "price_range_max"
      | "deposit_amount",
    value: string,
  ) => onChange({ ...profile, [field]: numberOrNull(value) });

  const setList = (
    field:
      | "covered_cities"
      | "photography_styles"
      | "specializations"
      | "languages_spoken"
      | "featured_in"
      | "meta_keywords",
    value: string,
  ) => onChange({ ...profile, [field]: splitCsv(value) });

  const setVisibility = (field: keyof ProfileVisibility, value: boolean) => {
    onChange({
      ...profile,
      visibility_config: {
        ...DEFAULT_VISIBILITY,
        ...profile.visibility_config,
        [field]: value,
      },
    });
  };

  const setCustomLink = (index: number, patch: Partial<ProfileCustomLink>) => {
    const links = [...(profile.custom_links || [])];
    links[index] = { ...links[index], ...patch };
    onChange({ ...profile, custom_links: links });
  };

  const addCustomLink = () => {
    onChange({
      ...profile,
      custom_links: [...(profile.custom_links || []), { label: "", url: "" }],
    });
  };

  const removeCustomLink = (index: number) => {
    onChange({
      ...profile,
      custom_links: (profile.custom_links || []).filter((_, i) => i !== index),
    });
  };

  return (
    <section className="settings-panel">
      <div className="profile-edit-layout">
        <div className="profile-edit-section">
          <h2 className="profile-edit-title">Identity</h2>
          <IdentityPublishCard publicProfile={publicProfile} />
          <div className="profile-edit-grid profile-edit-grid--two">
            <Field
              id="profile-first-name"
              label="First name"
              value={profile.first_name}
              onChange={(value) => setField("first_name", value)}
              placeholder="Aarav"
            />
            <Field
              id="profile-last-name"
              label="Last name"
              value={profile.last_name}
              onChange={(value) => setField("last_name", value)}
              placeholder="Mehta"
            />
          </div>
          <Field
            id="profile-slug"
            label="Public slug"
            value={profile.url_slug}
            onChange={(value) => setField("url_slug", value)}
            placeholder="aarav-mehta"
          />
          <Field
            id="profile-title"
            label="Professional title"
            value={profile.professional_title}
            onChange={(value) => setField("professional_title", value)}
            placeholder="Candid Wedding Photographer"
          />
          <Field
            id="profile-tagline"
            label="Tagline"
            value={profile.tagline}
            onChange={(value) => setField("tagline", value)}
            placeholder="Capturing love stories across Hyderabad"
          />
          <Textarea
            id="profile-short-bio"
            label="Short bio"
            value={profile.short_bio}
            maxLength={500}
            onChange={(value) => setField("short_bio", value)}
          />
          <Textarea
            id="profile-long-bio"
            label="Long bio"
            value={profile.long_bio}
            rows={6}
            onChange={(value) => setField("long_bio", value)}
          />
        </div>

        <div className="profile-edit-section">
          <h2 className="profile-edit-title">Contact</h2>
          <div className="profile-edit-grid profile-edit-grid--two">
            <Field
              id="profile-email"
              label="Primary email"
              type="email"
              value={profile.primary_email}
              onChange={(value) => setField("primary_email", value)}
            />
            <Field
              id="profile-phone"
              label="Primary phone"
              type="tel"
              value={profile.primary_phone}
              onChange={(value) => setField("primary_phone", value)}
            />
            <Field
              id="profile-whatsapp"
              label="WhatsApp"
              type="tel"
              value={profile.whatsapp_number}
              onChange={(value) => setField("whatsapp_number", value)}
            />
            <Field
              id="profile-secondary-email"
              label="Secondary email"
              type="email"
              value={profile.secondary_email}
              onChange={(value) => setField("secondary_email", value)}
            />
          </div>

          <h2 className="profile-edit-title profile-edit-title--spaced">
            Location
          </h2>
          <div className="profile-edit-grid profile-edit-grid--two">
            <Field
              id="profile-city"
              label="Primary city"
              value={profile.primary_city}
              onChange={(value) => setField("primary_city", value)}
            />
            <Field
              id="profile-state"
              label="State"
              value={profile.state}
              onChange={(value) => setField("state", value)}
            />
            <Field
              id="profile-country"
              label="Country"
              value={profile.country}
              onChange={(value) => setField("country", value)}
            />
            <Field
              id="profile-radius"
              label="Service radius km"
              type="number"
              value={profile.service_radius_km?.toString() || ""}
              onChange={(value) => setNumber("service_radius_km", value)}
            />
          </div>
          <Field
            id="profile-cities"
            label="Covered cities"
            value={csv(profile.covered_cities)}
            onChange={(value) => setList("covered_cities", value)}
            placeholder="Hyderabad, Vijayawada, Bengaluru"
          />
          <Field
            id="profile-travel"
            label="Travel availability"
            value={profile.travel_availability}
            onChange={(value) => setField("travel_availability", value)}
            placeholder="local, regional, nationwide, international"
          />
        </div>

        <div className="profile-edit-section">
          <h2 className="profile-edit-title">Craft</h2>
          <div className="profile-edit-grid profile-edit-grid--two">
            <Field
              id="profile-experience"
              label="Years experience"
              type="number"
              value={profile.years_experience?.toString() || ""}
              onChange={(value) => setNumber("years_experience", value)}
            />
            <Field
              id="profile-weddings"
              label="Weddings shot"
              type="number"
              value={profile.total_weddings_shot?.toString() || ""}
              onChange={(value) => setNumber("total_weddings_shot", value)}
            />
          </div>
          <Field
            id="profile-styles"
            label="Photography styles"
            value={csv(profile.photography_styles)}
            onChange={(value) => setList("photography_styles", value)}
            placeholder="candid, documentary, fine art, traditional"
          />
          <Field
            id="profile-specializations"
            label="Specializations"
            value={csv(profile.specializations)}
            onChange={(value) => setList("specializations", value)}
            placeholder="wedding, pre-wedding, haldi, reception"
          />
          <Field
            id="profile-languages"
            label="Languages spoken"
            value={csv(profile.languages_spoken)}
            onChange={(value) => setList("languages_spoken", value)}
            placeholder="English, Hindi, Telugu"
          />

          <h2 className="profile-edit-title profile-edit-title--spaced">
            Pricing
          </h2>
          <LinkedPricingProfileCard
            linkedPricingProfile={linkedPricingProfile}
          />
        </div>

        <div className="profile-edit-section">
          <h2 className="profile-edit-title">Social links</h2>
          <div className="social-link-grid">
            {SOCIAL_LINKS.map((spec) => (
              <SocialLinkField
                key={spec.field}
                spec={spec}
                value={profile[spec.field]}
                onChange={(value) => setField(spec.field, value)}
              />
            ))}
          </div>
          <Field
            id="profile-featured-in"
            label="Awards / badges"
            value={csv(profile.featured_in)}
            onChange={(value) => setList("featured_in", value)}
            placeholder="WedMeGood, Vogue India"
          />

          <CustomLinksEditor
            links={profile.custom_links || []}
            onAdd={addCustomLink}
            onChange={setCustomLink}
            onRemove={removeCustomLink}
          />

          <h2 className="profile-edit-title profile-edit-title--spaced">
            Business
          </h2>
          <LinkedBusinessProfileCard
            linkedBusinessProfile={linkedBusinessProfile}
          />
        </div>

        <div className="profile-edit-section profile-edit-section--wide">
          <h2 className="profile-edit-title">Public page visibility</h2>
          <p className="profile-edit-description">
            Choose exactly what appears on the public link-in-bio page. These
            choices are saved with the profile.
          </p>
          <div className="profile-edit-grid profile-edit-grid--compact profile-edit-grid--two">
            {VISIBILITY_TOGGLES.map((toggle) => (
              <ToggleRow
                key={toggle.field}
                label={toggle.label}
                description={toggle.description}
                checked={visibility[toggle.field]}
                onChange={(checked) => setVisibility(toggle.field, checked)}
              />
            ))}
          </div>

          <h2 className="profile-edit-title profile-edit-title--spaced">SEO</h2>
          <div className="profile-edit-grid profile-edit-grid--two">
            <Field
              id="profile-meta-title"
              label="Meta title"
              value={profile.meta_title}
              onChange={(value) => setField("meta_title", value)}
            />
            <Field
              id="profile-meta-keywords"
              label="Meta keywords"
              value={csv(profile.meta_keywords)}
              onChange={(value) => setList("meta_keywords", value)}
            />
          </div>
          <Textarea
            id="profile-meta-description"
            label="Meta description"
            value={profile.meta_description}
            rows={3}
            onChange={(value) => setField("meta_description", value)}
          />
        </div>
      </div>
    </section>
  );
}

function IdentityPublishCard({
  publicProfile,
}: {
  publicProfile: EditFormProps["publicProfile"];
}) {
  const missing = publicProfile.requirements.filter((item) => !item.ok);
  const statusLabel = publicProfile.enabled
    ? publicProfile.ready
      ? "Public after saving"
      : `Needs ${missing.length} item${missing.length === 1 ? "" : "s"}`
    : "Private";

  return (
    <section
      className="profile-publish-card"
      aria-labelledby="profile-publish-title"
    >
      <div className="profile-publish-card__main">
        <span className="profile-publish-card__icon" aria-hidden="true">
          {publicProfile.enabled ? <Share /> : <EyeOff />}
        </span>
        <div>
          <h3
            id="profile-publish-title"
            className="profile-publish-card__title"
          >
            Public profile
          </h3>
          <p className="profile-publish-card__status">{statusLabel}</p>
        </div>
      </div>
      <ToggleSwitch
        checked={publicProfile.enabled}
        label="Public profile visibility"
        checkedLabel="Public"
        uncheckedLabel="Private"
        onCheckedChange={publicProfile.onToggle}
        title={
          publicProfile.enabled
            ? "Public profile is visible after saving"
            : "Public profile is private"
        }
      />
      {missing.length ? (
        <div
          className="profile-publish-card__missing"
          aria-label="Missing public profile requirements"
        >
          {missing.map((item) => (
            <span key={item.key} className="profile-publish-card__missing-item">
              <CheckCircle />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CustomLinksEditor({
  links,
  onAdd,
  onChange,
  onRemove,
}: {
  links: ProfileCustomLink[];
  onAdd: () => void;
  onChange: (index: number, patch: Partial<ProfileCustomLink>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="custom-links-editor">
      <div className="custom-links-editor__header">
        <div>
          <h3 className="custom-links-editor__title">Custom links</h3>
          <p className="custom-links-editor__description">Public URL blocks.</p>
        </div>
        <GlassButton
          type="button"
          onClick={onAdd}
          size="sm"
          variant="surface"
          icon={<Plus />}
        >
          Add link
        </GlassButton>
      </div>

      <div className="custom-links-editor__list">
        {links.length ? (
          links.map((link, index) => (
            <CustomLinkRow
              key={index}
              index={index}
              link={link}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))
        ) : (
          <div className="custom-links-editor__empty">
            <p>No custom links yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CustomLinkRow({
  index,
  link,
  onChange,
  onRemove,
}: {
  index: number;
  link: ProfileCustomLink;
  onChange: (index: number, patch: Partial<ProfileCustomLink>) => void;
  onRemove: (index: number) => void;
}) {
  const [labelDraft, setLabelDraft] = useState(link.label || "");
  const [urlDraft, setUrlDraft] = useState(link.url || "");

  const label = labelDraft;
  const url = urlDraft;
  const href = customLinkHref(url);
  const displayUrl = displayCustomLinkUrl(url);
  const complete = Boolean(label.trim() && href);
  const invalidUrl = Boolean(url.trim() && !href);
  const hint = complete ? displayUrl : invalidUrl ? "Invalid URL" : "";

  return (
    <article className="custom-link-row">
      <div className="custom-link-row__header">
        <div>
          <h4 className="custom-link-row__title">Custom link {index + 1}</h4>
          {hint ? <p className="custom-link-row__hint">{hint}</p> : null}
        </div>
        <span
          className={
            complete
              ? "custom-link-row__status custom-link-row__status--ready"
              : "custom-link-row__status"
          }
        >
          {complete ? "Ready" : "Draft"}
        </span>
      </div>

      <div className="custom-link-row__fields">
        <label className="custom-link-field">
          <span>Label</span>
          <input
            value={label}
            onChange={(event) => {
              setLabelDraft(event.target.value);
              onChange(index, { label: event.target.value });
            }}
            onBlur={(event) => {
              const trimmed = event.currentTarget.value.trim();
              setLabelDraft(trimmed);
              onChange(index, { label: trimmed });
            }}
            placeholder="Booking form"
            aria-label={`Custom link ${index + 1} label`}
            className="custom-link-field__input"
          />
        </label>

        <label className="custom-link-field">
          <span>URL</span>
          <input
            value={url}
            onChange={(event) => {
              setUrlDraft(event.target.value);
              onChange(index, { url: event.target.value });
            }}
            onBlur={(event) => {
              const normalized = normalizeCustomLinkUrl(
                event.currentTarget.value,
              );
              setUrlDraft(normalized);
              onChange(index, { url: normalized });
            }}
            placeholder="studio.com/book"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="url"
            spellCheck={false}
            aria-invalid={invalidUrl}
            aria-label={`Custom link ${index + 1} URL`}
            className="custom-link-field__input"
          />
        </label>
      </div>

      <div className="custom-link-row__actions">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="glass-button glass-button--surface glass-button--sm"
            aria-label={`Open custom link ${index + 1}`}
          >
            <Globe />
            <span>Open</span>
          </a>
        ) : null}
        <GlassButton
          type="button"
          size="sm"
          variant="danger"
          icon={<Trash />}
          onClick={() => onRemove(index)}
          aria-label={`Remove custom link ${index + 1}`}
        >
          Remove
        </GlassButton>
      </div>
    </article>
  );
}

function SocialLinkField({
  spec,
  value,
  onChange,
}: {
  spec: (typeof SOCIAL_LINKS)[number];
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = normalizeSocialInput(value);
  const href = socialProfileUrl(spec, normalized);
  const inputId = `profile-${spec.field.replace("social_", "")}`;

  return (
    <div className="social-link-card">
      <div className="social-link-card__header">
        <div className="social-link-card__title">
          <span
            className={`social-link-card__mark social-link-card__mark--${spec.brand}`}
            aria-hidden="true"
          >
            <SocialBrandMark brand={spec.brand} />
          </span>
          <div className="social-link-card__copy">
            <label htmlFor={inputId} className="social-link-card__label">
              {spec.label}
            </label>
          </div>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="glass-button glass-button--surface glass-button--sm"
            aria-label={`Open ${spec.label} profile`}
          >
            <Globe />
            <span>Open</span>
          </a>
        ) : null}
      </div>

      <div className="social-link-card__input-row">
        <input
          id={inputId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onChange(href || normalized)}
          placeholder={spec.placeholder}
          inputMode="url"
          autoCapitalize="none"
          autoComplete="url"
          spellCheck={false}
          className="social-link-card__input"
        />
        {value ? (
          <GlassButton
            type="button"
            size="sm"
            variant="quiet"
            icon={<XMark />}
            onClick={() => onChange("")}
          >
            Clear
          </GlassButton>
        ) : null}
      </div>
    </div>
  );
}

function SocialBrandMark({
  brand,
}: {
  brand: (typeof SOCIAL_LINKS)[number]["brand"];
}) {
  switch (brand) {
    case "instagram":
      return <InstagramMark />;
    case "facebook":
      return <FacebookMark />;
    case "linkedin":
      return <LinkedInMark />;
    case "youtube":
      return <YouTubeMark />;
  }
}

function formatINR(value: number | null): string {
  if (!value) return "Not set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function LinkedPricingProfileCard({
  linkedPricingProfile,
}: {
  linkedPricingProfile: LinkedPricingProfile;
}) {
  const hasStartingPrice = Boolean(linkedPricingProfile.startingPrice);
  const hasMaxPrice = Boolean(linkedPricingProfile.maxPrice);
  const packageSource = linkedPricingProfile.packageCount
    ? `${linkedPricingProfile.packageCount} active package${linkedPricingProfile.packageCount === 1 ? "" : "s"}`
    : "No active packages yet";

  return (
    <section
      className="linked-business-card linked-pricing-card"
      aria-labelledby="profile-linked-pricing-title"
    >
      <div className="linked-business-card__header">
        <div className="linked-business-card__title-row">
          <span className="linked-business-card__icon" aria-hidden="true">
            <ReceiptText />
          </span>
          <div>
            <h3
              id="profile-linked-pricing-title"
              className="linked-business-card__title"
            >
              Pricing source
            </h3>
            <p className="linked-business-card__description">
              Packages + Business Profile
            </p>
          </div>
        </div>
        <div className="linked-business-card__actions">
          <Link
            href={linkedPricingProfile.href}
            className="glass-button glass-button--surface glass-button--sm"
            aria-label="Edit service packages"
          >
            <span>Edit packages</span>
            <ArrowRight />
          </Link>
          <Link
            href={linkedPricingProfile.termsHref}
            className="glass-button glass-button--quiet glass-button--sm"
            aria-label="Edit payment terms in Business Profile"
          >
            <span>Edit terms</span>
            <ArrowRight />
          </Link>
        </div>
      </div>

      <dl className="linked-business-card__details linked-business-card__details--two">
        <div>
          <dt>Starting price</dt>
          <dd className={hasStartingPrice ? undefined : "is-empty"}>
            {formatINR(linkedPricingProfile.startingPrice)}
          </dd>
        </div>
        <div>
          <dt>Range max</dt>
          <dd className={hasMaxPrice ? undefined : "is-empty"}>
            {formatINR(linkedPricingProfile.maxPrice)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd
            className={
              linkedPricingProfile.packageCount ? undefined : "is-empty"
            }
          >
            {packageSource}
          </dd>
        </div>
        <div>
          <dt>Payment terms</dt>
          <dd
            className={
              linkedPricingProfile.paymentTerms ? undefined : "is-empty"
            }
          >
            {linkedPricingProfile.paymentTerms ||
              "Add payment terms in Business Profile."}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function LinkedBusinessProfileCard({
  linkedBusinessProfile,
}: {
  linkedBusinessProfile: LinkedBusinessProfile;
}) {
  const name = linkedBusinessProfile.name || "Not set in Business Profile";
  const address =
    linkedBusinessProfile.address ||
    "Add the studio address in Business Profile.";

  return (
    <section
      className="linked-business-card"
      aria-labelledby="profile-linked-business-title"
    >
      <div className="linked-business-card__header">
        <div className="linked-business-card__title-row">
          <span className="linked-business-card__icon" aria-hidden="true">
            <Building2 />
          </span>
          <div>
            <h3
              id="profile-linked-business-title"
              className="linked-business-card__title"
            >
              Business source
            </h3>
            <p className="linked-business-card__description">
              Business Profile
            </p>
          </div>
        </div>
        <Link
          href={linkedBusinessProfile.href}
          className="glass-button glass-button--surface glass-button--sm"
          aria-label="Edit business profile settings"
        >
          <span>Edit in Business</span>
          <ArrowRight />
        </Link>
      </div>

      <dl className="linked-business-card__details">
        <div>
          <dt>Business name</dt>
          <dd className={linkedBusinessProfile.name ? undefined : "is-empty"}>
            {name}
          </dd>
        </div>
        <div>
          <dt>Business address</dt>
          <dd
            className={linkedBusinessProfile.address ? undefined : "is-empty"}
          >
            {address}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="profile-toggle-row">
      <span>
        <span className="profile-toggle-row__title">{label}</span>
        <span className="profile-toggle-row__description">{description}</span>
      </span>
      <span className="profile-toggle-row__control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="profile-toggle-row__input"
        />
        <span className="profile-toggle-row__track" />
        <span className="profile-toggle-row__thumb" />
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="profile-form-field">
      {label}
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="input-base profile-form-field__input"
      />
    </label>
  );
}

function Textarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
  action,
  rows = 4,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  action?: ReactNode;
  rows?: number;
  maxLength?: number;
}) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className="textarea-field">
      <div className="textarea-field__header">
        <label htmlFor={id} className="textarea-field__label">
          {label}
        </label>
        {action ? <div className="textarea-field__action">{action}</div> : null}
      </div>
      {description ? (
        <p id={descriptionId} className="textarea-field__description">
          {description}
        </p>
      ) : null}
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.value)}
        className="input-base textarea-field__control"
      />
    </div>
  );
}
