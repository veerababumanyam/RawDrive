import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { ComparisonSection } from '../components/landing/sections/ComparisonSection';
import { ROICalculatorModal } from '../components/landing/features/ROICalculatorModal';

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

describe('Comparison & ROI Components', () => {
    /* =============================================================================
       Task 12.3: Unit Tests for ComparisonSection
       Requirements: 15.1, 15.2, 15.3
       ============================================================================= */

    describe('ComparisonSection', () => {
        it('renders comparison table headline', () => {
            render(<ComparisonSection />);
            expect(screen.getByText('Stop Paying for 5 Different Tools')).toBeInTheDocument();
        });

        it('renders at least 3 competitors (Requirement 15.1)', () => {
            render(<ComparisonSection />);
            expect(screen.getByText('RawDrive')).toBeInTheDocument();
            expect(screen.getByText('Pixieset')).toBeInTheDocument();
            expect(screen.getByText('Google Drive')).toBeInTheDocument();
        });

        it('highlights RawDrive column with accent styling (Requirement 15.2)', () => {
            const { container } = render(<ComparisonSection />);
            // RawDrive column header has bg-primary-50/50 and border-primary-500
            const rawdriveHeader = container.querySelector('th.bg-primary-50\\/50');
            expect(rawdriveHeader).toBeInTheDocument();
        });

        it('renders unique feature highlights', () => {
            render(<ComparisonSection />);
            // AI Face Recognition should have "Unique" badge
            const uniqueBadges = screen.getAllByText('Unique');
            expect(uniqueBadges.length).toBeGreaterThan(0);
        });

        it('renders feature comparison rows', () => {
            render(<ComparisonSection />);
            expect(screen.getByText('AI Face Recognition')).toBeInTheDocument();
            expect(screen.getByText('Integrated CRM')).toBeInTheDocument();
            expect(screen.getByText('Photo Proofing & Delivery')).toBeInTheDocument();
            expect(screen.getByText('Custom Domain')).toBeInTheDocument();
            expect(screen.getByText('White Labeling')).toBeInTheDocument();
        });

        it('renders migration badge (Requirement 15.3)', () => {
            render(<ComparisonSection />);
            expect(screen.getByText(/Free Migration Assistance/i)).toBeInTheDocument();
        });

        it('renders pricing row with INR currency', () => {
            render(<ComparisonSection />);
            expect(screen.getByText('₹2,000')).toBeInTheDocument();
            expect(screen.getByText(/~₹4,500/)).toBeInTheDocument();
        });

        it('has correct section id for navigation', () => {
            const { container } = render(<ComparisonSection />);
            const section = container.querySelector('#comparison');
            expect(section).toBeInTheDocument();
        });

        it('table is horizontally scrollable on mobile', () => {
            const { container } = render(<ComparisonSection />);
            const scrollContainer = container.querySelector('.overflow-x-auto');
            expect(scrollContainer).toBeInTheDocument();
        });
    });

    describe('ROICalculatorModal', () => {
        it('does not render when closed', () => {
            render(<ROICalculatorModal isOpen={false} onClose={() => { }} />);
            expect(screen.queryByText('ROI Calculator')).not.toBeInTheDocument();
        });

        it('renders when open', () => {
            render(<ROICalculatorModal isOpen={true} onClose={() => { }} />);
            expect(screen.getByText('ROI Calculator')).toBeInTheDocument();
            expect(screen.getByText('Hours Saved / Month')).toBeInTheDocument();
        });

        it('updates calculations when inputs change', () => {
            render(<ROICalculatorModal isOpen={true} onClose={() => { }} />);

            // Initial state check (approximate values based on defaults)
            // 4 events * 500 photos * 10s = 20000s = 5.55 hours
            // Saved = 90% = ~5 hours
            expect(screen.getByText(/5h/)).toBeInTheDocument();

            // Change input
            const eventInput = screen.getByLabelText(/Events per month/i);
            fireEvent.change(eventInput, { target: { value: '10' } });

            // 10 events * 500 * 10 = 50000s = 13.8 hours
            // Saved = 12.5h (rounded to 13)
            expect(screen.getByText(/13h/)).toBeInTheDocument();
        });
    });
});
