"use client";

import { useEffect, useState } from "react";
import { UserPlus, X, Building2, Phone, Mail, MapPin } from "lucide-react";
import {
  listSubDealers,
  createSubDealer,
  type SubDealer,
  type CreateSubDealerRequest,
} from "@/lib/api/dealer";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending: "Pending",
  suspended: "Suspended",
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-feedback-success",
  pending: "text-feedback-warning",
  suspended: "text-feedback-error",
};

function AddSubDealerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (sd: SubDealer) => void;
}) {
  const [form, setForm] = useState<CreateSubDealerRequest>({
    name: "",
    city_district: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.city_district.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const sd = await createSubDealer(form);
      onCreated(sd);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to register sub-dealer",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-scrim-strong/50 glass-blur-subtle p-4"
      onClick={onClose}
    >
      <div
        className="glass-card w-full max-w-md rounded-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              Register Sub-Dealer
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Add a city/district representative
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-surface-overlay/10 transition-colors text-text-tertiary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Full Name <span className="text-feedback-error">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl bg-surface-overlay/5 border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="Sub-dealer's full name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              City / District <span className="text-feedback-error">*</span>
            </label>
            <input
              type="text"
              required
              value={form.city_district}
              onChange={(e) =>
                setForm((f) => ({ ...f, city_district: e.target.value }))
              }
              className="w-full rounded-xl bg-surface-overlay/5 border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="e.g. Visakhapatnam"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              className="w-full rounded-xl bg-surface-overlay/5 border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Phone
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) =>
                setForm((f) => ({ ...f, phone: e.target.value }))
              }
              className="w-full rounded-xl bg-surface-overlay/5 border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
              placeholder="+91 98765 43210"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              className="w-full rounded-xl bg-surface-overlay/5 border border-border-subtle px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
              placeholder="Optional remarks"
            />
          </div>

          {error && <p className="text-sm text-feedback-error">{error}</p>}

          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.city_district.trim()}
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-text-media transition-opacity disabled:opacity-50"
          >
            {saving ? "Registering…" : "Register Sub-Dealer"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function DealerRegistrationsPage() {
  const [subDealers, setSubDealers] = useState<SubDealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSubDealers()
      .then((data) => {
        if (!cancelled) setSubDealers(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load sub-dealers",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreated = (sd: SubDealer) => {
    setSubDealers((prev) => [sd, ...prev]);
    setShowModal(false);
  };

  // Group sub-dealers by city_district for cleaner display
  const grouped = subDealers.reduce<Record<string, SubDealer[]>>((acc, sd) => {
    const key = sd.city_district;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sd);
    return acc;
  }, {});
  const cities = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-text-primary">
            Registrations
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sub-dealers you have registered for cities and districts in your
            state.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-text-media transition-opacity hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" />
          Add Sub-Dealer
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card rounded-2xl p-8 text-center text-sm text-text-tertiary animate-pulse">
          Loading…
        </div>
      ) : cities.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-4 rounded-2xl p-12 text-center">
          <Building2 className="h-12 w-12 text-text-tertiary" />
          <div>
            <p className="text-sm font-medium text-text-secondary">
              No sub-dealers yet
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Add sub-dealers to cover cities and districts in your state.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {cities.map((city) => (
            <div key={city} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border-subtle bg-surface-overlay/5">
                <MapPin className="h-4 w-4 text-text-tertiary" />
                <span className="text-sm font-semibold text-text-primary">
                  {city}
                </span>
                <span className="ml-auto text-xs text-text-tertiary">
                  {grouped[city].length} sub-dealer
                  {grouped[city].length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-border-subtle/60">
                {grouped[city].map((sd) => (
                  <div
                    key={sd.id}
                    className="px-5 py-3 flex items-center gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">
                        {sd.name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {sd.email && (
                          <span className="flex items-center gap-1 text-xs text-text-tertiary">
                            <Mail className="h-3 w-3" />
                            {sd.email}
                          </span>
                        )}
                        {sd.phone && (
                          <span className="flex items-center gap-1 text-xs text-text-tertiary">
                            <Phone className="h-3 w-3" />
                            {sd.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium ${STATUS_COLOR[sd.status] ?? "text-text-tertiary"}`}
                    >
                      {STATUS_LABEL[sd.status] ?? sd.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddSubDealerModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
