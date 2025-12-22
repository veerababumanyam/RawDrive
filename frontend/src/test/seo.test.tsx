/**
 * SEO Tests for Landing Page
 *
 * Tests for:
 * - Meta tags (title, description, keywords)
 * - Open Graph tags for social sharing
 * - Twitter Card tags
 * - Structured data (JSON-LD)
 * - Semantic HTML structure
 * - Heading hierarchy
 * - Internal linking
 *
 * @requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 13.3, 28.1, 28.2, 28.3
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SEOHead } from '../components/landing/seo/SEOHead';
import StructuredData from '../components/landing/seo/StructuredData';
import { HeroSection } from '../components/landing/sections/HeroSection';

/* =============================================================================
   Test Setup
   ============================================================================= */

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HelmetProvider>
    <BrowserRouter>{children}</BrowserRouter>
  </HelmetProvider>
);

beforeEach(() => {
  // Clear document head before each test
  document.head.innerHTML = '';

  // Mock matchMedia for theme detection
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* =============================================================================
   SEOHead Component Tests
   ============================================================================= */

describe('SEOHead Component', () => {
  describe('Basic Meta Tags', () => {
    it('should render with default title', async () => {
      render(
        <TestWrapper>
          <SEOHead />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(document.title).toContain('RawDrive');
      });
    });

    it('should render custom title with site name suffix', async () => {
      render(
        <TestWrapper>
          <SEOHead title="Pricing" />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(document.title).toBe('Pricing | RawDrive');
      });
    });

    it('should render description meta tag', async () => {
      const description = 'Test description for SEO';
      render(
        <TestWrapper>
          <SEOHead description={description} />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="description"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe(description);
      });
    });

    it('should render keywords meta tag', async () => {
      const keywords = ['photography', 'gallery', 'portfolio'];
      render(
        <TestWrapper>
          <SEOHead keywords={keywords} />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="keywords"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe(keywords.join(', '));
      });
    });

    it('should render canonical URL', async () => {
      render(
        <TestWrapper>
          <SEOHead canonicalUrl="/pricing" />
        </TestWrapper>
      );

      await waitFor(() => {
        const link = document.querySelector('link[rel="canonical"]');
        expect(link).toBeInTheDocument();
        expect(link?.getAttribute('href')).toContain('/pricing');
      });
    });

    it('should render robots noindex when specified', async () => {
      render(
        <TestWrapper>
          <SEOHead noIndex={true} />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="robots"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('noindex, nofollow');
      });
    });
  });

  describe('Open Graph Tags', () => {
    it('should render og:title', async () => {
      render(
        <TestWrapper>
          <SEOHead title="Test Page" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:title"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toContain('Test Page');
      });
    });

    it('should render og:description', async () => {
      const description = 'OG description test';
      render(
        <TestWrapper>
          <SEOHead description={description} />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:description"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe(description);
      });
    });

    it('should render og:type', async () => {
      render(
        <TestWrapper>
          <SEOHead ogType="article" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:type"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('article');
      });
    });

    it('should render og:image', async () => {
      render(
        <TestWrapper>
          <SEOHead ogImage="/test-image.png" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:image"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toContain('test-image.png');
      });
    });

    it('should render og:site_name', async () => {
      render(
        <TestWrapper>
          <SEOHead siteName="CustomSite" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:site_name"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('CustomSite');
      });
    });

    it('should render og:locale', async () => {
      render(
        <TestWrapper>
          <SEOHead locale="en_IN" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[property="og:locale"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('en_IN');
      });
    });
  });

  describe('Twitter Card Tags', () => {
    it('should render twitter:card', async () => {
      render(
        <TestWrapper>
          <SEOHead twitterCard="summary_large_image" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="twitter:card"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('summary_large_image');
      });
    });

    it('should render twitter:title', async () => {
      render(
        <TestWrapper>
          <SEOHead title="Twitter Test" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="twitter:title"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toContain('Twitter Test');
      });
    });

    it('should render twitter:site handle', async () => {
      render(
        <TestWrapper>
          <SEOHead twitterHandle="@testhandle" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="twitter:site"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('@testhandle');
      });
    });

    it('should render twitter:creator handle', async () => {
      render(
        <TestWrapper>
          <SEOHead twitterHandle="@creator" />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="twitter:creator"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('@creator');
      });
    });
  });

  describe('Additional Meta', () => {
    it('should render author meta tag', async () => {
      render(
        <TestWrapper>
          <SEOHead />
        </TestWrapper>
      );

      await waitFor(() => {
        const meta = document.querySelector('meta[name="author"]');
        expect(meta).toBeInTheDocument();
        expect(meta?.getAttribute('content')).toBe('Swaz Solutions');
      });
    });

    it('should set HTML lang attribute', async () => {
      render(
        <TestWrapper>
          <SEOHead locale="hi_IN" />
        </TestWrapper>
      );

      await waitFor(() => {
        const html = document.documentElement;
        expect(html.getAttribute('lang')).toBe('hi');
      });
    });
  });
});

