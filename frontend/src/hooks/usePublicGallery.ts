import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { magicLinkService } from '../services/magicLinkService';
import type { GalleryDetailData, ValidatedMagicLink } from '../types/gallery';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePublicGalleryResult {
  /** The resolved gallery data (null while loading or on error) */
  gallery: GalleryDetailData | null;
  /** The actual gallery UUID (from validation, not the magic-link token) */
  actualGalleryId: string | null;
  /** Company profile from the magic-link validation */
  companyProfile: ValidatedMagicLink['company_profile'] | null;
  /** Whether gallery requires PIN verification */
  requiresPin: boolean;
  /** Whether gallery requires password verification */
  requiresPassword: boolean;
  /** Whether gallery requires email registration */
  requiresEmail: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Error message (user-friendly) */
  error: string | null;
  /** Whether the token appears to be a raw UUID instead of a magic link token */
  isInvalidFormat: boolean;
}

/**
 * TanStack Query hook for fetching and validating a public gallery via
 * magic-link token. Handles UUID detection, magic-link validation, and
 * gallery data assembly.
 *
 * @param token - The magic-link token from the URL (:galleryId param)
 */
export function usePublicGallery(token: string | undefined): UsePublicGalleryResult {
  // Detect invalid UUID format
  const isInvalidFormat = useMemo(() => {
    if (!token) return false;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidPattern.test(token);
  }, [token]);

  const query = useQuery({
    queryKey: ['public-gallery', token],
    queryFn: async (): Promise<{
      gallery: GalleryDetailData;
      galleryId: string;
      companyProfile: ValidatedMagicLink['company_profile'] | null;
    }> => {
      if (!token) throw new Error('No token provided');

      if (isInvalidFormat) {
        throw new Error(
          'Invalid link format. This URL uses a gallery ID instead of a secure magic link token. ' +
            "Please create a shareable link from the gallery's Share dialog. " +
            'Direct gallery ID access is disabled for security reasons.',
        );
      }

      // Validate magic link token
      const validatedLink = await magicLinkService.validateToken(token);

      // Assemble gallery data from validation response
      const galleryData: GalleryDetailData = {
        gallery_id: validatedLink.gallery.gallery_id,
        title: validatedLink.album_title || validatedLink.gallery.title,
        description: validatedLink.gallery.description,
        status: validatedLink.gallery.status,
        cover_asset_id: validatedLink.gallery.cover_asset_id,
        primary_color: validatedLink.gallery.primary_color,
        font_family: validatedLink.gallery.font_family,
        gradient_config: validatedLink.gallery.gradient_config,
        theme: validatedLink.gallery.theme,
        layout_style: validatedLink.gallery.layout_style,
        download_policy: validatedLink.gallery.download_policy,
        watermark_config: validatedLink.gallery.watermark_config,
        findme_config: validatedLink.gallery.findme_config,
        slideshow_config: validatedLink.gallery.slideshow_config,
        activity_tracking: validatedLink.gallery.activity_tracking,
        custom_domain: validatedLink.gallery.custom_domain,
        custom_links: validatedLink.gallery.custom_links || [],
        pin_protected: validatedLink.gallery.pin_protected || false,
        email_registration_required: validatedLink.gallery.email_registration_required || false,
        password_protected: false,
        workspace_id: '',
        created_by_user_id: '',
        created_at: new Date().toISOString(),
        sub_galleries: [],
        stats: {
          total_items: 0,
          total_photos: 0,
          total_videos: 0,
          favorites_count: 0,
          selections_count: 0,
        },
        show_people_filter: validatedLink.gallery.show_people_filter,
      };

      return {
        gallery: galleryData,
        galleryId: validatedLink.gallery_id,
        companyProfile: validatedLink.company_profile ?? null,
      };
    },
    enabled: !!token && !isInvalidFormat,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Derive user-friendly error
  const error = useMemo(() => {
    if (isInvalidFormat) {
      return (
        'Invalid link format. This URL uses a gallery ID instead of a secure magic link token. ' +
        "Please create a shareable link from the gallery's Share dialog. " +
        'Direct gallery ID access is disabled for security reasons.'
      );
    }
    if (!query.error) return null;
    const msg = (query.error as Error).message || '';
    if (msg.includes('404')) return 'Gallery not found or is not public.';
    return 'Failed to load gallery.';
  }, [query.error, isInvalidFormat]);

  return {
    gallery: query.data?.gallery ?? null,
    actualGalleryId: query.data?.galleryId ?? null,
    companyProfile: query.data?.companyProfile ?? null,
    requiresPin: query.data?.gallery.pin_protected ?? false,
    requiresPassword: query.data?.gallery.password_protected ?? false,
    requiresEmail: query.data?.gallery.email_registration_required ?? false,
    isLoading: query.isLoading,
    error,
    isInvalidFormat,
  };
}
