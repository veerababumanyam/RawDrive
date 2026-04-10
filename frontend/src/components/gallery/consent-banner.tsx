"use client";

import { useMemo, useState } from "react";

// M15 enterprise 8-toggle consent banner — matches backend canonical purpose names.
// See backend/internal/service/consent_service.go and
// _cobolt-output/latest/build/M15/M15-design-decisions.md § 2.

export type ConsentPurpose =
  | "terms_of_service"
  | "gallery_notifications"
  | "biometric_face_id"
  | "ai_content_tagging"
  | "analytics_tracking"
  | "marketing_communications"
  | "third_party_sharing"
  | "dsar_processing";

export type ConsentGrants = Record<ConsentPurpose, boolean>;

interface ConsentBannerProps {
  slug: string;
  onAccept: (grants: ConsentGrants) => void;
  onDismiss: () => void;
  language?: "en" | "hi";
  initialGrants?: Partial<ConsentGrants>;
}

// ─── i18n copy (en + hi) ────────────────────────────────────────────────
// Hindi translations validated against DPDP Act 2023 language requirements.
const COPY = {
  en: {
    title: "Your privacy, your choices",
    lead: "Choose how this gallery handles your data. You can change these anytime.",
    essential: "Essential",
    features: "Features",
    ai: "AI assistance",
    marketing: "Marketing",
    purposes: {
      terms_of_service: {
        label: "Accept gallery terms",
        helper: "Required to view this gallery.",
      },
      dsar_processing: {
        label: "Allow data requests to be processed",
        helper: "Lets us handle your export/delete requests (DPDP compliant).",
      },
      gallery_notifications: {
        label: "Email me updates",
        helper: "Proofing reminders, new photos, expiry warnings.",
      },
      biometric_face_id: {
        label: "Find my photos with face recognition",
        helper: "Uses face embeddings to show only photos you're in.",
      },
      ai_content_tagging: {
        label: "Use AI tags to find photos",
        helper: "Scene detection, OCR, color search.",
      },
      analytics_tracking: {
        label: "Help improve this gallery",
        helper: "Anonymous view counts and interaction stats.",
      },
      marketing_communications: {
        label: "Promotional emails from the studio",
        helper: "New offers, prints, albums. Never shared with third parties.",
      },
      third_party_sharing: {
        label: "Share order info with print labs",
        helper: "Required only if you order prints shipped from a partner lab.",
      },
    },
    accept: "Save choices & continue",
    acceptAll: "Accept all",
    decline: "Only essentials",
    consentText:
      "RawDrive gallery consent v2 (M15): granular purpose-bound processing under DPDP 2023 / GDPR Art. 6.",
  },
  hi: {
    title: "आपकी गोपनीयता, आपकी पसंद",
    lead: "चुनें कि यह गैलरी आपके डेटा के साथ क्या कर सकती है। आप बाद में बदल सकते हैं।",
    essential: "आवश्यक",
    features: "विशेषताएँ",
    ai: "एआई सहायता",
    marketing: "विपणन",
    purposes: {
      terms_of_service: {
        label: "गैलरी की शर्तें स्वीकार करें",
        helper: "इस गैलरी को देखने के लिए आवश्यक।",
      },
      dsar_processing: {
        label: "डेटा अनुरोधों की अनुमति दें",
        helper: "निर्यात/मिटाने के अनुरोधों को संसाधित करने के लिए (DPDP अनुपालन)।",
      },
      gallery_notifications: {
        label: "मुझे अपडेट ईमेल करें",
        helper: "प्रूफिंग रिमाइंडर, नए फोटो, समाप्ति चेतावनियाँ।",
      },
      biometric_face_id: {
        label: "चेहरे की पहचान से मेरे फोटो ढूंढें",
        helper: "फेस एम्बेडिंग से केवल आपके फोटो दिखाता है।",
      },
      ai_content_tagging: {
        label: "एआई टैग से फोटो खोजें",
        helper: "दृश्य पहचान, ओसीआर, रंग खोज।",
      },
      analytics_tracking: {
        label: "इस गैलरी को बेहतर बनाने में मदद करें",
        helper: "गुमनाम व्यू काउंट और इंटरेक्शन आँकड़े।",
      },
      marketing_communications: {
        label: "स्टूडियो से प्रचार ईमेल",
        helper: "नए ऑफ़र, प्रिंट, एल्बम। कभी साझा नहीं किया जाएगा।",
      },
      third_party_sharing: {
        label: "प्रिंट लैब के साथ ऑर्डर जानकारी साझा करें",
        helper: "केवल तब आवश्यक जब आप लैब से प्रिंट मंगवाएँ।",
      },
    },
    accept: "चुनाव सहेजें और जारी रखें",
    acceptAll: "सभी स्वीकार करें",
    decline: "केवल आवश्यक",
    consentText:
      "RawDrive गैलरी सहमति v2 (M15): DPDP 2023 / GDPR अनुच्छेद 6 के तहत उद्देश्य-बद्ध प्रसंस्करण।",
  },
} as const;

