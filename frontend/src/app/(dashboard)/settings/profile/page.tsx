"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_VISIBILITY,
  emptyPhotographerProfile,
  getPhotographerProfile,
  savePhotographerProfile,
  type PhotographerProfile,
} from "@/lib/api/photographer-profile";
import { listServicePackages, type ServicePackage } from "@/lib/api/billing";
import type { WorkspaceProfile } from "@/lib/api/workspace-profile";
import { authFetch } from "@/lib/api/authFetch";
import { normalizeCustomLinks } from "@/lib/profile-custom-links";
import {
  applyLinkedBusinessProfile,
  applyLinkedPricingProfile,
  linkedBusinessProfileFromPhotographer,
  linkedBusinessProfileFromWorkspace,
  linkedPricingProfileFromSources,
  type LinkedBusinessProfile,
  type LinkedPricingProfile,
} from "@/lib/profile-business-link";
import { CheckCircle } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";
import {
  SettingsAlert,
  SettingsPageHeader,
  SettingsPageShell,
} from "../_components/settings-page-shell";
import { AvatarCrop } from "./_components/avatar-crop";
import { EditForm } from "./_components/edit-form";
import { GalleryPicker } from "./_components/gallery-picker";
import { LivePreview } from "./_components/live-preview";

interface AccountProfile {
  display_name?: string;
  email?: string;
  phone?: string;
}

interface Requirement {
  key: string;
  label: string;
  ok: boolean;
}

function profileFromAccount(
  account: AccountProfile | null,
): PhotographerProfile {
  const profile = emptyPhotographerProfile();
  profile.primary_email = account?.email || "";
  profile.primary_phone = account?.phone || "";
  const parts = (account?.display_name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length > 1) {
    profile.first_name = parts.slice(0, -1).join(" ");
    profile.last_name = parts.at(-1) || "";
    profile.display_name = parts.join(" ");
  }
  return profile;
}

async function loadWorkspaceBusinessProfile(): Promise<WorkspaceProfile | null> {
  return authFetch("/api/v1/workspaces/current/profile")
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
}

async function loadServicePackages(): Promise<ServicePackage[]> {
  return listServicePackages("").catch(() => []);
}

function publicProfileRequirements(
  profile: PhotographerProfile,
): Requirement[] {
  const visibility = {
    ...DEFAULT_VISIBILITY,
    ...profile.visibility_config,
  };
  const hasPhoto = Boolean(profile.avatar_cropped_url || profile.avatar_url);
  const hasVisibleContact = Boolean(
    (visibility.show_email && profile.primary_email) ||
    (visibility.show_phone && profile.primary_phone) ||
    (visibility.show_whatsapp && profile.whatsapp_number),
  );

  return [
    {
      key: "last_name",
      label: "Last name",
      ok: Boolean(profile.last_name.trim()),
    },
    {
      key: "url_slug",
      label: "Public slug",
      ok: Boolean(profile.url_slug.trim()),
    },
    {
      key: "profile_photo",
      label: "Profile photo",
      ok: hasPhoto,
    },
    {
      key: "contact",
      label: "Visible email, phone, or WhatsApp",
      ok: hasVisibleContact,
    },
    {
      key: "gallery",
      label: "At least one featured gallery",
      ok: (profile.featured_galleries || []).length > 0,
    },
  ];
}

