/**
 * PublicProfilePage
 *
 * Public page for viewing company profiles at /p/:slug.
 * Uses the shared PublicProfileRenderer for unified rendering.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, AlertCircle } from 'lucide-react';

import { companyProfileService } from '../../services/companyProfileService';
import type { PublicCompanyProfile } from '../../types/companyProfile';
import { PublicProfileRenderer } from '../../components/features/profile/shared/PublicProfileRenderer';

const PublicProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<PublicCompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch company profile data
  useEffect(() => {
    if (!slug) return;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await companyProfileService.getPublicProfile(slug);
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

    fetchProfile();
  }, [slug]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (!slug || error || !profile) {
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

  const displayName = profile.name || 'Company Profile';

  return (
    <>
      <Helmet>
        <title>{displayName} | Profile</title>
        <meta name="description" content={profile.tagline || `${displayName} business profile`} />
        {!profile.indexable && (
          <meta name="robots" content="noindex, nofollow" />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {profile.seo_schema && (
          <script type="application/ld+json">
            {JSON.stringify(profile.seo_schema)}
          </script>
        )}
      </Helmet>

      <PublicProfileRenderer
        profileData={profile as unknown as Record<string, unknown>}
        profileType="company"
        themeId={profile.theme_id ?? profile.theme?.theme_id}
      />
    </>
  );
};

export default PublicProfilePage;
