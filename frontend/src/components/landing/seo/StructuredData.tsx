import React from 'react';
import { Helmet } from 'react-helmet-async';

/* =============================================================================
   StructuredData Component

   Provides JSON-LD structured data for SEO and AI crawlers.
   ============================================================================= */

// Organization Schema
export interface OrganizationData {
  name: string;
  url: string;
  logo: string;
  sameAs?: string[];
  contactPoint?: {
    contactType: string;
    email?: string;
    telephone?: string;
  };
}

// Product Schema
export interface ProductData {
  name: string;
  description: string;
  image?: string;
  brand?: string;
  featureList?: string[];
  audience?: {
    audienceType: string;
  };
  aggregateRating?: {
    ratingValue: number;
    ratingCount: number;
    bestRating: number;
    worstRating: number;
  };
  offers?: {
    price: number;
    priceCurrency: string;
    availability: string;
    url?: string;
  }[];
}

// FAQ Schema
export interface FAQItem {
  question: string;
  answer: string;
}

// Website Schema
export interface WebsiteData {
  name: string;
  url: string;
  searchAction?: {
    target: string;
    queryInput: string;
  };
}

interface StructuredDataProps {
  /** Organization data */
  organization?: OrganizationData;
  /** Product data */
  product?: ProductData;
  /** FAQ items */
  faq?: FAQItem[];
  /** Website data */
  website?: WebsiteData;
}

const defaultOrganization: OrganizationData = {
  name: 'RawDrive',
  url: 'https://rawdrive.ai',
  logo: 'https://rawdrive.ai/logo.png',
  sameAs: [
    'https://twitter.com/rawdrive',
    'https://linkedin.com/company/rawdrive',
    'https://instagram.com/rawdrive',
    'https://github.com/rawdrive',
  ],
  contactPoint: {
    contactType: 'customer support',
    email: 'support@rawdrive.ai',
  },
};

const defaultWebsite: WebsiteData = {
  name: 'RawDrive',
  url: 'https://rawdrive.ai',
  searchAction: {
    target: 'https://rawdrive.ai/search?q={search_term_string}',
    queryInput: 'required name=search_term_string',
  },
};

const defaultProduct: ProductData = {
  name: 'RawDrive',
  description:
    'Professional photography management platform with gallery delivery, client proofing, album design, and AI-powered features.',
  brand: 'RawDrive',
  featureList: [
    'AI Face Recognition',
    'SOC 2 Compliance',
    'CRM',
    'Custom Domain Portfolios',
    'Zapier Integration',
    'REST API Access',
    'Green Hosting',
  ],
  audience: {
    audienceType: 'Professional Photographers, Studios, Agencies',
  },
  aggregateRating: {
    ratingValue: 4.9,
    ratingCount: 1250,
    bestRating: 5,
    worstRating: 1,
  },
  offers: [
    {
      price: 0,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: 'https://rawdrive.ai/pricing',
    },
    {
      price: 500,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: 'https://rawdrive.ai/pricing',
    },
    {
      price: 2000,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url: 'https://rawdrive.ai/pricing',
    },
  ],
};

export const StructuredData: React.FC<StructuredDataProps> = ({
  organization = defaultOrganization,
  product = defaultProduct,
  faq,
  website = defaultWebsite,
}) => {
  const schemas: object[] = [];

  // Organization Schema
  if (organization) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: organization.name,
      url: organization.url,
      logo: organization.logo,
      sameAs: organization.sameAs,
      contactPoint: organization.contactPoint
        ? {
          '@type': 'ContactPoint',
          contactType: organization.contactPoint.contactType,
          email: organization.contactPoint.email,
          telephone: organization.contactPoint.telephone,
        }
        : undefined,
    });
  }

  // Website Schema
  if (website) {
    const websiteSchema: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: website.name,
      url: website.url,
    };

    if (website.searchAction) {
      websiteSchema.potentialAction = {
        '@type': 'SearchAction',
        target: website.searchAction.target,
        'query-input': website.searchAction.queryInput,
      };
    }

    schemas.push(websiteSchema);
  }

  // Product Schema
  if (product) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: product.name,
      description: product.description,
      image: product.image,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      featureList: product.featureList,
      audience: product.audience
        ? {
          '@type': 'Audience',
          audienceType: product.audience.audienceType,
        }
        : undefined,
      aggregateRating: product.aggregateRating
        ? {
          '@type': 'AggregateRating',
          ratingValue: product.aggregateRating.ratingValue,
          ratingCount: product.aggregateRating.ratingCount,
          bestRating: product.aggregateRating.bestRating,
          worstRating: product.aggregateRating.worstRating,
        }
        : undefined,
      brand: product.brand
        ? {
          '@type': 'Brand',
          name: product.brand,
        }
        : undefined,
      offers: product.offers?.map((offer) => ({
        '@type': 'Offer',
        price: offer.price,
        priceCurrency: offer.priceCurrency,
        availability: offer.availability,
        url: offer.url,
      })),
    });
  }

  // FAQ Schema
  if (faq && faq.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    });
  }

  return (
    <Helmet>
      {schemas.map((schema, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
};

StructuredData.displayName = 'StructuredData';

export default StructuredData;
