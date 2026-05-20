"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Cloud,
  FileText,
  MoreVertical,
  Plus,
  Sparkles,
  UserPlus,
  Wallet,
} from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import { authFetch } from "@/lib/api/authFetch";
import { listGalleries, type Gallery } from "@/lib/api/galleries";
import { getCurrentUser, type CurrentUser } from "@/lib/api/auth";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";
import { PwaInstallCard } from "@/components/pwa/install-card";
import { cn } from "@/lib/utils";

type GalleryCard = {
  id: string;
  title: string;
  meta: string;
  client: string;
  status: string;
  chipClass: string;
  image?: string;
};

const quickActions = [
  { label: "Create Gallery", icon: Plus, href: "/galleries" },
  { label: "Send Invoice", icon: Wallet, href: "/billing" },
  { label: "Add Client", icon: UserPlus, href: "/crm/contacts" },
  { label: "New Booking", icon: Sparkles, href: "/calendar" },
];

// First-name extraction for the greeting banner. Falls back to the
// email local-part when the user has not set a display name, and
// finally to a neutral "there" so we never render an empty greeting.
// This replaces the literal "Welcome back, Arjun!" hardcode that
// shipped in the earlier landing-redesign build.
function greetingName(user: CurrentUser | null): string {
  if (!user) return "there";
  const displayName = (user.display_name || "").trim();
  if (displayName) return displayName.split(/\s+/)[0];
  const email = (user.email || "").trim();
  if (email) return email.split("@")[0];
  return "there";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function DashboardPage() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    const token = getStoredAccessToken();
    listGalleries(token)
      .then((data) => setGalleries(data ?? []))
      .catch((err) => { setError(err?.message || "Failed to load galleries"); setGalleries([]); })
      .finally(() => setLoading(false));
    // Fetch the logged-in user's profile for the greeting banner. A
    // failed /auth/me call degrades gracefully to a neutral greeting.
    getCurrentUser(token).then(setUser).catch(() => setUser(null));
  }, []);

  // Cards render the real galleries. When there are none, the UI
  // shows an empty state further down rather than the old placeholder
  // fallback set which leaked a different studio's fake data into
  // every fresh account.
  //
  // Cover image: gallery.cover_thumbnails carries the LEFT JOIN'd
  // thumbnail map (thumb_sm_webp / thumb_md_webp / thumb_lg_webp /
  // display_webp) for the gallery's chosen cover asset, populated by
  // listGalleries. getAssetPreviewUrl picks the preferred size and
  // signs the URL with the access token so the backend's auth-gated
  // asset endpoint accepts the request. Without this the card tile
  // rendered with no background and just the "Delivered" chip floated
  // on the empty placeholder — the bug from the dashboard screenshot.
  const cards = useMemo<GalleryCard[]>(
    () => {
      const token = getStoredAccessToken();
      return galleries.slice(0, 4).map((gallery) => {
        const coverUrl = getAssetPreviewUrl(
          { thumbnail_urls: gallery.cover_thumbnails || {} },
          token,
        );
        return {
          id: gallery.id,
          title: gallery.title,
          meta: `${gallery.gallery_type} • ${new Date(gallery.created_at).toLocaleDateString("en-IN")}`,
          client: "Studio Client",
          status: gallery.is_published ? "Delivered" : "Draft",
          chipClass: gallery.is_published
            ? "bg-accent-subtle text-accent"
            : "bg-surface-container-high text-text-primary",
          image: coverUrl || undefined,
        };
      });
    },
    [galleries],
  );

  // Fetch real storage usage from API
  const [storageUsed, setStorageUsed] = useState<string>("— / —");
  const [storageMeta, setStorageMeta] = useState<string>("loading");
  const [storagePercent, setStoragePercent] = useState<number>(0);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    authFetch("/api/v1/storage/usage")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.data) {
          const used = data.data.used_bytes || 0;
          const quota = data.data.quota_bytes || 0;
          const pct = data.data.percent_used || 0;
          const fmt = (b: number) => {
            if (b === 0) return "0 B";
            const u = ["B", "KB", "MB", "GB", "TB"];
            const i = Math.floor(Math.log(b) / Math.log(1024));
            return `${(b / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
          };
          setStorageUsed(`${fmt(used)} / ${fmt(quota)}`);
          setStorageMeta(`${Math.round(pct)}% used`);
          setStoragePercent(Math.min(Math.round(pct), 100));
        }
      })
      .catch(() => {
        setStorageUsed("— / —");
        setStorageMeta("unavailable");
      });
  }, []);

  const stats = useMemo(
    () => [
      {
        label: "Total Galleries",
        value: galleries.length > 0 ? galleries.length.toString() : "0",
        meta: "",
        toneClass: "text-accent",
      },
      { label: "Active Clients", value: "—", meta: "", toneClass: "text-accent-primary" },
      {
        label: "Storage Used",
        value: storageUsed,
        meta: storageMeta,
        toneClass: "text-accent-secondary",
      },
      {
        label: "Revenue This Month",
        value: "—",
        meta: "",
        toneClass: "text-accent-tertiary",
      },
    ],
    [galleries.length, storageUsed, storageMeta, storagePercent],
  );

  return (
    <div className="space-y-8">
      {error && (
        <div className="mb-4 rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}
      <section className="glass-card relative overflow-hidden p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-accent-muted blur-[100px]" />
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-text-primary">
              Welcome back, {greetingName(user)}!
            </h1>
            <p className="mt-2 max-w-2xl text-text-secondary">
              {galleries.length === 0
                ? "Create your first gallery to start delivering work to clients."
                : `You have ${galleries.length} ${galleries.length === 1 ? "gallery" : "galleries"} in your studio. Let's make some magic.`}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-text-tertiary transition-colors hover:bg-surface-container-high hover:text-text-primary"
            aria-label="Dismiss welcome banner"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <article
            key={stat.label}
            className="surface-panel rounded-xl p-6 transition-colors hover:bg-surface-container-high"
          >
            <div className="mb-4 flex items-start justify-between">
              <Cloud className={cn("h-5 w-5", stat.toneClass)} />
              <span
                className={cn(
                  "rounded-full bg-surface-container-high px-2 py-1 text-[10px] font-semibold",
                  stat.toneClass,
                )}
              >
                {stat.meta}
              </span>
            </div>
            <p className="text-xs uppercase tracking-[0.22em] text-text-tertiary">{stat.label}</p>
            <p className={cn("mt-3 font-headline text-3xl font-bold", stat.toneClass)}>
              {stat.value}
            </p>
            {stat.label === "Storage Used" ? (
              <div className="mt-4 h-1.5 rounded-full bg-surface-container-high">
                <div className="h-1.5 rounded-full bg-accent" style={{ width: `${storagePercent}%` }} />
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <div className="grid grid-cols-12 gap-8">
        <section className="col-span-12 lg:col-span-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-headline text-xl font-bold text-text-primary">Recent Galleries</h2>
              <p className="text-sm text-text-secondary">Manage and share your latest shoots</p>
            </div>
            <Link href="/galleries" className="text-sm font-semibold text-accent hover:underline">
              View All
            </Link>
          </div>

          {loading ? (
            <div className="grid gap-6 md:grid-cols-2">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-80 animate-pulse rounded-2xl bg-surface-container-high" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-default p-10 text-center">
              <p className="text-text-secondary">No galleries yet.</p>
              <Link
                href="/galleries"
                className="mt-4 inline-block rounded-xl bg-accent-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90"
              >
                + Create your first gallery
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {cards.map((card) => (
                <Link
                  key={card.id}
                  href={card.id.startsWith("/") ? card.id : `/galleries/${card.id}`}
                  className="surface-panel group overflow-hidden rounded-2xl transition-transform duration-300 hover:scale-[1.02]"
                >
                  <div
                    className="relative h-48 bg-surface-container-high"
                    style={
                      card.image
                        ? {
                            backgroundImage: `linear-gradient(to top, var(--surface-scrim), transparent), url(${card.image})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          }
                        : undefined
                    }
                  >
                    <div className="absolute bottom-4 left-4">
                      <span
                        className={cn(
                          "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]",
                          card.chipClass,
                        )}
                      >
                        {card.status}
                      </span>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-headline text-lg font-bold text-text-primary">
                          {card.title}
                        </h3>
                        <p className="mt-1 text-xs text-text-secondary">{card.meta}</p>
                      </div>
                      <MoreVertical className="h-4 w-4 text-text-tertiary transition-colors group-hover:text-text-primary" />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-container-high text-[10px] font-bold text-text-primary">
                        {initials(card.client)}
                      </div>
                      <span className="text-xs text-text-secondary">{card.client}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="col-span-12 space-y-8 lg:col-span-4">
          {/* PWA install card — surfaces a friendly install button
              right inside the dashboard. Self-hides when the app is
              already installed; on browsers where the native install
              prompt isn't available yet (Safari, Firefox, or Chromium
              before its installability heuristic fires) it falls back
              to browser-specific written instructions. */}
          <PwaInstallCard />

          <section className="surface-panel p-6">
            <h3 className="mb-6 font-headline text-lg font-bold text-text-primary">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              {quickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="group flex flex-col items-center justify-center rounded-xl bg-surface-container-high p-4 text-accent transition-colors hover:bg-surface-container-highest"
                >
                  <action.icon className="mb-2 h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="text-xs font-semibold">{action.label}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="surface-panel p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-headline text-lg font-bold text-text-primary">Recent Activity</h3>
              <FileText className="h-4 w-4 text-text-tertiary" />
            </div>

            {galleries.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Activity will show up here once you start uploading photos and working with clients.
              </p>
            ) : (
              <div className="space-y-6">
                {galleries.slice(0, 4).map((gallery) => (
                  <div key={gallery.id} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm leading-tight text-text-primary">
                        Gallery <span className="font-semibold">{gallery.title}</span> {gallery.is_published ? "published" : "created"}
                      </p>
                      <p className="mt-1 text-xs text-text-secondary">
                        {new Date(gallery.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* E76-S1: Gallery Activity Widget */}
          <section className="surface-panel p-5 space-y-4">
            <h2 className="text-base font-semibold text-text-primary">Gallery Activity</h2>
            <GalleryActivityWidget />
          </section>
        </aside>
      </div>
    </div>
  );
}

function GalleryActivityWidget() {
  const [stats, setStats] = useState<{ views: number; downloads: number; selections: number; activeGalleries: number } | null>(null);

  useEffect(() => {
    if (!getStoredAccessToken()) return;
    authFetch("/api/v1/dashboard/gallery-activity?days=7")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.data) setStats(d.data); })
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {["Views (7d)", "Downloads (7d)", "Selections (7d)", "Active Galleries"].map((label) => (
          <div key={label} className="rounded-xl bg-surface-sunken p-3 text-center">
            <p className="text-lg font-bold text-text-primary">—</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl bg-surface-sunken p-3 text-center">
        <p className="text-lg font-bold text-text-primary">{stats.views.toLocaleString()}</p>
        <p className="text-[10px] text-text-tertiary mt-0.5">Views (7d)</p>
      </div>
      <div className="rounded-xl bg-surface-sunken p-3 text-center">
        <p className="text-lg font-bold text-text-primary">{stats.downloads.toLocaleString()}</p>
        <p className="text-[10px] text-text-tertiary mt-0.5">Downloads (7d)</p>
      </div>
      <div className="rounded-xl bg-surface-sunken p-3 text-center">
        <p className="text-lg font-bold text-text-primary">{stats.selections.toLocaleString()}</p>
        <p className="text-[10px] text-text-tertiary mt-0.5">Selections (7d)</p>
      </div>
      <div className="rounded-xl bg-surface-sunken p-3 text-center">
        <p className="text-lg font-bold text-text-primary">{stats.activeGalleries}</p>
        <p className="text-[10px] text-text-tertiary mt-0.5">Active Galleries</p>
      </div>
    </div>
  );
}