// Grouping for the banner UI — matches the 4 visible sections.
const GROUPS: Array<{ key: "essential" | "features" | "ai" | "marketing"; purposes: ConsentPurpose[] }> = [
  { key: "essential", purposes: ["terms_of_service", "dsar_processing"] },
  { key: "features", purposes: ["gallery_notifications", "analytics_tracking"] },
  { key: "ai", purposes: ["biometric_face_id", "ai_content_tagging"] },
  { key: "marketing", purposes: ["marketing_communications", "third_party_sharing"] },
];

const DEFAULT_GRANTS: ConsentGrants = {
  terms_of_service: false,
  dsar_processing: false,
  gallery_notifications: false,
  biometric_face_id: false,
  ai_content_tagging: false,
  analytics_tracking: false,
  marketing_communications: false,
  third_party_sharing: false,
};

export function ConsentBanner({
  slug,
  onAccept,
  onDismiss,
  language = "en",
  initialGrants,
}: ConsentBannerProps) {
  const [grants, setGrants] = useState<ConsentGrants>(() => ({
    ...DEFAULT_GRANTS,
    ...initialGrants,
  }));

  const copy = COPY[language];
  const termsAccepted = grants.terms_of_service;

  // Submit payload to the backend bundle endpoint. The consent_text field is
  // hashed server-side into an audit-proof version hash (DPDP § 5(e)).
  const submit = async (grantSet: ConsentGrants) => {
    try {
      await fetch(`/api/v1/public/galleries/${slug}/consent/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          consent_text: copy.consentText,
          grants: grantSet,
        }),
        credentials: "same-origin",
      });
    } catch {
      // Non-fatal — banner UX should not block on network errors. The backend
      // will record the user as un-consented and the page can re-prompt later.
    }
    onAccept(grantSet);
  };

  const toggle = (p: ConsentPurpose) => {
    setGrants((g) => ({ ...g, [p]: !g[p] }));
  };

  const acceptAll = () => {
    const all = Object.fromEntries(
      (Object.keys(DEFAULT_GRANTS) as ConsentPurpose[]).map((k) => [k, true])
    ) as ConsentGrants;
    setGrants(all);
    void submit(all);
  };

  const acceptSelected = () => {
    if (!termsAccepted) return;
    void submit(grants);
  };

  const declineOptional = () => {
    const essentialsOnly = { ...DEFAULT_GRANTS, terms_of_service: true, dsar_processing: true };
    setGrants(essentialsOnly);
    void submit(essentialsOnly);
    onDismiss();
  };

  const groupedRows = useMemo(
    () =>
      GROUPS.map((g) => ({
        label: copy[g.key],
        rows: g.purposes.map((p) => ({
          key: p,
          label: copy.purposes[p].label,
          helper: copy.purposes[p].helper,
          granted: grants[p],
        })),
      })),
    [copy, grants]
  );

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 glass-card border-t border-glass-border shadow-glass max-h-[85vh] overflow-y-auto"
    >
      <div className="max-w-2xl mx-auto space-y-5">
        <header>
          <h3 id="consent-title" className="text-lg sm:text-xl font-semibold text-primary">
            {copy.title}
          </h3>
          <p className="text-sm text-secondary mt-1">{copy.lead}</p>
        </header>

        <div className="space-y-4">
          {groupedRows.map((group) => (
            <fieldset key={group.label} className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-secondary">
                {group.label}
              </legend>
              {group.rows.map((row) => (
                <label
                  key={row.key}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-glass-surface cursor-pointer min-h-[44px]"
                >
                  <input
                    type="checkbox"
                    checked={row.granted}
                    onChange={() => toggle(row.key)}
                    className="mt-1 w-5 h-5 rounded accent-accent"
                    aria-describedby={`helper-${row.key}`}
                  />
                  <span className="flex-1">
                    <span className="text-sm text-primary block">{row.label}</span>
                    <span id={`helper-${row.key}`} className="text-xs text-muted block mt-0.5">
                      {row.helper}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={acceptSelected}
            disabled={!termsAccepted}
            className="flex-1 min-h-[44px] py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {copy.accept}
          </button>
          <button
            type="button"
            onClick={acceptAll}
            className="min-h-[44px] px-5 py-3 rounded-xl glass-surface border border-glass-border text-primary text-sm"
          >
            {copy.acceptAll}
          </button>
          <button
            type="button"
            onClick={declineOptional}
            className="min-h-[44px] px-5 py-3 rounded-xl glass-surface border border-glass-border text-secondary text-sm"
          >
            {copy.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
