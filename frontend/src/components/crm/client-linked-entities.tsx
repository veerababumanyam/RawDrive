"use client";

import type { ProfileInvoice, ProfileDeal, ProfileEvent, ProfileGallery, ProfileProject } from "@/lib/api/crm";
import { cn } from "@/lib/utils";
import { invoiceStatusClasses, calendarEventClasses } from "@/lib/dashboard-ui";
import { DEAL_STAGE_CLASS, PROJECT_STATUS_CLASS, getDealStageLabel, getProjectStatusLabel } from "@/lib/crm-taxonomy";

/**
 * Tabbed lists of invoices, projects, and bookings linked to a client.
 * Each entity renders as a card row with a status badge and amount.
 */

function formatPaisa(paisa: number): string {
  return "\u20B9" + (paisa / 100).toLocaleString("en-IN");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function authedStorageUrl(url: string | undefined | null, token: string | null): string {
  if (!url) return "";
  if (!token) return url;
  if (!url.includes("/storage/")) return url;
  if (url.includes("token=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

// ---- Gallery List ----

interface GalleryListProps {
  galleries: ProfileGallery[];
  token: string | null;
}

export function GalleryList({ galleries, token }: GalleryListProps) {
  if (galleries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No linked galleries yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {galleries.map((gallery) => {
        const coverUrl = authedStorageUrl(gallery.cover_thumbnail_url, token);

        return (
          <a
            key={gallery.id}
            href={`/galleries/${gallery.id}`}
            className="block bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent-primary/30 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-sunken border border-border-default">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={`${gallery.title} cover`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-text-tertiary">
                    Gallery
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-text-primary text-sm truncate">{gallery.title}</p>
                <p className="text-xs text-text-tertiary mt-1">
                  {gallery.photo_count} {gallery.photo_count === 1 ? "photo" : "photos"}
                </p>
              </div>
              <span className="status-badge status-badge--accent capitalize">
                {gallery.status}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ---- Invoice List ----

interface InvoiceListProps {
  invoices: ProfileInvoice[];
}

export function InvoiceList({ invoices }: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => (
        <a
          key={inv.id}
          href={`/billing?invoice=${inv.id}`}
          className="block bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary text-sm">{inv.invoice_number}</p>
              <p className="text-xs text-text-tertiary mt-1">{formatDate(inv.created_at)}</p>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "capitalize",
                  invoiceStatusClasses[inv.status] || "status-badge status-badge--neutral",
                )}
              >
                {inv.status.replace("_", " ")}
              </span>
              <p className="text-sm font-medium text-text-primary mt-1">
                {formatPaisa(inv.total_paisa)}
              </p>
              {inv.amount_paid_paisa > 0 && inv.amount_paid_paisa < inv.total_paisa && (
                <p className="text-xs text-text-tertiary">
                  Paid: {formatPaisa(inv.amount_paid_paisa)}
                </p>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ---- Deal List ----

interface ProjectListProps {
  projects: ProfileProject[];
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <a
          key={project.id}
          href={`/crm/projects/${project.id}`}
          className="block bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary text-sm">{project.name}</p>
              <div className="flex items-center gap-2 mt-1">
                {project.project_type && (
                  <span className="text-xs text-text-tertiary capitalize">{project.project_type.replaceAll("_", " ")}</span>
                )}
                {project.event_date && (
                  <span className="text-xs text-text-tertiary">{formatDate(project.event_date)}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "capitalize",
                  PROJECT_STATUS_CLASS[project.status] || "status-badge status-badge--neutral",
                )}
              >
                {getProjectStatusLabel(project.status)}
              </span>
              <p className="text-sm font-medium text-text-primary mt-1">
                {formatPaisa(project.expected_value_paisa)}
              </p>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

interface DealListProps {
  deals: ProfileDeal[];
}

export function DealList({ deals }: DealListProps) {
  if (deals.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {deals.map((deal) => (
        <div
          key={deal.id}
          className="bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary text-sm">{deal.title}</p>
              <div className="flex items-center gap-2 mt-1">
                {deal.event_type && (
                  <span className="text-xs text-text-tertiary capitalize">{deal.event_type}</span>
                )}
                {deal.event_date && (
                  <span className="text-xs text-text-tertiary">{formatDate(deal.event_date)}</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span
                className={cn(
                  "capitalize",
                  DEAL_STAGE_CLASS[deal.stage] || "status-badge status-badge--neutral",
                )}
              >
                {getDealStageLabel(deal.stage)}
              </span>
              <p className="text-sm font-medium text-text-primary mt-1">
                {formatPaisa(deal.amount_paisa)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Booking List ----

interface BookingListProps {
  events: ProfileEvent[];
}

export function BookingList({ events }: BookingListProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary text-sm">No bookings yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((evt) => (
        <div
          key={evt.id}
          className="bg-surface-raised rounded-xl p-4 border border-border-default hover:border-accent-primary/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-text-primary text-sm">{evt.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-text-tertiary">
                  {formatDatetime(evt.start_at)}
                </span>
                {evt.location && (
                  <span className="text-xs text-text-tertiary">{evt.location}</span>
                )}
              </div>
            </div>
            <span
              className={cn(
                "capitalize",
                calendarEventClasses[evt.event_type] || "status-badge status-badge--neutral",
              )}
            >
              {evt.event_type}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
