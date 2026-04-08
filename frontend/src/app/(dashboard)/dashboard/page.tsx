"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Cloud,
  FileText,
  MessageSquare,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  UserPlus,
  Wallet,
} from "lucide-react";
import { getStoredAccessToken } from "@/lib/auth";
import { listGalleries, type Gallery } from "@/lib/api/galleries";
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

const fallbackGalleries: GalleryCard[] = [
  {
    id: "malhotra-wedding",
    title: "Malhotra Wedding",
    meta: "24 Oct 2023 • 420 Photos",
    client: "Rohan Malhotra",
    status: "Delivered",
    chipClass: "bg-accent-subtle text-accent",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAJnvuEojfIFWF77Lh3_yZrdT4j-IAoyp1WQUi-x2IVqd39GB95-tyHqEHUoVj3hpaYWaxvcYTOnjHganqu9oXCAdga4KJqKrjdlonpMUIJg73phQcf9JOI9Z_PfYW7oUENm1ZC22QEVtoMXNvZJRjFZrM_wrGlJ4qDT1bYjVEDyAmk2DfTUYB3CD_DivgzT89zkULr_aEG8SfO4fNgMPzj55Pv9aDDi4EGPta615KEym4Ec4Z4R0Q4tRk_2erju8T9guPFDZjc_w4",
  },
  {
    id: "techcorp-portraits",
    title: "TechCorp Executive Portraits",
    meta: "22 Oct 2023 • 85 Photos",
    client: "Anita Desai",
    status: "Processing",
    chipClass: "bg-surface-container-high text-text-primary",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuADbROUc7A0o-GjmiFxsEPXwxCw_XQOUjLNR-hYJuozDR_JtNXpRDJO8iJa2yLspknahTDwN8ngse4FoCssaVyWEAKKgo0DkJ7VQ_5inIiO-DjXJTPWtz_Zqji9NcKVISG94COTw6A9f_5w5LUToN9FqNl5hivulzc7D7ORWJ95EmHC_Af_XmgofHnYgSnK-zCVn-iTxvyYmF--cjmAbuY9ShVOH_cxg0-7RHiXChS_bHykLCYdzQPWBekKqFQf3yXfMyMjPg80hrw",
  },
  {
    id: "ladakh-expedition",
    title: "Ladakh Expedition",
    meta: "18 Oct 2023 • 1,200 Photos",
    client: "NatGeo Project",
    status: "Shared",
    chipClass: "bg-surface-container-high text-text-primary",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBZ7sLCJ7t_OU0zWPkHnE-WZuQs_7xaeZFW7zBom9jOGbPuOuyiNSP19kgVt77CpDUhDH_7_ZW8F8YGMh7M2YGHD7KwO7jaGaUbSpCmg6gWIWNC6qxK2DTIHpChX5Hr-CCQppoiGBBIpl1DNJpXt-_5VbcvkPwZgY3Ocvc3T_umGxKLr2hpGu_nVDecMgZQPpLEYoLSBB0ys1kWYPwJlzFwLaZuob168bTvqZg1gh5kElgxX0Wpne13fqO3B24lrm0kVkII07xqQOQ",
  },
  {
    id: "neon-summer-editorial",
    title: "Neon Summer Editorial",
    meta: "15 Oct 2023 • 56 Photos",
    client: "Vogue Magazine",
    status: "Draft",
    chipClass: "bg-surface-container-high text-text-primary",
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuD1F5cP6bSLB8Bla1QTLzn3cPy8UO47g0UNtCk_K4XjjrJIUf6W8FhOuyW7b_8jO2SQ6xSAZ9QKN6uuZeMvuEdAGtlQXy_z09cf35amVWSbQNZ9ZEfxkvzOcI4TRexP_vwVkJqxjEy8WwXHR-xoi1XTQYLRO6Bpc8_AzL9VFPMijELhUJfVATk73QkyzOmqq-ehP5Z5a2f-oovS3VZ6tsEfvvXrFYMrjQc7cdmtwHm1ANWaeSosJ3s53NWQI3Y4wwc87LsaMHdJ5ac",
  },
];

