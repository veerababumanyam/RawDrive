import React from 'react';
import { Helmet } from 'react-helmet-async';

/* =============================================================================
   SEOHead Component

   Manages meta tags for SEO and social sharing.
   ============================================================================= */

interface SEOHeadProps {
  /** Page title */
  title?: string;
  /** Page description (max 160 characters recommended) */
  description?: string;
  /** Keywords for SEO */
  keywords?: string[];
  /** Canonical URL */
  canonicalUrl?: string;
  /** Open Graph image URL */
  ogImage?: string;
  /** Open Graph type */
  ogType?: 'website' | 'article' | 'product';
  /** Twitter card type */
  twitterCard?: 'summary' | 'summary_large_image';
  /** No index flag */
  noIndex?: boolean;
  /** Additional structured data */
  structuredData?: object;
  /** Page locale */
  locale?: string;
  /** Site name */
  siteName?: string;
  /** Twitter handle */
  twitterHandle?: string;
  /** AI Agent Discovery - content summary */
  aiContentSummary?: string;
  /** AI Agent Discovery - target audience */
  aiTargetAudience?: string;
  /** AI Agent Discovery - pricing model */
  aiPricingModel?: string;
}

const DEFAULT_TITLE = 'RawDrive - Professional Photography Management';
const DEFAULT_DESCRIPTION =
  'The all-in-one platform for professional photographers. Deliver stunning galleries, manage clients, and grow your business with AI-powered tools.';
const DEFAULT_OG_IMAGE = '/og-image.png';
const DEFAULT_SITE_NAME = 'RawDrive';
const DEFAULT_TWITTER_HANDLE = '@rawdrive';

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = ['photography', 'gallery', 'client proofing', 'photo delivery', 'photographer software'],
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  twitterCard = 'summary_large_image',
  noIndex = false,
  structuredData,
  locale = 'en_US',
  siteName = DEFAULT_SITE_NAME,
  twitterHandle = DEFAULT_TWITTER_HANDLE,
  aiContentSummary,
  aiTargetAudience,
  aiPricingModel,
}) => {
  const fullTitle = title ? `${title} | ${siteName}` : DEFAULT_TITLE;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://rawdrive.ai';
  const fullCanonicalUrl = canonicalUrl
    ? `${baseUrl}${canonicalUrl}`
    : typeof window !== 'undefined'
    ? window.location.href
    : baseUrl;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${baseUrl}${ogImage}`;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <html lang={locale.split('_')[0]} />
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      <link rel="canonical" href={fullCanonicalUrl} />

      {/* Robots */}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonicalUrl} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content={locale} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullOgImage} />
      <meta name="twitter:site" content={twitterHandle} />
      <meta name="twitter:creator" content={twitterHandle} />

      {/* Additional Meta */}
      <meta name="author" content="Swaz Solutions" />
      <meta name="application-name" content={siteName} />

      {/* AI Agent Discovery Meta Tags (GEO/AEO Optimization) */}
      {aiContentSummary && <meta name="ai-content-summary" content={aiContentSummary} />}
      {aiTargetAudience && <meta name="ai-target-audience" content={aiTargetAudience} />}
      {aiPricingModel && <meta name="ai-pricing-model" content={aiPricingModel} />}

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

SEOHead.displayName = 'SEOHead';

export default SEOHead;
