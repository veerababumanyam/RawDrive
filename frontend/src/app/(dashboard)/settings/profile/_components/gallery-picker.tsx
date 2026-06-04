"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addFeaturedProfileGallery,
  listProfileGalleries,
  type PhotographerProfile,
  type ProfileGallery,
  removeFeaturedProfileGallery,
} from "@/lib/api/photographer-profile";
import { getStorageBackedUrl } from "@/lib/dashboard-ui";
import { CheckCircle, FolderOpen } from "@/components/icons";

interface GalleryPickerProps {
  profile: PhotographerProfile;
  onProfileChange: (profile: PhotographerProfile) => void;
  onError: (message: string) => void;
}

function galleryCover(gallery: ProfileGallery): string {
  const thumbs = gallery.cover_thumbnails || {};
  return getStorageBackedUrl(
    thumbs.thumb_lg_webp ||
      thumbs.thumb_md_webp ||
      thumbs.thumb_sm_webp ||
      thumbs.display_webp ||
      "",
  );
}

export function GalleryPicker({
  profile,
  onProfileChange,
  onError,
}: GalleryPickerProps) {
  const [galleries, setGalleries] = useState<ProfileGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const selected = useMemo(
    () => new Set(profile.featured_galleries || []),
    [profile.featured_galleries],
  );

  useEffect(() => {
    let cancelled = false;
    listProfileGalleries()
      .then((rows) => {
        if (!cancelled) setGalleries(rows);
      })
      .catch((err) =>
        onError(
          err instanceof Error ? err.message : "Failed to load galleries",
        ),
      )
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const toggle = async (galleryId: string) => {
    try {
      const response = selected.has(galleryId)
        ? await removeFeaturedProfileGallery(galleryId)
        : await addFeaturedProfileGallery(galleryId);
      if (response.profile) onProfileChange(response.profile);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update gallery");
    }
  };

  return (
    <section className="settings-panel">
      <div className="profile-gallery-header">
        <div>
          <h2 className="profile-edit-title">Featured galleries</h2>
          <p className="settings-panel-copy">
            Pick one or more existing published galleries to feature on the
            public page.
          </p>
        </div>
        <span className="status-badge status-badge--accent">
          {selected.size} selected
        </span>
      </div>

      {loading ? (
        <div className="profile-gallery-loading" />
      ) : galleries.length === 0 ? (
        <div className="profile-gallery-empty">
          No galleries are available yet.
        </div>
      ) : (
        <div className="profile-gallery-grid">
          {galleries.map((gallery) => {
            const cover = galleryCover(gallery);
            const active = selected.has(gallery.id);
            const selectable =
              Boolean(profile.profile_id) &&
              gallery.is_published &&
              gallery.status !== "archived";
            return (
              <label
                key={gallery.id}
                className={
                  selectable
                    ? "profile-gallery-card"
                    : "profile-gallery-card profile-gallery-card--disabled"
                }
              >
                <input
                  type="checkbox"
                  className="profile-gallery-input"
                  checked={active}
                  disabled={!selectable}
                  onChange={() => toggle(gallery.id)}
                />
                <div className="profile-gallery-media">
                  {cover ? (
                    <img src={cover} alt="" className="profile-gallery-image" />
                  ) : (
                    <div className="profile-gallery-placeholder">
                      <FolderOpen />
                    </div>
                  )}
                </div>
                <div className="profile-gallery-body">
                  <div className="profile-gallery-copy">
                    <p className="profile-gallery-title">{gallery.title}</p>
                    <p className="profile-gallery-status">
                      {!profile.profile_id
                        ? "Save profile first"
                        : gallery.is_published
                          ? "Published"
                          : "Draft"}
                    </p>
                  </div>
                  {active ? (
                    <CheckCircle className="profile-gallery-check" />
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
