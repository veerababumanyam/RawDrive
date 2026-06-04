"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createServicePackageAuth,
  deleteServicePackage,
  formatPaisa,
  listServicePackages,
  updateServicePackage,
  type PackageAddon,
  type ServicePackage,
} from "@/lib/api/billing";
import { getStoredAccessToken } from "@/lib/auth";
import { CRMSecondaryNav } from "@/components/crm/crm-secondary-nav";

type PackageForm = {
  name: string;
  description: string;
  inclusions: string;
  base_price_rupees: number;
  gst_rate: number;
  sac_code: string;
  addon_name: string;
  addon_price_rupees: number;
  addon_description: string;
};

const blankForm: PackageForm = {
  name: "",
  description: "",
  inclusions: "",
  base_price_rupees: 0,
  gst_rate: 18,
  sac_code: "998386",
  addon_name: "",
  addon_price_rupees: 0,
  addon_description: "",
};

export default function ServicePackagesPage() {
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [form, setForm] = useState<PackageForm>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const token = getStoredAccessToken();
    listServicePackages(token)
      .then(setPackages)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Failed to load packages",
        ),
      )
      .finally(() => setLoading(false));
  }, [refreshTick]);

  const payload = useMemo(() => {
    const addons: PackageAddon[] = [];
    if (form.addon_name.trim()) {
      addons.push({
        name: form.addon_name.trim(),
        description: form.addon_description.trim(),
        price_paisa: Math.round(form.addon_price_rupees * 100),
      });
    }
    return {
      name: form.name.trim(),
      description: form.description.trim(),
      inclusions: form.inclusions
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      base_price_paisa: Math.round(form.base_price_rupees * 100),
      gst_rate: form.gst_rate,
      sac_code: form.sac_code.trim() || "998386",
      active: true,
      addons,
    };
  }, [form]);

  const savePackage = async () => {
    if (!payload.name || saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = getStoredAccessToken();
      if (editingId) {
        await updateServicePackage(token, editingId, payload);
      } else {
        // QA #27: use createServicePackageAuth (authFetch 401 refresh) so
        // the package form never 401s mid-session.
        await createServicePackageAuth(payload);
      }
      setForm(blankForm);
      setEditingId(null);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save package");
    } finally {
      setSaving(false);
    }
  };

  const editPackage = (pkg: ServicePackage) => {
    const firstAddon = pkg.addons?.[0];
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description,
      inclusions: (pkg.inclusions || []).join("\n"),
      base_price_rupees: pkg.base_price_paisa / 100,
      gst_rate: pkg.gst_rate || 18,
      sac_code: pkg.sac_code || "998386",
      addon_name: firstAddon?.name || "",
      addon_price_rupees: firstAddon ? firstAddon.price_paisa / 100 : 0,
      addon_description: firstAddon?.description || "",
    });
  };

  const deactivatePackage = async (id: string) => {
    try {
      const token = getStoredAccessToken();
      await deleteServicePackage(token, id);
      setRefreshTick((n) => n + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to deactivate package",
      );
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-8 w-56 rounded-lg bg-surface-sunken animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <CRMSecondaryNav />

      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Service Packages
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Wedding packages that fill invoice line items in one click.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">
          {editingId ? "Edit Package" : "New Package"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input-field"
            placeholder="Package name"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="input-field"
            placeholder="Short description"
          />
          <input
            type="number"
            min="0"
            value={form.base_price_rupees}
            onChange={(e) =>
              setForm({
                ...form,
                base_price_rupees: Number(e.target.value) || 0,
              })
            }
            className="input-field"
            placeholder="Base price"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              max="28"
              value={form.gst_rate}
              onChange={(e) =>
                setForm({ ...form, gst_rate: Number(e.target.value) || 18 })
              }
              className="input-field"
              placeholder="GST %"
            />
            <input
              value={form.sac_code}
              onChange={(e) => setForm({ ...form, sac_code: e.target.value })}
              className="input-field"
              placeholder="SAC"
            />
          </div>
        </div>
        <textarea
          value={form.inclusions}
          onChange={(e) => setForm({ ...form, inclusions: e.target.value })}
          className="input-field min-h-28 resize-y"
          placeholder={
            "One inclusion per line\nTwo photographers\nEdited photos\nAlbum design"
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            value={form.addon_name}
            onChange={(e) => setForm({ ...form, addon_name: e.target.value })}
            className="input-field"
            placeholder="Optional add-on"
          />
          <input
            type="number"
            min="0"
            value={form.addon_price_rupees}
            onChange={(e) =>
              setForm({
                ...form,
                addon_price_rupees: Number(e.target.value) || 0,
              })
            }
            className="input-field"
            placeholder="Add-on price"
          />
          <input
            value={form.addon_description}
            onChange={(e) =>
              setForm({ ...form, addon_description: e.target.value })
            }
            className="input-field"
            placeholder="Add-on note"
          />
        </div>
        <div className="flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(blankForm);
              }}
              className="rounded-xl border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={savePackage}
            disabled={saving || !payload.name}
            className="rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-text-inverse hover:bg-accent-primary/90 disabled:opacity-50 min-h-[44px]"
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save Package"
                : "Create Package"}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        {packages.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-default p-10 text-center text-sm text-text-secondary">
            No packages yet.
          </div>
        ) : (
          packages.map((pkg) => (
            <article
              key={pkg.id}
              className="rounded-2xl border border-border-default bg-surface-raised p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {pkg.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {pkg.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-tertiary">
                    <span>{formatPaisa(pkg.base_price_paisa)}</span>
                    <span>{pkg.gst_rate}% GST</span>
                    <span>SAC {pkg.sac_code}</span>
                    {pkg.addons?.length ? (
                      <span>{pkg.addons.length} add-on</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => editPackage(pkg)}
                    className="rounded-xl border border-border-default px-4 py-2 text-sm text-text-secondary hover:bg-surface-sunken min-h-[44px]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deactivatePackage(pkg.id)}
                    className="rounded-xl border border-error/30 px-4 py-2 text-sm text-error hover:bg-error/10 min-h-[44px]"
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
