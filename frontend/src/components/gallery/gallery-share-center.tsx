"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createGalleryShareLink,
  listGalleryShareLinks,
  revokeGalleryShareLink,
  type Gallery,
  type GalleryShareLink,
} from "@/lib/api/galleries";

interface GalleryShareCenterProps {
  gallery: Gallery;
  token: string;
}

function accessLabel(link: GalleryShareLink) {
  return link.permissions?.access_mode || (link.permissions?.allowed_emails?.length ? "email" : "public");
}

export function GalleryShareCenter({ gallery, token }: GalleryShareCenterProps) {
  const [links, setLinks] = useState<GalleryShareLink[]>([]);
  const [accessMode, setAccessMode] = useState<"public" | "pin" | "email">("public");
  const [pin, setPin] = useState("");
  const [recipients, setRecipients] = useState("");
  const [expiryDays, setExpiryDays] = useState("14");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const publicUrl = useMemo(() => {
    if (!gallery.slug) return "";
    const path = `/g/${gallery.slug}`;
    return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  }, [gallery.slug]);

  useEffect(() => {
    let cancelled = false;
    listGalleryShareLinks(token, gallery.id)
      .then((items) => {
        if (!cancelled) setLinks(items);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gallery.id, token]);

  const copyPublicUrl = async () => {
    if (!gallery.is_published) {
      setNotice("Publish this gallery before sharing public links.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setNotice("Public URL copied.");
    } catch {
      setNotice(publicUrl);
    }
  };

  const createLink = async (channel: "copy" | "whatsapp" | "email") => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const recipientEmails = recipients
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean);
      if (channel === "email" && recipientEmails.length === 0) {
        throw new Error("Add at least one recipient email.");
      }
      const created = await createGalleryShareLink(token, gallery.id, {
        access_mode: accessMode,
        pin: accessMode === "pin" ? pin : undefined,
        expiry_days: Number(expiryDays) || undefined,
        download_allowed: gallery.download_enabled !== false,
        recipient_emails: recipientEmails,
        allowed_emails: accessMode === "email" ? recipientEmails : undefined,
        message,
        channel,
      });
      setLinks((current) => [created, ...current]);
      const shareUrl = `${publicUrl}?share=${created.token}`;
      if (channel === "copy") {
        await navigator.clipboard.writeText(shareUrl).catch(() => undefined);
      }
      if (channel === "whatsapp") {
        window.open(`https://wa.me/?text=${encodeURIComponent(message || shareUrl)}`, "_blank", "noopener,noreferrer");
      }
      if (channel === "email") {
        setNotice("Share link created and email sent.");
        return;
      }
      setNotice("Share link created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (linkId: string) => {
    try {
      await revokeGalleryShareLink(token, gallery.id, linkId);
      setLinks((current) => current.filter((link) => link.id !== linkId));
      setNotice("Share link revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke share link");
    }
  };

  return (
    <section id="share-center" className="surface-panel space-y-4 p-5">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-text-tertiary">Share Center</p>
        <h2 className="mt-1 text-lg font-semibold text-text-primary">Public sharing</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Manage public URL, protected links, recipients, WhatsApp/email copy, client preview, and access logs in one gallery workspace.
        </p>
      </div>

      {notice && <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">{notice}</p>}
      {error && <p className="rounded-xl border border-error/20 bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

      <div className="rounded-2xl border border-border-default bg-surface-sunken p-4">
        <p className="text-xs text-text-tertiary">Public URL</p>
        <p className="mt-1 break-all text-sm text-text-primary">{publicUrl || "Publish to generate a public URL"}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={copyPublicUrl} className="btn-tertiary px-3 py-2 text-xs">
            Copy public URL
          </button>
          <a href={`/g/${gallery.slug}?mode=client`} target="_blank" rel="noopener noreferrer" className="btn-tertiary px-3 py-2 text-xs">
            Client preview
          </a>
        </div>
      </div>

      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Access mode
          <select value={accessMode} onChange={(event) => setAccessMode(event.target.value as "public" | "pin" | "email")} className="input-base w-full">
            <option value="public">Public link</option>
            <option value="pin">PIN protected</option>
            <option value="email">Recipient email list</option>
          </select>
        </label>
        {accessMode === "pin" && (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Password/PIN
            <input value={pin} onChange={(event) => setPin(event.target.value)} className="input-base w-full" placeholder="Enter client PIN" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Recipients
          <textarea value={recipients} onChange={(event) => setRecipients(event.target.value)} className="input-base min-h-24 w-full resize-y" placeholder="client@example.com, family@example.com" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Expiry in days
          <input value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className="input-base w-full" inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          Share copy
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="input-base min-h-24 w-full resize-y" placeholder={`Your ${gallery.title} gallery is ready: {link}`} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void createLink("copy")} className="btn-primary px-3 py-2 text-xs">
          Copy link
        </button>
        <button type="button" disabled={saving} onClick={() => void createLink("whatsapp")} className="btn-tertiary px-3 py-2 text-xs">
          WhatsApp
        </button>
        <button type="button" disabled={saving} onClick={() => void createLink("email")} className="btn-tertiary px-3 py-2 text-xs">
          Email
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">Share logs</h3>
        {links.length === 0 ? (
          <p className="text-xs text-text-secondary">No share links created yet.</p>
        ) : (
          links.map((link) => (
            <div key={link.id} className="rounded-2xl border border-border-default bg-surface-sunken p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-text-primary">{accessLabel(link)} link</p>
                  <p className="text-xs text-text-tertiary">
                    {link.access_count} visits {link.expires_at ? `- expires ${new Date(link.expires_at).toLocaleDateString("en-IN")}` : ""}
                  </p>
                </div>
                <button type="button" onClick={() => void revoke(link.id)} className="text-xs text-danger hover:underline">
                  Revoke
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