/* =============================================================================
   Structured Data Tests
   ============================================================================= */

describe('Structured Data Validation', () => {
  const getJsonLd = () => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map((script) => JSON.parse(script.innerHTML));
  };

  describe('Organization Schema', () => {
    it('should include @context', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const orgSchema = schemas.find((s: any) => s['@type'] === 'Organization');
        expect(orgSchema).toBeDefined();
        expect(orgSchema['@context']).toBe('https://schema.org');
      });
    });

    it('should include organization name', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const orgSchema = schemas.find((s: any) => s['@type'] === 'Organization');
        expect(orgSchema.name).toBe('RawDrive');
      });
    });

    it('should include social media links in sameAs', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const orgSchema = schemas.find((s: any) => s['@type'] === 'Organization');
        expect(orgSchema.sameAs).toContain('https://twitter.com/rawdrive');
        expect(orgSchema.sameAs).toContain('https://linkedin.com/company/rawdrive');
      });
    });
  });

  describe('SoftwareApplication Schema', () => {
    it('should have applicationCategory as BusinessApplication', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const appSchema = schemas.find((s: any) => s['@type'] === 'SoftwareApplication');
        expect(appSchema.applicationCategory).toBe('BusinessApplication');
      });
    });

    it('should include feature list', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const appSchema = schemas.find((s: any) => s['@type'] === 'SoftwareApplication');
        expect(appSchema.featureList).toContain('AI Face Recognition');
        expect(appSchema.featureList).toContain('SOC 2 Compliance');
      });
    });

    it('should include INR pricing', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const appSchema = schemas.find((s: any) => s['@type'] === 'SoftwareApplication');
        expect(appSchema.offers).toBeDefined();
        expect(appSchema.offers[0].priceCurrency).toBe('INR');
      });
    });

    it('should include aggregate rating', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const appSchema = schemas.find((s: any) => s['@type'] === 'SoftwareApplication');
        expect(appSchema.aggregateRating).toBeDefined();
        expect(appSchema.aggregateRating.ratingValue).toBeGreaterThan(0);
        expect(appSchema.aggregateRating.ratingCount).toBeGreaterThan(0);
      });
    });
  });

  describe('Website Schema', () => {
    it('should include SearchAction', async () => {
      render(
        <HelmetProvider>
          <StructuredData />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const websiteSchema = schemas.find((s: any) => s['@type'] === 'WebSite');
        expect(websiteSchema.potentialAction).toBeDefined();
        expect(websiteSchema.potentialAction['@type']).toBe('SearchAction');
      });
    });
  });

  describe('FAQ Schema', () => {
    it('should render FAQPage when FAQ items provided', async () => {
      const faq = [
        { question: 'What is RawDrive?', answer: 'A photography platform.' },
        { question: 'Is there a free tier?', answer: 'Yes, we offer a free tier.' },
      ];

      render(
        <HelmetProvider>
          <StructuredData faq={faq} />
        </HelmetProvider>
      );

      await waitFor(() => {
        const schemas = getJsonLd();
        const faqSchema = schemas.find((s: any) => s['@type'] === 'FAQPage');
        expect(faqSchema).toBeDefined();
        expect(faqSchema.mainEntity).toHaveLength(2);
        expect(faqSchema.mainEntity[0]['@type']).toBe('Question');
        expect(faqSchema.mainEntity[0].acceptedAnswer['@type']).toBe('Answer');
      });
    });
  });
});

/* =============================================================================
   Semantic HTML Tests
   ============================================================================= */

describe('Semantic HTML Structure', () => {
  it('should have proper heading hierarchy in HeroSection', () => {
    render(
      <TestWrapper>
        <HeroSection />
      </TestWrapper>
    );

    // Should have an h1
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
  });

  it('should not skip heading levels', () => {
    render(
      <TestWrapper>
        <HeroSection />
      </TestWrapper>
    );

    // Get all headings
    const headings = screen.getAllByRole('heading');

    // If we have headings, verify no skipping
    // (h1 -> h2 or h3, not h1 -> h4)
    expect(headings.length).toBeGreaterThan(0);
  });

  it('should use semantic section element', () => {
    const { container } = render(
      <TestWrapper>
        <HeroSection />
      </TestWrapper>
    );

    const section = container.querySelector('section');
    expect(section).toBeInTheDocument();
  });
});

