"use client";

import { useEffect, useState } from "react";
import { getStoredAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Profile {
  name: string;
  gstin: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  signature_name: string;
  invoice_terms: string;
  invoice_footer: string;
}

const EMPTY_PROFILE: Profile = {
  name: "", gstin: "", address_line1: "", address_line2: "",
  city: "", postal_code: "", phone: "", email: "", website: "",
  logo_url: "", bank_name: "", bank_account_holder: "",
  bank_account_number: "", bank_ifsc: "", bank_branch: "",
  signature_name: "", invoice_terms: "", invoice_footer: "",
};

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE}/api/v1/workspaces/current/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : EMPTY_PROFILE)
      .then((data) => setProfile({ ...EMPTY_PROFILE, ...data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedNotice(null);
    try {
      const token = getStoredAccessToken();
      const res = await fetch(`${API_BASE}/api/v1/workspaces/current/profile`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      setSavedNotice("Saved. New invoices will use this profile.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((p) => ({ ...p, [k]: e.target.value }));

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="animate-pulse h-96 bg-surface-sunken rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      {savedNotice && (
        <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {savedNotice}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Business Profile</h1>
        <p className="text-sm text-text-secondary mt-1">
          Fill in your studio details. These appear on every invoice PDF you generate.
        </p>
      </div>

      <section className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Studio Identity</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Studio name
            <input type="text" value={profile.name} onChange={set("name")} className="input-field" placeholder="e.g. Pho Pro Studio" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            GSTIN
            <input type="text" value={profile.gstin} onChange={set("gstin")} className="input-field" placeholder="15-char GSTIN" maxLength={15} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Address line 1
            <input type="text" value={profile.address_line1} onChange={set("address_line1")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Address line 2
            <input type="text" value={profile.address_line2} onChange={set("address_line2")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            City / State
            <input type="text" value={profile.city} onChange={set("city")} className="input-field" placeholder="Hyderabad, Telangana" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Postal code
            <input type="text" value={profile.postal_code} onChange={set("postal_code")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Phone
            <input type="tel" value={profile.phone} onChange={set("phone")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Billing email
            <input type="email" value={profile.email} onChange={set("email")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
            Website
            <input type="url" value={profile.website} onChange={set("website")} className="input-field" placeholder="https://…" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Bank Details</h2>
        <p className="text-xs text-text-secondary">
          Shown on the invoice so clients can transfer directly. Leave blank to hide the bank block.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Bank name
            <input type="text" value={profile.bank_name} onChange={set("bank_name")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Account holder
            <input type="text" value={profile.bank_account_holder} onChange={set("bank_account_holder")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Account number
            <input type="text" value={profile.bank_account_number} onChange={set("bank_account_number")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            IFSC
            <input type="text" value={profile.bank_ifsc} onChange={set("bank_ifsc")} className="input-field" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary sm:col-span-2">
            Branch
            <input type="text" value={profile.bank_branch} onChange={set("bank_branch")} className="input-field" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Invoice Customization</h2>
        <div className="grid grid-cols-1 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Signature name (shown below the signature line)
            <input type="text" value={profile.signature_name} onChange={set("signature_name")} className="input-field" placeholder="Authorized Signatory" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Terms &amp; conditions (one per line)
            <textarea
              value={profile.invoice_terms}
              onChange={set("invoice_terms")}
              className="input-field resize-y min-h-[120px]"
              placeholder="Payment due within 15 days.&#10;18% GST applicable.&#10;Disputes subject to local jurisdiction."
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Invoice footer note
            <input type="text" value={profile.invoice_footer} onChange={set("invoice_footer")} className="input-field" placeholder="Thank you for your business." />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-accent-primary px-6 py-3 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
        >
          {saving ? "Saving…" : "Save business profile"}
        </button>
      </div>

      <style jsx>{`
        .input-field {
          border-radius: 12px;
          border: 1px solid var(--border-default);
          background-color: var(--surface-sunken);
          padding: 10px 16px;
          color: var(--text-primary);
          font-size: 14px;
        }
        .input-field:focus {
          outline: none;
          border-color: var(--accent-primary);
        }
      `}</style>
    </div>
  );
}
