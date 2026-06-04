"use client";

import { type PointerEvent, useMemo, useRef, useState } from "react";
import {
  cropProfileAvatar,
  type AvatarPosition,
  type PhotographerProfile,
  uploadProfileAvatar,
} from "@/lib/api/photographer-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { Camera, Check, SlidersHorizontal, XMark } from "@/components/icons";
import { GlassButton } from "@/components/ui/glass-button";

interface AvatarCropProps {
  profile: PhotographerProfile;
  onProfileChange: (profile: PhotographerProfile) => void;
  onError: (message: string) => void;
}

export function AvatarCrop({
  profile,
  onProfileChange,
  onError,
}: AvatarCropProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [position, setPosition] = useState<AvatarPosition>(
    profile.avatar_position || { x: 0, y: 0, zoom: 1, aspect: 1 },
  );
  const [editingCrop, setEditingCrop] = useState(false);
  const [working, setWorking] = useState(false);

  const sourceUrl = useMemo(
    () =>
      getStorageBackedUrl(
        profile.avatar_url || profile.avatar_cropped_url || "",
      ),
    [profile.avatar_cropped_url, profile.avatar_url],
  );
  const croppedUrl = useMemo(
    () =>
      getStorageBackedUrl(
        profile.avatar_cropped_url || profile.avatar_url || "",
      ),
    [profile.avatar_cropped_url, profile.avatar_url],
  );

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setWorking(true);
    try {
      const body = await uploadProfileAvatar(file);
      if (body.profile) {
        onProfileChange(body.profile);
        setPosition(body.profile.avatar_position);
        setEditingCrop(true);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Avatar upload failed");
    } finally {
      setWorking(false);
    }
  };

  const crop = async () => {
    setWorking(true);
    try {
      const body = await cropProfileAvatar(position);
      if (body.profile) {
        onProfileChange(body.profile);
        setPosition(body.profile.avatar_position);
      }
      setEditingCrop(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Avatar crop failed");
    } finally {
      setWorking(false);
    }
  };

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!editingCrop || !sourceUrl) return;
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

  const resetCrop = () => {
    setPosition(profile.avatar_position || { x: 0, y: 0, zoom: 1, aspect: 1 });
    setEditingCrop(false);
  };

  const previewUrl = editingCrop ? sourceUrl : croppedUrl;
  const hasAvatar = Boolean(croppedUrl || sourceUrl);
  const canEditCrop = Boolean(sourceUrl);

  return (
    <section id="profile-avatar-url" className="settings-panel">
      <div className="profile-avatar-header">
        <div className="profile-avatar-summary">
          <div
            className="profile-avatar-frame"
            onPointerDown={beginDrag}
            onPointerMove={updateDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label={editingCrop ? "Profile avatar crop" : "Profile avatar"}
            role="img"
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt=""
                className="profile-avatar-image"
                style={
                  editingCrop
                    ? {
                        transform: `translate(${position.x * 18}%, ${position.y * 18}%) scale(${position.zoom})`,
                      }
                    : undefined
                }
              />
            ) : (
              <div className="profile-avatar-empty">
                <Camera />
              </div>
            )}
          </div>
          <div className="profile-avatar-copy">
            <h2 className="profile-edit-title">Avatar</h2>
            <p className="settings-panel-copy">
              {hasAvatar
                ? "Profile photo for your public link-in-bio."
                : "Add a portrait for your public profile."}
            </p>
          </div>
        </div>

        <div className="profile-avatar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
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
            {hasAvatar ? "Change avatar" : "Upload avatar"}
          </GlassButton>
          {canEditCrop ? (
            <GlassButton
              type="button"
              variant={editingCrop ? "primary" : "surface"}
              icon={<SlidersHorizontal />}
              disabled={working}
              onClick={() => setEditingCrop(true)}
            >
              Edit crop
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
              disabled={working || !profile.avatar_url}
              onClick={crop}
            >
              Apply crop
            </GlassButton>
            <GlassButton
              type="button"
              variant="quiet"
              icon={<XMark />}
              disabled={working}
              onClick={resetCrop}
            >
              Cancel
            </GlassButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