export default function ProfileSettingsPage() {
  const [profile, setProfile] = useState<PhotographerProfile>(() =>
    emptyPhotographerProfile(),
  );
  const [publicUrl, setPublicUrl] = useState("");
  const [linkedBusinessProfile, setLinkedBusinessProfile] =
    useState<LinkedBusinessProfile>(() =>
      linkedBusinessProfileFromWorkspace(null),
    );
  const [linkedPricingProfile, setLinkedPricingProfile] =
    useState<LinkedPricingProfile>(() =>
      linkedPricingProfileFromSources([], null, emptyPhotographerProfile()),
    );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback((message: string) => {
    setError(message);
    setNotice(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [profileBody, account, workspaceBusinessProfile, packages] =
          await Promise.all([
            getPhotographerProfile(),
            authFetch("/api/v1/users/profile")
              .then((res) => (res.ok ? res.json() : null))
              .catch(() => null),
            loadWorkspaceBusinessProfile(),
            loadServicePackages(),
          ]);
        if (cancelled) return;
        const next =
          profileBody.profile ||
          profileFromAccount(account as AccountProfile | null);
        const linkedBusiness = workspaceBusinessProfile
          ? linkedBusinessProfileFromWorkspace(workspaceBusinessProfile)
          : linkedBusinessProfileFromPhotographer(next);
        const linkedPricing = linkedPricingProfileFromSources(
          packages,
          workspaceBusinessProfile,
          next,
        );
        setLinkedBusinessProfile(linkedBusiness);
        setLinkedPricingProfile(linkedPricing);
        setProfile(
          applyLinkedPricingProfile(
            applyLinkedBusinessProfile(next, linkedBusiness),
            linkedPricing,
          ),
        );
        setPublicUrl(profileBody.public_url || "");
      } catch (err) {
        if (!cancelled) {
          reportError(
            err instanceof Error ? err.message : "Failed to load profile",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reportError]);

  const save = async () => {
    const [latestBusinessProfile, latestPackages] = await Promise.all([
      loadWorkspaceBusinessProfile(),
      loadServicePackages(),
    ]);
    const nextLinkedBusinessProfile = latestBusinessProfile
      ? linkedBusinessProfileFromWorkspace(latestBusinessProfile)
      : linkedBusinessProfile;
    const nextLinkedPricingProfile = linkedPricingProfileFromSources(
      latestPackages,
      latestBusinessProfile,
      profile,
    );
    const profileToSave = applyLinkedPricingProfile(
      applyLinkedBusinessProfile(profile, nextLinkedBusinessProfile),
      nextLinkedPricingProfile,
    );
    profileToSave.custom_links = normalizeCustomLinks(
      profileToSave.custom_links,
    );
    setLinkedBusinessProfile(nextLinkedBusinessProfile);
    setLinkedPricingProfile(nextLinkedPricingProfile);
    setProfile(profileToSave);

    const missing = profileToSave.is_public
      ? publicProfileRequirements(profileToSave).filter((item) => !item.ok)
      : [];
    if (missing.length) {
      reportError(
        `Public Profile needs: ${missing.map((item) => item.label).join(", ")}.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const body = await savePhotographerProfile(profileToSave);
      if (body.profile) {
        setProfile(
          applyLinkedPricingProfile(
            applyLinkedBusinessProfile(body.profile, nextLinkedBusinessProfile),
            nextLinkedPricingProfile,
          ),
        );
      }
      setPublicUrl(body.public_url || "");
      setNotice(
        body.profile?.is_public
          ? "Public Profile is live."
          : "Profile saved privately.",
      );
    } catch (err) {
      reportError(
        err instanceof Error ? err.message : "Failed to save profile",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SettingsPageShell>
        <div className="settings-panel settings-loading-panel" />
      </SettingsPageShell>
    );
  }

  const requirements = publicProfileRequirements(profile);
  const publicReady = requirements.every((item) => item.ok);
  const publicLive = profile.is_public && profile.status === "published";

  return (
    <SettingsPageShell>
      <SettingsPageHeader
        eyebrow="Personal"
        title="Personal Profile"
        badge={
          <span
            className={
              publicLive
                ? "status-badge status-badge--success"
                : "status-badge status-badge--neutral"
            }
          >
            {publicLive ? "Public" : "Private"}
          </span>
        }
        description={
          <>
            Build a mobile-first link-in-bio page at{" "}
            <span className="settings-panel-copy--strong">/p/slug</span>. Saved
            private details stay available when the public page is off.
          </>
        }
        actions={
          <GlassButton
            type="button"
            variant="surface"
            icon={<CheckCircle />}
            disabled={saving}
            onClick={save}
          >
            {saving ? "Saving" : "Save"}
          </GlassButton>
        }
      />

      {error ? <SettingsAlert tone="error">{error}</SettingsAlert> : null}
      {notice ? <SettingsAlert tone="success">{notice}</SettingsAlert> : null}

      <div className="settings-profile-layout">
        <div className="settings-profile-main">
          <AvatarCrop
            profile={profile}
            onProfileChange={setProfile}
            onError={reportError}
          />
          <EditForm
            profile={profile}
            linkedBusinessProfile={linkedBusinessProfile}
            linkedPricingProfile={linkedPricingProfile}
            publicProfile={{
              enabled: profile.is_public,
              ready: publicReady,
              requirements,
              onToggle: (enabled) =>
                setProfile({
                  ...profile,
                  is_public: enabled,
                  status: enabled ? profile.status : "draft",
                }),
            }}
            onChange={setProfile}
          />
          <GalleryPicker
            profile={profile}
            onProfileChange={setProfile}
            onError={reportError}
          />
        </div>
        <LivePreview
          profile={profile}
          publicUrl={publicUrl}
          onError={reportError}
        />
      </div>
    </SettingsPageShell>
  );
}
