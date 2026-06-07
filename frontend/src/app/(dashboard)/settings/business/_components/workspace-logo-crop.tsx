"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  cropWorkspaceLogo,
  updateWorkspaceProfile,
  uploadWorkspaceLogoCrop,
  type WorkspaceLogoCropPosition,
  type WorkspaceProfile,
} from "@/lib/api/workspace-profile";
import { getStoredAccessToken } from "@/lib/auth";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { Camera, Check, SlidersHorizontal, Trash, XMark } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";

interface WorkspaceLogoCropProps {
  profile: WorkspaceProfile;
  brandName: string;
  onProfileChange: (profile: WorkspaceProfile) => void;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}

const DEFAULT_POSITION: WorkspaceLogoCropPosition = { x: 0, y: 0, zoom: 1 };

// WorkspaceLogoCrop is the studio business-logo uploader for /settings/business.
// It mirrors the photographer-profile LogoCrop interaction (free-aspect /
// fit-to-contain, zoom + horizontal/vertical pan, drag, live preview,
// Apply/Cancel) but is scoped to the workspace branding model: it renders a
// WebP brand mark SERVER-SIDE via the workspace logo upload/crop endpoints and
// points workspaces.logo_asset_id at the result. The logo is a PUBLIC,
// unencrypted brand mark.
export function WorkspaceLogoCrop({
  profile,
  brandName,
  onProfileChange,
  onError,
  onNotice,
}: WorkspaceLogoCropProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);

  const initialPosition = profile.logo_metadata?.crop ?? DEFAULT_POSITION;
  const [position, setPosition] =
    useState<WorkspaceLogoCropPosition>(initialPosition);
  const [editingCrop, setEditingCrop] = useState(false);
  const [working, setWorking] = useState(false);
  // Object URL of the just-uploaded file, used for an exact live crop preview
  // during the initial adjust session (the rendered original is not served).
  const [localSourceUrl, setLocalSourceUrl] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (localSourceUrl) URL.revokeObjectURL(localSourceUrl);
    },
    [localSourceUrl],
  );

  const renderedUrl = useMemo(() => {
    const source =
      profile.logo_url || profile.logo_metadata?.storage_key || "";
    return source ? getStorageBackedUrl(source, getStoredAccessToken()) : "";
  }, [profile.logo_url, profile.logo_metadata?.storage_key]);

  const hasLogo = Boolean(profile.logo_asset_id || renderedUrl);
  const canReCrop = Boolean(profile.logo_metadata?.original_storage_key);
  const previewUrl = editingCrop && localSourceUrl ? localSourceUrl : renderedUrl;

  const replaceLocalSource = (next: string | null) => {
    setLocalSourceUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return next;
    });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const token = getStoredAccessToken();
    if (!token) {
      onError("Your session expired. Please log in again.");
      return;
    }
    setWorking(true);
    onError("");
    try {
      const next = await uploadWorkspaceLogoCrop(token, file, DEFAULT_POSITION);
      onProfileChange(next);
      setPosition(next.logo_metadata?.crop ?? DEFAULT_POSITION);
      replaceLocalSource(URL.createObjectURL(file));
      setEditingCrop(true);
      onNotice("Studio logo uploaded — adjust the crop, then Apply.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setWorking(false);
    }
  };

  const applyCrop = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setWorking(true);
    onError("");
    try {
      const next = await cropWorkspaceLogo(token, position);
      onProfileChange(next);
      setPosition(next.logo_metadata?.crop ?? position);
      setEditingCrop(false);
      onNotice("Studio logo crop applied to your public brand.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Logo crop failed");
    } finally {
      setWorking(false);
    }
  };

  const cancelCrop = () => {
    setPosition(profile.logo_metadata?.crop ?? DEFAULT_POSITION);
    setEditingCrop(false);
  };

  const remove = async () => {
    const token = getStoredAccessToken();
    if (!token) return;
    setWorking(true);
    onError("");
    try {
      await updateWorkspaceProfile(token, { logo_asset_id: "" });
      onProfileChange({
        ...profile,
        logo_asset_id: "",
        logo_url: "",
        logo_metadata: {},
      });
      replaceLocalSource(null);
      setEditingCrop(false);
      onNotice("Studio logo removed from public branding.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove logo");
    } finally {
      setWorking(false);
    }
  };

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!editingCrop || !previewUrl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
    };
  };

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.startX + (event.clientX - drag.startClientX) / 100;
    const nextY = drag.startY + (event.clientY - drag.startClientY) / 100;
    setPosition((current) => ({
      ...current,
      x: clamp(nextX, -1, 1),
      y: clamp(nextY, -1, 1),
    }));
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  return (
    <div className="settings-inset-panel settings-form-field--full">
      <div className="settings-control-row">
        <div className="settings-business-logo-row">
          <div
            className="settings-logo-preview"
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="img"
            aria-label={editingCrop ? "Studio logo crop preview" : "Studio logo"}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="settings-logo-image"
                style={
                  editingCrop
                    ? {
                        transform: `translate(${position.x * 18}%, ${position.y * 18}%) scale(${position.zoom})`,
                      }
                    : undefined
                }
              />
            ) : (
              <span className="settings-logo-placeholder" aria-hidden="true">
                {brandName.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="settings-panel-label">Studio logo</p>
            <p className="settings-panel-note settings-panel-note--compact">
              {hasLogo
                ? "Adjust the crop and zoom, then Apply. Shown across galleries, invoices, and client emails."
                : "Upload a transparent PNG, JPEG, WebP, or SVG logo, then crop it to fit your brand."}
            </p>
          </div>
        </div>
        <div className="settings-action-row">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="settings-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              void upload(file);
            }}
          />
          <GlassButton
            type="button"
            variant="surface"
            icon={<Camera />}
            disabled={working}
            onClick={() => fileRef.current?.click()}
          >
            {working ? "Uploading..." : hasLogo ? "Change logo" : "Upload studio logo"}
          </GlassButton>
          {hasLogo && canReCrop ? (
            <GlassButton
              type="button"
              variant={editingCrop ? "primary" : "surface"}
              icon={<SlidersHorizontal />}
              disabled={working}
              onClick={() => setEditingCrop(true)}
            >
              Adjust crop
            </GlassButton>
          ) : null}
          {hasLogo ? (
            <GlassButton
              type="button"
              variant="danger"
              icon={<Trash />}
              disabled={working}
              onClick={() => void remove()}
            >
              Remove logo
            </GlassButton>
          ) : null}
        </div>
      </div>

      {editingCrop ? (
        <div className="profile-crop-panel">
          <div className="profile-crop-grid">
            <label className="profile-crop-field">
              Horizontal
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={position.x}
                onChange={(event) =>
                  setPosition((current) => ({
                    ...current,
                    x: Number(event.target.value),
                  }))
                }
                className="profile-crop-range"
              />
            </label>
            <label className="profile-crop-field">
              Vertical
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={position.y}
                onChange={(event) =>
                  setPosition((current) => ({
                    ...current,
                    y: Number(event.target.value),
                  }))
                }
                className="profile-crop-range"
              />
            </label>
            <label className="profile-crop-field">
              Zoom
              <input
                type="range"
                min="1"
                max="4"
                step="0.01"
                value={position.zoom}
                onChange={(event) =>
                  setPosition((current) => ({
                    ...current,
                    zoom: Number(event.target.value),
                  }))
                }
                className="profile-crop-range"
              />
            </label>
          </div>
          <div className="profile-crop-actions">
            <GlassButton
              type="button"
              variant="primary"
              icon={<Check />}
              disabled={working || !canReCrop}
              onClick={() => void applyCrop()}
            >
              Apply crop
            </GlassButton>
            <GlassButton
              type="button"
              variant="quiet"
              icon={<XMark />}
              disabled={working}
              onClick={cancelCrop}
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
