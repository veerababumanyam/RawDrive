"use client";

import { useState } from "react";

interface ConsentBannerProps {
  slug: string;
  onAccept: (consent: { terms: boolean; notifications: boolean; biometric: boolean }) => void;
  onDismiss: () => void;
  language?: "en" | "hi";
}

const COPY = {
  en: {
    title: "Privacy & Consent",
    terms: "I accept the terms of service",
    notifications: "Send me proofing updates",
    biometric: "Allow face recognition for photo finding",
    accept: "Continue",
    decline: "Browse without features",
  },
  hi: {
    title: "गोपनीयता और सहमति",
    terms: "मैं सेवा की शर्तों को स्वीकार करता/करती हूँ",
    notifications: "मुझे प्रूफिंग अपडेट भेजें",
    biometric: "फोटो खोजने के लिए चेहरे की पहचान की अनुमति दें",
    accept: "जारी रखें",
    decline: "सुविधाओं के बिना ब्राउज़ करें",
  },
};

export function ConsentBanner({ slug, onAccept, onDismiss, language = "en" }: ConsentBannerProps) {
  const [terms, setTerms] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const copy = COPY[language];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 glass-card border-t border-glass-border shadow-glass">
      <div className="max-w-2xl mx-auto space-y-4">
        <h3 className="text-lg font-semibold text-primary">{copy.title}</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
              className="w-5 h-5 rounded accent-accent" />
            <span className="text-sm text-secondary">{copy.terms}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={notifications} onChange={e => setNotifications(e.target.checked)}
              className="w-5 h-5 rounded accent-accent" />
            <span className="text-sm text-secondary">{copy.notifications}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={biometric} onChange={e => setBiometric(e.target.checked)}
              className="w-5 h-5 rounded accent-accent" />
            <span className="text-sm text-secondary">{copy.biometric}</span>
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { if (terms) onAccept({ terms, notifications, biometric }); }}
            disabled={!terms}
            className="flex-1 py-3 rounded-xl bg-accent text-white font-medium disabled:opacity-50"
          >
            {copy.accept}
          </button>
          <button
            onClick={onDismiss}
            className="px-6 py-3 rounded-xl glass-surface border border-glass-border text-secondary text-sm"
          >
            {copy.decline}
          </button>
        </div>
      </div>
    </div>
  );
}