const quickActions = [
  { label: "Create Gallery", icon: Plus },
  { label: "Send Invoice", icon: Wallet },
  { label: "Add Client", icon: UserPlus },
  { label: "New Booking", icon: Sparkles },
];

const recentActivity = [
  { copy: "New booking from Priya Sharma", at: "Today, 2:45 PM", icon: Sparkles },
  { copy: "Gallery Sharma Wedding delivered", at: "Yesterday, 6:20 PM", icon: Send },
  { copy: "Invoice #1024 paid Rs. 35,000", at: "2 days ago", icon: CheckCircle2 },
  { copy: "Vikram Roy commented on a photo", at: "3 days ago", icon: MessageSquare },
];

const metadataPresets = ["f/1.8 Prime", "ISO 100", "1/250s", "35mm", "Vivid Dark"];

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

  useEffect(() => {
    const token = getStoredAccessToken();
    listGalleries(token)
      .then((data) => setGalleries(data ?? []))
      .catch((err) => { setError(err?.message || "Failed to load galleries"); setGalleries([]); })
      .finally(() => setLoading(false));
  }, []);

  const cards = useMemo<GalleryCard[]>(
    () =>
      galleries.length > 0
        ? galleries.slice(0, 4).map((gallery) => ({
            id: gallery.id,
            title: gallery.title,
            meta: `${gallery.gallery_type} • ${new Date(gallery.created_at).toLocaleDateString("en-IN")}`,
            client: "Studio Client",
            status: gallery.is_published ? "Delivered" : "Draft",
            chipClass: gallery.is_published
              ? "bg-accent-subtle text-accent"
              : "bg-surface-container-high text-text-primary",
          }))
        : fallbackGalleries,
    [galleries],
  );

  const stats = useMemo(
    () => [
      {
        label: "Total Galleries",
        value: galleries.length > 0 ? galleries.length.toString() : "24",
        meta: "+12%",
        toneClass: "text-accent",
      },
      { label: "Active Clients", value: "156", meta: "+4 new", toneClass: "text-accent-primary" },
      {
        label: "Storage Used",
        value: "85.2 / 200 GB",
        meta: "42% used",
        toneClass: "text-accent-secondary",
      },
      {
        label: "Revenue This Month",
        value: "Rs. 2,45,000",
        meta: "Top Month",
        toneClass: "text-accent-tertiary",
      },
    ],
    [galleries.length],
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
              Welcome back, Arjun!
            </h1>
            <p className="mt-2 max-w-2xl text-text-secondary">
              Your studio is buzzing today. You have 3 pending shoots and 2 galleries
              ready for delivery. Let&apos;s make some magic.
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
                <div className="h-1.5 w-[42%] rounded-full bg-accent" />
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
          <section className="surface-panel p-6">
            <h3 className="mb-6 font-headline text-lg font-bold text-text-primary">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="group flex flex-col items-center justify-center rounded-xl bg-surface-container-high p-4 text-accent transition-colors hover:bg-surface-container-highest"
                >
                  <action.icon className="mb-2 h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="text-xs font-semibold">{action.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="surface-panel p-6">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="font-headline text-lg font-bold text-text-primary">Recent Activity</h3>
              <FileText className="h-4 w-4 text-text-tertiary" />
            </div>

            <div className="space-y-6">
              {recentActivity.map((item) => (
                <div key={`${item.copy}-${item.at}`} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm leading-tight text-text-primary">{item.copy}</p>
                    <p className="mt-1 text-xs text-text-secondary">{item.at}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="mt-8 w-full rounded-xl bg-surface-container-high py-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-container-highest hover:text-text-primary"
            >
              View All Activity
            </button>
          </section>

          <section className="surface-panel p-6">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-text-tertiary">
              Metadata Presets
            </h3>
            <div className="flex flex-wrap gap-2">
              {metadataPresets.map((preset) => (
                <span
                  key={preset}
                  className="rounded-full bg-surface-container-high px-3 py-1 text-[10px] font-bold text-text-primary"
                >
                  {preset}
                </span>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
