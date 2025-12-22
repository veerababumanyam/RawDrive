import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { HelmetProvider } from 'react-helmet-async';
import StructuredData, { ProductData, OrganizationData, FAQItem, WebsiteData } from '../components/landing/seo/StructuredData';

// Helper to extract JSON-LD from the document
const getJsonLd = () => {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map(script => JSON.parse(script.innerHTML));
};

describe('StructuredData Component', () => {
    /* =============================================================================
       Task 2.3: Unit Tests
       ============================================================================= */
    it('renders valid JSON-LD with default props', async () => {
        render(
            <HelmetProvider>
                <StructuredData />
            </HelmetProvider>
        );

        await waitFor(() => {
            const jsonLd = getJsonLd();
            expect(jsonLd.length).toBeGreaterThan(0);

            const productSchema = jsonLd.find((item: any) => item['@type'] === 'SoftwareApplication');
            expect(productSchema).toBeDefined();
            expect(productSchema.name).toBe('RawDrive');
            expect(productSchema.applicationCategory).toBe('BusinessApplication'); // Req 7.3
            expect(productSchema.featureList).toContain('AI Face Recognition'); // Req 7.5
            expect(productSchema.audience.audienceType).toBe('Professional Photographers, Studios, Agencies'); // Req 7.6
            expect(productSchema.aggregateRating.ratingValue).toBe(4.9); // Req 7.7
            expect(productSchema.offers[0].priceCurrency).toBe('INR'); // Req 7.4
        });
    });

    it('renders all schema types when provided', async () => {
        const faq: FAQItem[] = [{ question: 'Q?', answer: 'A.' }];

        render(
            <HelmetProvider>
                <StructuredData faq={faq} />
            </HelmetProvider>
        );

        await waitFor(() => {
            const jsonLd = getJsonLd();
            expect(jsonLd.some((item: any) => item['@type'] === 'Organization')).toBe(true);
            expect(jsonLd.some((item: any) => item['@type'] === 'WebSite')).toBe(true);
            expect(jsonLd.some((item: any) => item['@type'] === 'SoftwareApplication')).toBe(true);
            expect(jsonLd.some((item: any) => item['@type'] === 'FAQPage')).toBe(true);
        });
    });

    /* =============================================================================
       Task 2.2: Property Tests
       Property 1: Structured Data Completeness
       Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
       ============================================================================= */
    it('Property 1: Structured Data Completeness - always contains required fields', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.record({
                    name: fc.string(),
                    description: fc.string(),
                    featureList: fc.array(fc.string()),
                    audience: fc.record({ audienceType: fc.string() }),
                    aggregateRating: fc.record({
                        ratingValue: fc.float(),
                        ratingCount: fc.integer(),
                        bestRating: fc.integer(),
                        worstRating: fc.integer()
                    }),
                    offers: fc.array(fc.record({
                        price: fc.integer(),
                        priceCurrency: fc.constant('INR'),
                        availability: fc.string(),
                        url: fc.webUrl()
                    }))
                }),
                async (productData: any) => {
                    // Cleanup previous render
                    document.head.innerHTML = '';

                    render(
                        <HelmetProvider>
                            <StructuredData product={productData} />
                        </HelmetProvider>
                    );

                    await waitFor(() => {
                        const jsonLd = getJsonLd();
                        const productSchema = jsonLd.find((item: any) => item['@type'] === 'SoftwareApplication');

                        expect(productSchema).toBeDefined();
                        expect(productSchema.applicationCategory).toBe('BusinessApplication'); // Req 7.3
                        expect(productSchema.featureList).toBeDefined(); // Req 7.5
                        expect(productSchema.audience).toBeDefined(); // Req 7.6
                        expect(productSchema.aggregateRating).toBeDefined(); // Req 7.7

                        if (productSchema.offers && productSchema.offers.length > 0) {
                            expect(productSchema.offers[0].priceCurrency).toBe('INR'); // Req 7.4
                        }
                    });
                }
            ),
            { numRuns: 20 } // Reduced runs for component test speed
        );
    });
});
