"use client";

/**
 * PublicGalleryEnhancements — client-side M13 features for the public gallery page.
 *
 * Closes several deferred FRs in one shell so the public page stays a
 * Server Component and we only hydrate the interactive pieces:
 *
 *   - GAL-FR-102: Optional registration prompt after delay
 *   - GAL-FR-107/108/109: FaceID gallery entry (opt-in, scoped, with fallback)
 *   - GAL-FR-115: Plan-aware branding — fetches /branding and cascades
 *     accent colors into CSS custom properties on the root element
 *   - GAL-FR-117: Public profile → gallery bridge (reads ?from=profile and
 *     shows a "back to profile" breadcrumb when present)
 *   - GAL-FR-118: View-as-Client separate UI mode (reads ?mode=client and
 *     applies a client-view CSS class to dim admin chrome)
 *
 * The component mounts once per page render, reads URL params + fetches
 * branding, and renders the small set of elements that need client JS.
 * Everything else (grid, header, footer) stays server-rendered.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getPublicGalleryBranding,
  type GalleryBranding,
} from "@/lib/api/galleries";
import { withPublicScope } from "@/lib/api/ai";

interface Props {
  slug: string;
  /** Face ID is only offered when the gallery has faceid_enabled=true. */
  faceIdEnabled?: boolean;
  initialBranding?: GalleryBranding | null;
  previewMode?: boolean;
}

// GAL-FR-102 (RegistrationPrompt) removed 2026-05-18: the "Keep these
// memories — Create a free account…" modal interrupted the first-time
// guest experience and didn't earn its place. The component file is
// retained at ./registration-prompt.tsx in case we want a less
// intrusive variant later; nothing currently imports it.
export function PublicGalleryEnhancements({
  slug,
  faceIdEnabled = false,
  initialBranding = null,
  previewMode = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const faceIdParam = searchParams?.get("faceid") ?? "";
  const modeParam = searchParams?.get("mode") ?? "";
  const fromParam = searchParams?.get("from") ?? "";
  // Share-link access scope (#175): forwarded onto the standalone Find-Me route
  // so the photo-search POST self-authorizes on a no-PIN share arrival even when
  // the gallery_session cookie is absent.
  const shareParam = searchParams?.get("share") ?? "";
  const wsParam = searchParams?.get("ws") ?? "";
  const [branding, setBranding] = useState<GalleryBranding | null>(
    initialBranding,
  );

  // 3i convergence: the public Find-Me experience is the standalone
  // /g/{slug}/photo-search surface — the only capable implementation
  // (secure-context detection, the camera-error classifier, the
  // faces_detected===0 vs index_status==="empty" distinction, decrypted
  // result thumbnails, and the GAL-FR-107 consent step). The weaker in-page
  // FaceIDGate modal (which dropped the `encrypted` prop and never reached its
  // honest "unavailable" state) was removed; the legacy `?faceid=1` entry now
  // routes into that single flow instead of opening a divergent modal.
  useEffect(() => {
    if (previewMode) return;
    if (faceIdParam !== "1" || !faceIdEnabled) return;
    router.replace(
      withPublicScope(`/g/${slug}/photo-search`, {
        shareToken: shareParam || null,
        ws: wsParam || null,
      }),
    );
  }, [faceIdParam, faceIdEnabled, previewMode, router, slug, shareParam, wsParam]);

  // GAL-FR-118: View-as-Client mode — applies a body class the CSS can hook
  // into (`.view-as-client` selector) so the same component tree reads as
  // a client view without a separate page.
  useEffect(() => {
    if (previewMode) return;
    if (modeParam === "client") {
      document.body.classList.add("view-as-client");
      return () => document.body.classList.remove("view-as-client");
    }
  }, [modeParam, previewMode]);

  // GAL-FR-115: fetch branding and cascade accent color into CSS custom
  // properties so the public shell picks it up without a refresh.
  useEffect(() => {
    if (previewMode || initialBranding) return;
    let cancelled = false;
    getPublicGalleryBranding(slug)
      .then((b) => {
        if (cancelled) return;
        setBranding(b);
        // Only apply overrides when the tier permits it (GAL-FR-115).
        if (b.can_customize) {
          if (b.accent_color) {
            document.documentElement.style.setProperty(
              "--accent-primary",
              b.accent_color,
            );
          }
        }
      })
      .catch(() => {
        /* non-fatal — platform defaults apply */
      });
    return () => {
      cancelled = true;
    };
  }, [slug, initialBranding, previewMode]);

  return (
    <>
      {/* GAL-FR-117: public profile → gallery bridge breadcrumb */}
      {fromParam === "profile" && (
        <div className="fixed top-4 left-4 z-30 rounded-full bg-surface-raised/90 glass-blur-subtle border border-border-subtle px-3 py-1.5 text-xs text-text-secondary">
          ← From photographer profile
        </div>
      )}

      {/* GAL-FR-115: enterprise-tier footer hiding */}
      {branding && !branding.hide_footer && (
        <div className="fixed bottom-2 right-2 z-20 text-[10px] text-text-tertiary/60">
          Powered by {branding.brand_name}
        </div>
      )}

      {/* Photo Search entry moved to the hero CTA row (PublicGalleryHero's
          "Find me" pill, aligned with Play + View Gallery, built from the
          central .glass-button primitive). It used to be a floating
          bottom-left FAB here; consolidating it into the hero keeps all three
          public CTAs in one horizontally-aligned, on-system group. The
          galleries.face_detection_enabled gate now drives the hero's
          faceDetectionEnabled prop instead. */}

      {/* GAL-FR-107/108/109: the public Find-Me entry is the standalone
          /g/{slug}/photo-search surface. The legacy `?faceid=1` query param is
          redirected there by the effect above instead of opening a divergent
          in-page modal (3i convergence). */}
    </>
  );
}
