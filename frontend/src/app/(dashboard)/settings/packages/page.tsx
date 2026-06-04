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
import { Pencil, Plus, Trash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GlassButton } from "@/components/ui/glass-button";

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

const INPUT_CLASS = "input-base w-full text-sm";
const TEXTAREA_CLASS = "input-base textarea-min-block w-full resize-y text-sm";

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
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Card
          variant="panel"
          padding="md"
          className="max-w-xl animate-pulse"
          aria-label="Loading service packages"
        >
          <div className="h-5 w-56 rounded-md bg-surface-sunken" />
          <div className="mt-3 h-4 w-80 max-w-full rounded-md bg-surface-sunken" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
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
        <div className="rounded-xl border border-feedback-error/20 bg-feedback-error/10 px-4 py-3 text-sm text-feedback-error">
          {error}
        </div>
      )}

      <Card variant="panel" padding="md" aria-labelledby="package-form-title">
        <CardHeader>
          <CardTitle id="package-form-title">
            {editingId ? "Edit Package" : "New Package"}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              aria-label="Package name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={INPUT_CLASS}
              placeholder="Package name"
            />
            <input
              aria-label="Short description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className={INPUT_CLASS}
              placeholder="Short description"
            />
            <input
              type="number"
              min="0"
              aria-label="Base price"
              value={form.base_price_rupees}
              onChange={(e) =>
                setForm({
                  ...form,
                  base_price_rupees: Number(e.target.value) || 0,
                })
              }
              className={INPUT_CLASS}
              placeholder="Base price"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                max="28"
                aria-label="GST rate"
                value={form.gst_rate}
                onChange={(e) =>
                  setForm({ ...form, gst_rate: Number(e.target.value) || 18 })
                }
                className={INPUT_CLASS}
                placeholder="GST %"
              />
              <input
                aria-label="SAC code"
                value={form.sac_code}
                onChange={(e) => setForm({ ...form, sac_code: e.target.value })}
                className={INPUT_CLASS}
                placeholder="SAC"
              />
            </div>
          </div>

          <textarea
            aria-label="Package inclusions"
            value={form.inclusions}
            onChange={(e) => setForm({ ...form, inclusions: e.target.value })}
            className={TEXTAREA_CLASS}
            placeholder={
              "One inclusion per line\nTwo photographers\nEdited photos\nAlbum design"
            }
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              aria-label="Add-on name"
              value={form.addon_name}
              onChange={(e) => setForm({ ...form, addon_name: e.target.value })}
              className={INPUT_CLASS}
              placeholder="Optional add-on"
            />
            <input
              type="number"
              min="0"
              aria-label="Add-on price"
              value={form.addon_price_rupees}
              onChange={(e) =>
                setForm({
                  ...form,
                  addon_price_rupees: Number(e.target.value) || 0,
                })
              }
              className={INPUT_CLASS}
              placeholder="Add-on price"
            />
            <input
              aria-label="Add-on note"
              value={form.addon_description}
              onChange={(e) =>
                setForm({ ...form, addon_description: e.target.value })
              }
              className={INPUT_CLASS}
              placeholder="Add-on note"
            />
          </div>
        </CardContent>

        <CardFooter className="flex-wrap justify-end gap-2">
          {editingId && (
            <GlassButton
              type="button"
              variant="surface"
              onClick={() => {
                setEditingId(null);
                setForm(blankForm);
              }}
            >
              Cancel
            </GlassButton>
          )}
          <GlassButton
            type="button"
            variant="primary"
            icon={
              editingId ? (
                <Pencil aria-hidden="true" />
              ) : (
                <Plus aria-hidden="true" />
              )
            }
            onClick={savePackage}
            disabled={saving || !payload.name}
          >
            {saving
              ? "Saving..."
              : editingId
                ? "Save Package"
                : "Create Package"}
          </GlassButton>
        </CardFooter>
      </Card>

      <section className="space-y-3">
        {packages.length === 0 ? (
          <Card
            variant="panel"
            padding="lg"
            className="text-center text-sm text-text-secondary"
          >
            No packages yet.
          </Card>
        ) : (
          packages.map((pkg) => (
            <Card key={pkg.id} variant="panel" padding="md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {pkg.name}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {pkg.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="accent">
                      {formatPaisa(pkg.base_price_paisa)}
                    </Badge>
                    <Badge variant="neutral">{pkg.gst_rate}% GST</Badge>
                    <Badge variant="neutral">SAC {pkg.sac_code}</Badge>
                    {pkg.addons?.length ? (
                      <Badge variant="neutral">
                        {pkg.addons.length} add-on
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <GlassButton
                    type="button"
                    variant="surface"
                    icon={<Pencil aria-hidden="true" />}
                    onClick={() => editPackage(pkg)}
                  >
                    Edit
                  </GlassButton>
                  <GlassButton
                    type="button"
                    variant="danger"
                    icon={<Trash aria-hidden="true" />}
                    onClick={() => deactivatePackage(pkg.id)}
                  >
                    Deactivate
                  </GlassButton>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
