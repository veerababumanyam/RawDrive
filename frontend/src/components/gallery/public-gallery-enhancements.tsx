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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera } from "lucide-react";
import {
  getPublicGalleryBranding,
  type GalleryBranding,
} from "@/lib/api/galleries";
import { FaceIDGate } from "./faceid-gate";

interface Props {
  slug: string;
  /** Face ID is only offered when the gallery has faceid_enabled=true. */
  faceIdEnabled?: boolean;
  /**
   * Photo Search button visibility. Maps to galleries.face_detection_enabled
   * (migration 046, default true). Guests only see the floating "Find me
   * with my camera" entry when the studio hasn't opted the gallery out of
   * face detection. Workspace-level disable (workspaces.face_recognition_enabled)
   * is enforced server-side — if it's off, the Photo Search page itself
   * shows a friendlier "feature not enabled" panel.
   */
  faceDetectionEnabled?: boolean;
}

// GAL-FR-102 (RegistrationPrompt) removed 2026-05-18: the "Keep these
// memories — Create a free account…" modal interrupted the first-time
// guest experience and didn't earn its place. The component file is
// retained at ./registration-prompt.tsx in case we want a less
// intrusive variant later; nothing currently imports it.
export function PublicGalleryEnhancements({
  slug,
  faceIdEnabled = false,
  faceDetectionEnabled = true,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branding, setBranding] = useState<GalleryBranding | null>(null);
  const [faceIdDismissed, setFaceIdDismissed] = useState(false);
  const [facePinnedAssetIds, setFacePinnedAssetIds] = useState<string[] | null>(null);
  const faceIdOpen = searchParams.get("faceid") === "1" && faceIdEnabled && !faceIdDismissed;

  // GAL-FR-118: View-as-Client mode — applies a body class the CSS can hook
  // into (`.view-as-client` selector) so the same component tree reads as
  // a client view without a separate page.
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "client") {
      document.body.classList.add("view-as-client");
      return () => document.body.classList.remove("view-as-client");
    }
  }, [searchParams]);

  // GAL-FR-115: fetch branding and cascade accent color into CSS custom
  // properties so the public shell picks it up without a refresh.
  useEffect(() => {
    let cancelled = false;
    getPublicGalleryBranding(slug)
      .then((b) => {
        if (cancelled) return;
        setBranding(b);
        // Only apply overrides when the tier permits it (GAL-FR-115).
        if (b.can_customize) {
          if (b.accent_color) {
            document.documentElement.style.setProperty("--accent-primary", b.accent_color);
          }
        }
      })
      .catch(() => {
        /* non-fatal — platform defaults apply */
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onFaceMatched = (assetIds: string[]) => {
    // Dispatch a window event that PublicGalleryGrid listens to. The grid
    // filters the rendered assets to the matched set — the filter chip
    // below is purely cosmetic, the grid is the source of truth.
    setFacePinnedAssetIds(assetIds);
    setFaceIdDismissed(true);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("rawdrive:face-filter", { detail: { assetIds } }),
      );
    }
  };

  const onFaceFallback = () => {
    // GAL-FR-109: full browsing fallback — close the gate, clear the grid
    // filter via the clear event, strip ?faceid=1 from the URL so reloads
    // don't reopen the modal.
    setFaceIdDismissed(true);
    setFacePinnedAssetIds(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("rawdrive:face-filter-clear"));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("faceid");
    router.replace(`/g/${slug}${params.toString() ? `?${params}` : ""}`);
  };

  return (
    <>
      {/* GAL-FR-117: public profile → gallery bridge breadcrumb */}
      {searchParams.get("from") === "profile" && (
        <div className="fixed top-4 left-4 z-30 rounded-full bg-surface-raised/90 backdrop-blur-sm border border-border-subtle px-3 py-1.5 text-xs text-text-secondary">
          ← From photographer profile
        </div>
      )}

      {/* GAL-FR-115: enterprise-tier footer hiding */}
      {branding && !branding.hide_footer && (
        <div className="fixed bottom-2 right-2 z-20 text-[10px] text-text-tertiary/60">
          Powered by {branding.brand_name}
        </div>
      )}

      {/* Photo Search FAB — discoverability for the new /photo-search
          page on the gallery's landing screen. Guests arrive via a
          share link and previously had to navigate to /people to find
          the entry; the floating button surfaces it at first sight.
          Bottom-left corner so the existing bottom-right "Powered by"
          chip + scroll-to-top affordances stay clear. Only renders
          when the studio has face detection enabled on the gallery —
          if the workspace gate is closed, the Photo Search page
          itself handles that with a friendly fallback panel. */}
      {faceDetectionEnabled && (
        <Link
          href={`/g/${slug}/photo-search`}
          aria-label="Find your photos with your camera"
          className="fixed bottom-4 left-4 z-30 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-lg shadow-black/20 backdrop-blur-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 sm:bottom-6 sm:left-6"
        >
          <Camera className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Find me with my camera</span>
          <span className="sm:hidden">Find me</span>
        </Link>
      )}

      {/* GAL-FR-107/108/109: FaceID entry modal */}
      {faceIdOpen && (
        <FaceIDGate
          slug={slug}
          onMatched={onFaceMatched}
          onFallback={onFaceFallback}
        />
      )}

      {/* Face filter indicator (GAL-FR-109 fallback affordance always visible) */}
      {facePinnedAssetIds !== null && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 rounded-full bg-accent-primary/90 backdrop-blur-sm px-4 py-2 text-xs text-text-inverse">
          <span>Showing {facePinnedAssetIds.length} photos matching your face</span>
          <button
            type="button"
            onClick={onFaceFallback}
            className="rounded-full border border-text-inverse/30 px-2 py-0.5 hover:bg-text-inverse/10"
          >
            Browse all
          </button>
        </div>
      )}
    </>
  );
}
