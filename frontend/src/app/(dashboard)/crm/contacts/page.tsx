"use client";

import { useState, useEffect } from "react";
import { listContacts, type Contact } from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const token = getStoredAccessToken();
    listContacts(token, search ? { search } : undefined)
      .then(setContacts)
      .catch((err) => { setError(err?.message || "Failed to load contacts"); setContacts([]); })
      .finally(() => setLoading(false));
  }, [search]);

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
      </div>

      <input
        type="text"
        placeholder="Search by name, email, or phone..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="input-base w-full max-w-md"
      />

      {contacts.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-text-secondary">No clients found.</p>
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
