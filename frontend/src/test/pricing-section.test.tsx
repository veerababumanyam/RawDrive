import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { PricingSection } from '../components/landing/sections/PricingSection';
import { PricingCard } from '../components/landing/ui/PricingCard';

// Mock IntersectionObserver for Framer Motion viewport features
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
});

beforeAll(() => {
    window.IntersectionObserver = mockIntersectionObserver;
});

// Mock AnimatePresence
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
    };
});

// Helper to wrap components with BrowserRouter
const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('Pricing Components', () => {
    /* =============================================================================
       Task 13.4: Unit Tests for PricingSection
       Requirements: 6.1, 6.2, 6.3, 6.4, 10.3
       ============================================================================= */

    describe('PricingSection', () => {
        it('renders section headline', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByText('Simple, Transparent Pricing')).toBeInTheDocument();
        });

        it('renders all pricing tiers (Requirement 6.1-6.4)', () => {
            renderWithRouter(<PricingSection />);
            // Should have Free, Starter, Professional, Business, Enterprise
            // Use getAllByText for "Free" since it appears in both the tier name and price display
            expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
            expect(screen.getByText('Starter')).toBeInTheDocument();
            expect(screen.getByText('Professional')).toBeInTheDocument();
            expect(screen.getByText('Business')).toBeInTheDocument();
            expect(screen.getByText('Enterprise')).toBeInTheDocument();
        });

        it('shows INR currency symbol (Requirement 10.3)', () => {
            renderWithRouter(<PricingSection />);
            // Check for INR symbol in pricing
            const currencySymbols = screen.getAllByText('₹');
            expect(currencySymbols.length).toBeGreaterThan(0);
        });

        it('renders monthly/annual billing toggle', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByRole('radio', { name: /monthly/i })).toBeInTheDocument();
            expect(screen.getByRole('radio', { name: /annual/i })).toBeInTheDocument();
        });

        it('toggles between monthly and annual pricing', () => {
            renderWithRouter(<PricingSection />);

            // Get toggle buttons
            const annualButton = screen.getByRole('radio', { name: /annual/i });

            // Click annual
            fireEvent.click(annualButton);

            // Annual should be checked
            expect(annualButton).toHaveAttribute('aria-checked', 'true');
        });

        it('shows "Most Popular" badge on highlighted tier', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByText('Most Popular')).toBeInTheDocument();
        });

        it('shows annual discount badge', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByText('-17%')).toBeInTheDocument();
        });

        it('renders trust signals (Requirement 6.4)', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByText('30-day money-back guarantee')).toBeInTheDocument();
            expect(screen.getByText('Cancel anytime')).toBeInTheDocument();
        });

        it('has correct section id for navigation', () => {
            const { container } = renderWithRouter(<PricingSection />);
            const section = container.querySelector('#pricing');
            expect(section).toBeInTheDocument();
        });

        it('renders FAQ link', () => {
            renderWithRouter(<PricingSection />);
            expect(screen.getByText('Check our FAQ')).toBeInTheDocument();
        });

        it('renders feature lists for each tier', () => {
            renderWithRouter(<PricingSection />);
            // Check for common features across tiers
            expect(screen.getAllByText(/storage/i).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/galleries/i).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/clients/i).length).toBeGreaterThan(0);
        });
    });

    describe('PricingCard', () => {
        const mockTier = {
            id: 'pro',
            name: 'Pro',
            description: 'For professional photographers',
            price: {
                monthly: 500,
                annual: 4999,
            },
            features: [
                '100 GB storage',
                '50 galleries',
                'Custom domain',
            ],
            highlighted: false,
            ctaText: 'Start Trial',
        };

        it('renders tier name and description', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={false} />);
            expect(screen.getByText('Pro')).toBeInTheDocument();
            expect(screen.getByText('For professional photographers')).toBeInTheDocument();
        });

        it('renders monthly price in INR', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={false} />);
            expect(screen.getByText('₹')).toBeInTheDocument();
            expect(screen.getByText('500')).toBeInTheDocument();
        });

        it('renders annual price when isAnnual is true', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={true} />);
            expect(screen.getByText('4,999')).toBeInTheDocument();
        });

        it('renders all features', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={false} />);
            expect(screen.getByText('100 GB storage')).toBeInTheDocument();
            expect(screen.getByText('50 galleries')).toBeInTheDocument();
            expect(screen.getByText('Custom domain')).toBeInTheDocument();
        });

        it('renders CTA button with correct text', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={false} />);
            expect(screen.getByRole('link', { name: /start trial/i })).toBeInTheDocument();
        });

        it('shows "Most Popular" badge when highlighted', () => {
            const highlightedTier = { ...mockTier, highlighted: true };
            renderWithRouter(<PricingCard tier={highlightedTier} isAnnual={false} />);
            expect(screen.getByText('Most Popular')).toBeInTheDocument();
        });

        it('shows custom badge text when provided', () => {
            const tierWithBadge = { ...mockTier, badgeText: 'Best Value' };
            renderWithRouter(<PricingCard tier={tierWithBadge} isAnnual={false} />);
            expect(screen.getByText('Best Value')).toBeInTheDocument();
        });

        it('shows savings percentage when annual billing selected', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={true} />);
            // (500*12 - 4999) / (500*12) = (6000 - 4999) / 6000 = 17%
            expect(screen.getByText(/Save \d+% with annual billing/)).toBeInTheDocument();
        });

        it('links to signup with correct plan parameter', () => {
            renderWithRouter(<PricingCard tier={mockTier} isAnnual={false} />);
            const link = screen.getByRole('link', { name: /start trial/i });
            expect(link).toHaveAttribute('href', '/signup?plan=pro');
        });
    });
});
