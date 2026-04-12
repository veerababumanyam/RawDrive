"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "next/navigation";
import { getStoredAccessToken } from "@/lib/auth";
import { getGallery, listGalleryAssets, type Gallery } from "@/lib/api/galleries";
import { getAsset, type Asset } from "@/lib/api/assets";
import { getAssetPreviewUrl } from "@/lib/dashboard-ui";

type AspectRatio = "16:9" | "4:3" | "1:1";

interface CoverState {
  assetId: string | null;
  focalPoint: { x: number; y: number };
  aspectRatio: AspectRatio;
  zoom: number;
}


export default function CoverPhotoPage() {
  const params = useParams();
  const galleryId = params.id as string;
  const containerRef = useRef<HTMLDivElement>(null);

  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [realAssets, setRealAssets] = useState<Asset[]>([]);
  const [state, setState] = useState<CoverState>({
    assetId: null,
    focalPoint: { x: 50, y: 50 },
    aspectRatio: "16:9",
    zoom: 1,
  });

  // Fetch gallery and its assets on mount
  useEffect(() => {
    const token = getStoredAccessToken();
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const [g, galleryAssets] = await Promise.all([
          getGallery(token, galleryId),
          listGalleryAssets(token, galleryId),
        ]);
        if (cancelled) return;
        setGallery(g);

        const hydrated = await Promise.all(
          galleryAssets.map(async (entry) => {
            try { return await getAsset(token, entry.asset_id); }
            catch { return null; }
          })
        );
        if (cancelled) return;
        const assets = hydrated.filter((a): a is Asset => a !== null);
        setRealAssets(assets);
        if (assets.length > 0 && !state.assetId) {
          setState((s) => ({ ...s, assetId: assets[0].id }));
        }
      } catch (err) {
        console.error("Failed to load cover page data:", err);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

  const token = getStoredAccessToken();
  const selectedAsset = realAssets.find((a) => a.id === state.assetId);
  const selectedPreviewUrl = selectedAsset ? getAssetPreviewUrl(selectedAsset, token) : "";

  const aspectRatioMap: Record<AspectRatio, string> = {
    "16:9": "16/9",
    "4:3": "4/3",
    "1:1": "1/1",
  };

  const handleFocalPointDrag = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setState((s) => ({ ...s, focalPoint: { x: Math.round(x), y: Math.round(y) } }));
  }, []);

  const handleSave = async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8229";
    await fetch(`${apiUrl}/api/v1/galleries/${galleryId}/cover`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: state.assetId, focal_point: state.focalPoint, aspect_ratio: state.aspectRatio }),
    }).catch(console.error);
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      {/* Header */}
      <header className="px-8 py-4 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold font-headline">Cover Photo</h1>
          <p className="text-xs text-on-surface-variant">{gallery?.title || "Loading…"}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setState((s) => ({ ...s, focalPoint: { x: 50, y: 50 }, zoom: 1 }))}
            className="px-4 py-2 text-sm rounded-xl border border-white/10 hover:bg-white/5 transition-colors">Reset</button>
          <button onClick={handleSave}
            className="px-6 py-2 text-sm font-medium rounded-xl bg-gradient-to-r from-primary to-primary-container text-on-primary">Save Cover</button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left: Crop Editor */}
        <div className="w-[55%] p-8 flex flex-col">
          {/* Aspect ratio selector */}
          <div className="flex gap-2 mb-4">
            {(["16:9", "4:3", "1:1"] as AspectRatio[]).map((ar) => (
              <button key={ar} onClick={() => setState((s) => ({ ...s, aspectRatio: ar }))}
                className={`px-4 py-1.5 text-xs rounded-lg transition-all ${state.aspectRatio === ar ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-surface-container text-on-surface-variant hover:bg-white/5"}`}>
                {ar}
              </button>
            ))}
            <span className="ml-auto text-xs text-on-surface-variant">
              Focal: {state.focalPoint.x}%, {state.focalPoint.y}%
            </span>
          </div>

          {/* Cover image with focal point */}
          <div
            ref={containerRef}
            onClick={handleFocalPointDrag}
            className="relative flex-1 rounded-2xl bg-surface-container border border-white/10 overflow-hidden cursor-crosshair flex items-center justify-center"
            style={{ aspectRatio: aspectRatioMap[state.aspectRatio], maxHeight: "500px" }}
          >
            {selectedPreviewUrl ? (
              <img
                src={selectedPreviewUrl}
                alt={selectedAsset?.filename || "Cover preview"}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-200"
                style={{ transform: `scale(${state.zoom})`, objectPosition: `${state.focalPoint.x}% ${state.focalPoint.y}%` }}
                draggable={false}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-surface-container to-surface-container-high" />
            )}
            <p className="relative text-sm text-on-surface-variant z-10">
              {!selectedPreviewUrl && (state.assetId ? "Loading preview…" : "Click an asset to select")}
            </p>

            {/* Focal point crosshair */}
            <div
              className="absolute w-8 h-8 z-20"
              style={{ left: `${state.focalPoint.x}%`, top: `${state.focalPoint.y}%`, transform: "translate(-50%, -50%)" }}
            >
              <div className="absolute inset-0 border-2 border-primary rounded-full animate-pulse" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-primary/50" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-primary/50" />
            </div>
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-xs text-on-surface-variant">Zoom</span>
            <input type="range" min={0.5} max={3} step={0.1} value={state.zoom}
              onChange={(e) => setState((s) => ({ ...s, zoom: Number(e.target.value) }))}
              className="flex-1 accent-primary" />
            <span className="text-xs text-on-surface-variant w-8">{state.zoom.toFixed(1)}x</span>
          </div>
        </div>

        {/* Right: Selection & Preview */}
        <aside className="w-[45%] border-l border-white/5 overflow-y-auto p-6 space-y-8">
          {/* Select Cover */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Select Cover</h3>
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
              {realAssets.map((a) => {
                const thumbUrl = getAssetPreviewUrl(a, token);
                return (
                  <button key={a.id} onClick={() => setState((s) => ({ ...s, assetId: a.id }))}
                    className={`aspect-square rounded-lg overflow-hidden transition-all ${state.assetId === a.id ? "ring-2 ring-primary" : "ring-1 ring-white/10 hover:ring-white/20"}`}>
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={a.filename} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full bg-surface-container-high" />
                    )}
                  </button>
                );
              })}
            </div>
            <button className="mt-3 w-full py-2 text-xs rounded-xl border border-white/10 hover:bg-white/5 transition-colors">
              Upload External Image
            </button>
          </section>

          {/* Cover Previews */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Cover Preview</h3>
            <div className="space-y-3">
              {[
                { label: "Gallery List", ratio: "4/3", h: "h-20" },
                { label: "Share Link", ratio: "16/9", h: "h-24" },
                { label: "Full Header", ratio: "21/9", h: "h-16" },
              ].map((p) => (
                <div key={p.label}>
                  <p className="text-[10px] text-on-surface-variant mb-1">{p.label}</p>
                  <div className={`${p.h} rounded-xl bg-surface-container border border-white/5 overflow-hidden`}
                    style={{ aspectRatio: p.ratio }}>
                    {selectedPreviewUrl ? (
                      <img src={selectedPreviewUrl} alt={`${p.label} preview`} className="w-full h-full object-cover"
                        style={{ objectPosition: `${state.focalPoint.x}% ${state.focalPoint.y}%` }} />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-surface-container to-surface-container-high" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Version History — populated when API returns cover history */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Version History</h3>
            <p className="text-xs text-on-surface-variant">
              {gallery?.cover_asset_id ? "Current cover set" : "No cover versions saved yet. Select and save a cover to start tracking history."}
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
