"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  listContacts,
  createContact,
  importContactsCSV,
  type Contact,
  type ContactImportResult,
} from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", contact_type: "client" });
  // CSV import state — we keep the file input hidden and drive it from a
  // visible "Import CSV" button. `importResult` doubles as the banner
  // payload so we can reuse the existing error/status styling.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ContactImportResult | null>(null);

  const refresh = useCallback(() => {
    const token = getStoredAccessToken();
    listContacts(token, search ? { search } : undefined)
      .then(setContacts)
      .catch((err) => { setError(err?.message || "Failed to load contacts"); setContacts([]); })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleImportClick = () => {
    setImportResult(null);
    setError(null);
    fileInputRef.current?.click();
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      const result = await importContactsCSV(token, file);
      setImportResult(result);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import contacts");
    } finally {
      setImporting(false);
      // Reset the input so the same filename can be re-selected if needed.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      await createContact(token, form);
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", contact_type: "client" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-surface-sunken rounded" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-surface-sunken rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Clients</h1>
          <p className="text-sm text-text-secondary mt-1">
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-sunken disabled:opacity-50 min-h-[44px]"
          >
            {importing ? "Importing…" : "Import CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportChange}
            className="hidden"
          />
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
          >
            + New Client
          </button>
        </div>
      </div>

      {importResult && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-text-primary">
          <p>
            Imported <strong>{importResult.imported}</strong> contact
            {importResult.imported === 1 ? "" : "s"}
            {importResult.skipped > 0 && (
              <>, skipped <strong>{importResult.skipped}</strong></>
            )}
            .
          </p>
          {importResult.errors && importResult.errors.length > 0 && (
            <details className="mt-2 text-xs text-text-secondary">
              <summary className="cursor-pointer">View {importResult.errors.length} warning{importResult.errors.length === 1 ? "" : "s"}</summary>
              <ul className="mt-1 list-disc pl-5">
                {importResult.errors.slice(0, 20).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <input
        type="text"
        placeholder="Search by name, email, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-base w-full max-w-md"
      />

      {showCreate && (
        <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">New Client</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
              autoFocus
            />
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            />
            <select
              value={form.contact_type}
              onChange={(e) => setForm({ ...form, contact_type: e.target.value })}
              className="rounded-xl border border-border-default bg-surface-sunken px-4 py-2.5 text-text-primary"
            >
              <option value="client">Client</option>
              <option value="lead">Lead</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowCreate(false); setForm({ name: "", email: "", phone: "", contact_type: "client" }); }}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
              className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Save Client"}
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-text-secondary">No clients found.</p>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px]"
            >
              + Add your first client
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <div
              key={c.id}
              className="bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent/30 transition-colors cursor-pointer flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-text-primary">{c.name}</p>
                <div className="flex items-center gap-3 mt-1 text-sm text-text-secondary">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.company && <span>{c.company}</span>}
                </div>
              </div>
              <div className="text-right">
                <span className="status-badge status-badge--accent capitalize">
                  {c.contact_type}
                </span>
                {c.total_revenue_paisa > 0 && (
                  <p className="text-xs text-text-tertiary mt-1">
                    ₹{(c.total_revenue_paisa / 100).toLocaleString("en-IN")}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
