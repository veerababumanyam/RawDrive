"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getClientProfile, getClientTimeline } from "@/lib/api/crm";
import type {
  ClientProfileResponse,
  TimelineEntry,
} from "@/lib/api/crm";
import { getStoredAccessToken } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { GlassIconButton } from "@/components/ui/glass-icon-button";
import { DocumentText, CalendarDays, ChatBubble, ChevronLeft } from "@/components/icons";
import { ClientTimeline } from "@/components/crm/client-timeline";
import { GalleryList, InvoiceList, DealList, BookingList } from "@/components/crm/client-linked-entities";

type Tab = "timeline" | "galleries" | "invoices" | "deals" | "bookings";

function formatPaisa(paisa: number): string {
  return "\u20B9" + (paisa / 100).toLocaleString("en-IN");
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;

  const [profile, setProfile] = useState<ClientProfileResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("timeline");

  const loadProfile = useCallback(() => {
    const token = getStoredAccessToken();
    if (!token) {
      setError("Missing access token");
      setLoading(false);
      return;
    }
    setLoading(true);
    getClientProfile(token, contactId)
      .then((data) => {
        setProfile(data);
        setError(null);
      })
      .catch((err) => setError(err?.message || "Failed to load client profile"))
      .finally(() => setLoading(false));
  }, [contactId]);

  const loadTimeline = useCallback(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    setTimelineLoading(true);
    getClientTimeline(token, contactId)
      .then((data) => setTimeline(data))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false));
  }, [contactId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProfile();
      loadTimeline();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfile, loadTimeline]);

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-24 bg-surface-sunken rounded" />
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 bg-surface-sunken rounded-full" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-surface-sunken rounded" />
              <div className="h-4 w-32 bg-surface-sunken rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-surface-sunken rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-surface-sunken rounded-xl" />
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error || !profile) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push("/crm/contacts")}
          className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 min-h-[44px]"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="rounded-xl border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
          {error || "Client not found."}
        </div>
      </div>
    );
  }

  const { contact, galleries, invoices, deals, events } = profile;
  const token = getStoredAccessToken();

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "timeline", label: "Timeline", count: timeline.length },
    { key: "galleries", label: "Galleries", count: galleries.length },
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "deals", label: "Deals", count: deals.length },
    { key: "bookings", label: "Bookings", count: events.length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Back button */}
      <button
        onClick={() => router.push("/crm/contacts")}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary min-h-[44px]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>

      {/* ---- Top Section: Header ---- */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Contact info */}
        <div className="flex-1 space-y-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="h-16 w-16 shrink-0 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary text-xl font-semibold">
              {getInitials(contact.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-text-primary truncate">{contact.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="status-badge status-badge--accent capitalize">
                  {contact.contact_type}
                </span>
                {contact.client_source && (
                  <span className="status-badge status-badge--info capitalize">
                    {contact.client_source}
                  </span>
                )}
                {contact.tags && contact.tags.length > 0 && contact.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-surface-sunken text-text-secondary"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Contact details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {contact.phone && (
              <div>
                <span className="text-text-tertiary">Phone</span>
                <p className="text-text-primary">{contact.phone}</p>
              </div>
            )}
            {contact.email && (
              <div>
                <span className="text-text-tertiary">Email</span>
                <p className="text-text-primary break-all">{contact.email}</p>
              </div>
            )}
            {contact.whatsapp_number && (
              <div>
                <span className="text-text-tertiary">WhatsApp</span>
                <p className="text-text-primary">{contact.whatsapp_number}</p>
              </div>
            )}
            {contact.company && (
              <div>
                <span className="text-text-tertiary">Company</span>
                <p className="text-text-primary">{contact.company}</p>
              </div>
            )}
            {contact.address && (
              <div className="sm:col-span-2">
                <span className="text-text-tertiary">Address</span>
                <p className="text-text-primary">{contact.address}</p>
              </div>
            )}
            {contact.gstin && (
              <div>
                <span className="text-text-tertiary">GSTIN</span>
                <p className="text-text-primary font-mono text-xs">{contact.gstin}</p>
              </div>
            )}
            {contact.pan && (
              <div>
                <span className="text-text-tertiary">PAN</span>
                <p className="text-text-primary font-mono text-xs">{contact.pan}</p>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => router.push(`/billing?create=true&client=${contactId}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-accent-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-primary/90 min-h-[44px] transition-colors"
            >
              <DocumentText className="h-4 w-4" />
              Create Invoice
            </button>
            <button
              onClick={() => router.push(`/calendar?create=true&client=${contactId}`)}
              className="inline-flex items-center gap-2 rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-surface-sunken min-h-[44px] transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
              Book a Shoot
            </button>
            {contact.whatsapp_number && (
              <GlassIconButton
                label="Send WhatsApp"
                size="md"
                variant="accent"
                onClick={() => {
                  const num = contact.whatsapp_number!.replace(/[^0-9]/g, "");
                  window.open(`https://wa.me/${num}`, "_blank", "noopener");
                }}
              >
                <ChatBubble />
              </GlassIconButton>
            )}
          </div>
        </div>

        {/* Right: Summary card */}
        <div className="lg:w-72 shrink-0">
          <div className="rounded-2xl border border-border-default bg-surface-raised p-6 space-y-4">
            <h3 className="text-sm font-medium text-text-secondary">Summary</h3>
            <div>
              <p className="text-xs text-text-tertiary">Lifetime Revenue</p>
              <p className="text-2xl font-semibold text-text-primary">
                {formatPaisa(profile.lifetime_revenue_paisa)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-tertiary">Galleries</p>
                <p className="text-lg font-semibold text-text-primary">{galleries.length}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Invoices</p>
                <p className="text-lg font-semibold text-text-primary">{invoices.length}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Deals</p>
                <p className="text-lg font-semibold text-text-primary">{deals.length}</p>
              </div>
            </div>
            {contact.birthday && (
              <div>
                <p className="text-xs text-text-tertiary">Birthday</p>
                <p className="text-sm text-text-primary">
                  {new Date(contact.birthday).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            )}
            {contact.anniversary && (
              <div>
                <p className="text-xs text-text-tertiary">Anniversary</p>
                <p className="text-sm text-text-primary">
                  {new Date(contact.anniversary).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </p>
              </div>
            )}
            {contact.notes && (
              <div>
                <p className="text-xs text-text-tertiary">Notes</p>
                <p className="text-sm text-text-secondary whitespace-pre-line">{contact.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Tabs ---- */}
      <div className="border-b border-border-default">
        <div className="flex gap-1 overflow-x-auto -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors min-h-[44px]",
                activeTab === tab.key
                  ? "border-accent-primary text-accent-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-border-default",
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-xs text-text-tertiary">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Tab Content ---- */}
      <div className="min-h-[200px]">
        {activeTab === "timeline" && (
          <ClientTimeline entries={timeline} loading={timelineLoading} />
        )}
        {activeTab === "galleries" && <GalleryList galleries={galleries} token={token} />}
        {activeTab === "invoices" && <InvoiceList invoices={invoices} />}
        {activeTab === "deals" && <DealList deals={deals} />}
        {activeTab === "bookings" && <BookingList events={events} />}
      </div>
    </div>
  );
}
