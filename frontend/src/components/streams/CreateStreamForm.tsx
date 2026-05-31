"use client";

/**
 * CreateStreamForm — M34 story 34-2 expanded stream creation form.
 *
 * Captures package, expected duration, access/chat policies, calendar and
 * deal links, client profile, timezone, title, and description. Posts to
 * the existing `/api/v1/streams` endpoint via `createStream()` from
 * `@/lib/api/streams`. On 201 success navigates to
 * `/streams/[id]/invite`. On 402 surfaces a "top up credits" CTA inline.
 *
 * Project rules applied:
 *   - GlassIconButton for submit/reset (no raw icon buttons)
 *   - Tailwind design-token utilities only
 *   - JWT pulled from cookie via getStoredAccessToken()
 *   - Client-side validation mirrors the server schema
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authFetch } from "@/lib/api/authFetch";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { CheckCircle, XMark, Plus } from "@/components/icons";
import { IANA_TIMEZONES, isValidTimezone } from "@/lib/streams/timezones";

type AccessPolicy = "pin" | "link" | "sso";
type ChatPolicy = "off" | "authenticated" | "open";

interface FormState {
  title: string;
  description: string;
  package_id: string;
  expected_duration_minutes: string;
  access_policy: AccessPolicy;
  chat_policy: ChatPolicy;
  calendar_event_url: string;
  client_profile_id: string;
  deal_link: string;
  timezone: string;
}

const DEFAULT_STATE: FormState = {
  title: "",
  description: "",
  package_id: "",
  expected_duration_minutes: "60",
  access_policy: "link",
  chat_policy: "open",
  calendar_event_url: "",
  client_profile_id: "",
  deal_link: "",
  timezone: "Asia/Kolkata",
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

function isValidHttpsUrl(v: string): boolean {
  if (!v) return true; // optional
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validate(state: FormState): FieldErrors {
  const errs: FieldErrors = {};
  const title = state.title.trim();
  if (title.length < 3) errs.title = "Title must be at least 3 characters";
  else if (title.length > 120) errs.title = "Title must be 120 characters or fewer";

  const dur = Number(state.expected_duration_minutes);
  if (!Number.isFinite(dur) || !Number.isInteger(dur) || dur < 5 || dur > 720) {
    errs.expected_duration_minutes = "Duration must be between 5 and 720 minutes";
  }

  if (!isValidTimezone(state.timezone)) {
    errs.timezone = "Invalid IANA timezone";
  }

  if (state.calendar_event_url && !isValidHttpsUrl(state.calendar_event_url)) {
    errs.calendar_event_url = "Must be a valid URL";
  }
  if (state.deal_link && !isValidHttpsUrl(state.deal_link)) {
    errs.deal_link = "Must be a valid URL";
  }

  return errs;
}

export interface CreateStreamFormProps {
  initial?: Partial<FormState>;
}

export function CreateStreamForm({ initial }: CreateStreamFormProps = {}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ ...DEFAULT_STATE, ...initial });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [insufficientCredits, setInsufficientCredits] = useState(false);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  const reset = () => {
    setState({ ...DEFAULT_STATE, ...initial });
    setErrors({});
    setFormError(null);
    setInsufficientCredits(false);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setInsufficientCredits(false);

    const v = validate(state);
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        title: state.title.trim(),
        description: state.description.trim() || undefined,
        package_id: state.package_id || undefined,
        expected_duration_minutes: Number(state.expected_duration_minutes),
        access_policy: state.access_policy,
        chat_policy: state.chat_policy,
        calendar_event_url: state.calendar_event_url || undefined,
        client_profile_id: state.client_profile_id || undefined,
        deal_link: state.deal_link || undefined,
        timezone: state.timezone,
      };

      // Use authFetch for automatic token refresh on 401 (fixes QA #23/#24)
      const res = await authFetch("/api/v1/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (res.status === 402) { setInsufficientCredits(true); return; }
        throw new Error(body.error || `Failed to create stream: ${res.status}`);
      }
      const created = await res.json();
      const id = (created as { id?: string } | null)?.id;
      if (id) router.push(`/streams/${id}/invite`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create stream");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-border-primary bg-surface-base px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 min-h-[44px]";
  const labelClass = "block text-sm font-medium text-text-primary mb-1.5";
  const errClass = "mt-1 text-xs text-feedback-error";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="glass-card rounded-2xl p-6 space-y-5 max-w-2xl mx-auto"
      aria-label="Create stream form"
    >
      {formError && (
        <div
          data-testid="form-error"
          className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error"
        >
          {formError}
        </div>
      )}

      {insufficientCredits && (
        <div
          data-testid="insufficient-credits"
          className="rounded-xl border border-feedback-warning/20 bg-feedback-warning/10 px-4 py-3 text-sm text-text-primary"
        >
          <p className="mb-2 font-medium">You don&apos;t have enough credits for this stream.</p>
          <GlassIconButton
            type="button"
            size="sm"
            variant="accent"
            label="Top up credits"
            data-testid="top-up-credits-cta"
            onClick={() => router.push("/billing/recharge")}
          >
            <Plus />
          </GlassIconButton>
        </div>
      )}

      <div>
        <label htmlFor="title" className={labelClass}>Title *</label>
        <input
          id="title"
          data-testid="field-title"
          type="text"
          value={state.title}
          onChange={(e) => update("title", e.target.value)}
          className={inputClass}
        />
        {errors.title && <p data-testid="error-title" className={errClass}>{errors.title}</p>}
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea
          id="description"
          data-testid="field-description"
          value={state.description}
          onChange={(e) => update("description", e.target.value)}
          rows={3}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="package_id" className={labelClass}>Package</label>
          <select
            id="package_id"
            data-testid="field-package_id"
            value={state.package_id}
            onChange={(e) => update("package_id", e.target.value)}
            className={inputClass}
          >
            <option value="">Select a package</option>
            <option value="pkg-basic">Basic</option>
            <option value="pkg-pro">Pro</option>
            <option value="pkg-premium">Premium</option>
          </select>
        </div>

        <div>
          <label htmlFor="expected_duration_minutes" className={labelClass}>Expected duration (minutes)</label>
          <input
            id="expected_duration_minutes"
            data-testid="field-expected_duration_minutes"
            type="number"
            min={5}
            max={720}
            value={state.expected_duration_minutes}
            onChange={(e) => update("expected_duration_minutes", e.target.value)}
            className={inputClass}
          />
          {errors.expected_duration_minutes && (
            <p data-testid="error-expected_duration_minutes" className={errClass}>
              {errors.expected_duration_minutes}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="access_policy" className={labelClass}>Access policy</label>
          <select
            id="access_policy"
            data-testid="field-access_policy"
            value={state.access_policy}
            onChange={(e) => update("access_policy", e.target.value as AccessPolicy)}
            className={inputClass}
          >
            <option value="link">Link (public)</option>
            <option value="pin">PIN-protected</option>
            <option value="sso">SSO (invite-only)</option>
          </select>
        </div>

        <div>
          <label htmlFor="chat_policy" className={labelClass}>Chat policy</label>
          <select
            id="chat_policy"
            data-testid="field-chat_policy"
            value={state.chat_policy}
            onChange={(e) => update("chat_policy", e.target.value as ChatPolicy)}
            className={inputClass}
          >
            <option value="open">Open</option>
            <option value="authenticated">Authenticated only</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="calendar_event_url" className={labelClass}>Calendar event URL</label>
        <input
          id="calendar_event_url"
          data-testid="field-calendar_event_url"
          type="url"
          value={state.calendar_event_url}
          onChange={(e) => update("calendar_event_url", e.target.value)}
          placeholder="https://cal.example.com/..."
          className={inputClass}
        />
        {errors.calendar_event_url && (
          <p data-testid="error-calendar_event_url" className={errClass}>{errors.calendar_event_url}</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="client_profile_id" className={labelClass}>Client profile (optional)</label>
          <input
            id="client_profile_id"
            data-testid="field-client_profile_id"
            type="text"
            value={state.client_profile_id}
            onChange={(e) => update("client_profile_id", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="deal_link" className={labelClass}>Deal link (optional)</label>
          <input
            id="deal_link"
            data-testid="field-deal_link"
            type="url"
            value={state.deal_link}
            onChange={(e) => update("deal_link", e.target.value)}
            placeholder="https://deals.example.com/..."
            className={inputClass}
          />
          {errors.deal_link && (
            <p data-testid="error-deal_link" className={errClass}>{errors.deal_link}</p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="timezone" className={labelClass}>Timezone (IANA)</label>
        <input
          id="timezone"
          data-testid="field-timezone"
          type="text"
          list="iana-timezones"
          value={state.timezone}
          onChange={(e) => update("timezone", e.target.value)}
          className={inputClass}
        />
        <datalist id="iana-timezones">
          {IANA_TIMEZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        {errors.timezone && <p data-testid="error-timezone" className={errClass}>{errors.timezone}</p>}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <GlassIconButton
          type="button"
          variant="ghost"
          label="Reset form"
          data-testid="reset-button"
          onClick={reset}
          disabled={submitting}
        >
          <XMark />
        </GlassIconButton>
        <GlassIconButton
          type="submit"
          variant="success"
          label={submitting ? "Creating stream" : "Create stream"}
          data-testid="submit-button"
          disabled={submitting}
        >
          <CheckCircle />
        </GlassIconButton>
      </div>
    </form>
  );
}

export default CreateStreamForm;
