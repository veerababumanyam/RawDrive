/**
 * PublicPersonalProfilePage
 *
 * Public page for viewing personal photographer profiles at /u/:slug.
 * Uses the shared PublicProfileRenderer for unified rendering.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, AlertCircle } from 'lucide-react';

import { personalProfileService } from '../../services/personalProfileService';
import type { PublicPersonalProfile } from '../../types/personalProfile';
import { PublicProfileRenderer } from '../../components/features/profile/shared/PublicProfileRenderer';

export function PublicPersonalProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicPersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load profile
  useEffect(() => {
    if (!slug) return;

    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await personalProfileService.getPublicProfile(slug);
        setProfile(data);
      } catch (err: any) {
        if (err.response?.status === 404) {
          setError('Profile not found');
        } else {
          setError('Failed to load profile');
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [slug]);

  // Track profile view (after profile loads successfully)
  useEffect(() => {
    if (!slug || !profile) return;

    // Track the view asynchronously - don't block rendering
    personalProfileService.trackView(slug).catch(() => {
      // Silently ignore tracking errors - non-critical
    });
  }, [slug, profile?.slug]); // Only re-track if slug changes

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (error || !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <AlertCircle className="w-16 h-16 text-gray-300 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {error || 'Profile not found'}
        </h1>
        <p className="text-gray-500 text-center max-w-md">
          The profile you're looking for doesn't exist or has been made private.
        </p>
      </div>
    );
  }

  // SEO metadata
  const seoTitle = profile.seo_metadata?.meta_title || profile.display_name || 'Profile';
  const seoDescription =
    profile.seo_metadata?.meta_description ||
    profile.bio ||
    `${profile.display_name || 'Photographer'}'s profile`;
  const ogImage = profile.seo_metadata?.og_image || profile.avatar_url;

  return (
    <>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDescription} />
        {!profile.indexable && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        {profile.seo_metadata?.meta_keywords && (
          <meta name="keywords" content={profile.seo_metadata.meta_keywords.join(', ')} />
        )}

        <meta property="og:type" content="profile" />
        <meta property="og:title" content={profile.seo_metadata?.og_title || seoTitle} />
        <meta property="og:description" content={profile.seo_metadata?.og_description || seoDescription} />
        <meta property="og:url" content={profile.public_url} />
        {ogImage && <meta property="og:image" content={ogImage} />}

        <meta name="twitter:card" content={profile.seo_metadata?.twitter_card || 'summary_large_image'} />
        <meta name="twitter:title" content={profile.seo_metadata?.twitter_title || seoTitle} />
        <meta name="twitter:description" content={profile.seo_metadata?.twitter_description || seoDescription} />
        {(profile.seo_metadata?.twitter_image || ogImage) && (
          <meta name="twitter:image" content={profile.seo_metadata?.twitter_image || ogImage} />
        )}

        {profile.seo_schema && (
          <script type="application/ld+json">{JSON.stringify(profile.seo_schema)}</script>
        )}
      </Helmet>

      <PublicProfileRenderer
        profileData={profile as unknown as Record<string, unknown>}
        profileType="personal"
        themeId={profile.background_theme}
      />
    </>
  );
}

export default PublicPersonalProfilePage;