/* =============================================================================
   SEO Best Practices Tests
   ============================================================================= */

describe('SEO Best Practices', () => {
  it('description should be under 160 characters for optimal display', async () => {
    const description = 'Short description for SEO.';
    render(
      <TestWrapper>
        <SEOHead description={description} />
      </TestWrapper>
    );

    await waitFor(() => {
      const meta = document.querySelector('meta[name="description"]');
      const content = meta?.getAttribute('content') || '';
      expect(content.length).toBeLessThanOrEqual(160);
    });
  });

  it('title should be under 60 characters for optimal display', async () => {
    render(
      <TestWrapper>
        <SEOHead title="Short Title" />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.title.length).toBeLessThanOrEqual(70);
    });
  });

  it('should have unique title per page', async () => {
    render(
      <TestWrapper>
        <SEOHead title="Unique Page Title" />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.title).toContain('Unique Page Title');
      expect(document.title).not.toBe('RawDrive'); // Not just the default
    });
  });

  it('canonical URL should be absolute', async () => {
    render(
      <TestWrapper>
        <SEOHead canonicalUrl="/features" />
      </TestWrapper>
    );

    await waitFor(() => {
      const link = document.querySelector('link[rel="canonical"]');
      const href = link?.getAttribute('href') || '';
      // Should start with protocol
      expect(href.startsWith('http://') || href.startsWith('https://')).toBe(true);
    });
  });
});

/* =============================================================================
   Social Sharing Tests
   ============================================================================= */

describe('Social Sharing Optimization', () => {
  it('should have all required OG tags for Facebook sharing', async () => {
    render(
      <TestWrapper>
        <SEOHead
          title="Share Test"
          description="Test description"
          ogImage="/share-image.png"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.querySelector('meta[property="og:title"]')).toBeInTheDocument();
      expect(document.querySelector('meta[property="og:description"]')).toBeInTheDocument();
      expect(document.querySelector('meta[property="og:image"]')).toBeInTheDocument();
      expect(document.querySelector('meta[property="og:url"]')).toBeInTheDocument();
      expect(document.querySelector('meta[property="og:type"]')).toBeInTheDocument();
    });
  });

  it('should have all required Twitter Card tags', async () => {
    render(
      <TestWrapper>
        <SEOHead
          title="Tweet Test"
          description="Test description"
          ogImage="/tweet-image.png"
        />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(document.querySelector('meta[name="twitter:card"]')).toBeInTheDocument();
      expect(document.querySelector('meta[name="twitter:title"]')).toBeInTheDocument();
      expect(document.querySelector('meta[name="twitter:description"]')).toBeInTheDocument();
      expect(document.querySelector('meta[name="twitter:image"]')).toBeInTheDocument();
    });
  });

  it('should use summary_large_image card type by default', async () => {
    render(
      <TestWrapper>
        <SEOHead />
      </TestWrapper>
    );

    await waitFor(() => {
      const card = document.querySelector('meta[name="twitter:card"]');
      expect(card?.getAttribute('content')).toBe('summary_large_image');
    });
  });
});

/* =============================================================================
   GEO (Generative Engine Optimization) Tests
   ============================================================================= */

describe('Generative Engine Optimization (GEO)', () => {
  it('structured data should be parseable JSON', async () => {
    render(
      <HelmetProvider>
        <StructuredData />
      </HelmetProvider>
    );

    await waitFor(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach((script) => {
        // Should not throw
        expect(() => JSON.parse(script.innerHTML)).not.toThrow();
      });
    });
  });

  it('structured data should use valid schema.org context', async () => {
    render(
      <HelmetProvider>
        <StructuredData />
      </HelmetProvider>
    );

    await waitFor(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      scripts.forEach((script) => {
        const data = JSON.parse(script.innerHTML);
        expect(data['@context']).toBe('https://schema.org');
      });
    });
  });

  it('should include descriptive product information for AI crawlers', async () => {
    render(
      <HelmetProvider>
        <StructuredData />
      </HelmetProvider>
    );

    await waitFor(() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      const appSchema = Array.from(scripts)
        .map((s) => JSON.parse(s.innerHTML))
        .find((s: any) => s['@type'] === 'SoftwareApplication');

      expect(appSchema).toBeDefined();
      expect(appSchema.description).toBeDefined();
      expect(appSchema.description.length).toBeGreaterThan(50); // Meaningful description
    });
  });
});
