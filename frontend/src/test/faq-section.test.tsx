import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { FAQSection } from '../components/landing/sections/FAQSection';

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

// Mock AnimatePresence to allow testing of accordion behavior
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
    };
});

describe('FAQ Section Components', () => {
    /* =============================================================================
       Task 14.3: Unit Tests for FAQSection
       Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.2
       ============================================================================= */

    describe('FAQSection', () => {
        it('renders section headline', () => {
            render(<FAQSection />);
            expect(screen.getByText('Frequently Asked Questions')).toBeInTheDocument();
        });

        it('renders FAQ items', () => {
            render(<FAQSection />);
            // Check for at least one FAQ question
            expect(screen.getByText('How do I get started with RawDrive?')).toBeInTheDocument();
        });

        it('renders search input (Requirement 12.2)', () => {
            render(<FAQSection />);
            expect(screen.getByPlaceholderText('Search questions...')).toBeInTheDocument();
        });

        it('renders category filter buttons (Requirement 12.3)', () => {
            render(<FAQSection />);
            expect(screen.getByText('All Questions')).toBeInTheDocument();
            // Use getAllByText since "Getting Started" may appear in category badges too
            expect(screen.getAllByText('Getting Started').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Features').length).toBeGreaterThan(0);
            expect(screen.getByText('Pricing & Billing')).toBeInTheDocument();
            expect(screen.getAllByText('Security').length).toBeGreaterThan(0);
        });

        it('expands/collapses FAQ items on click (Requirement 12.1)', async () => {
            render(<FAQSection />);

            // Find the first FAQ button (actual first FAQ in GUIDE_FAQS)
            const firstFaqButton = screen.getByText('What is the best photo gallery software for wedding photographers?').closest('button');
            expect(firstFaqButton).toBeInTheDocument();

            // Initially the first FAQ should be open (openIndex = 0)
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'true');

            // Click to close
            fireEvent.click(firstFaqButton!);
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'false');

            // Click to open again
            fireEvent.click(firstFaqButton!);
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'true');
        });

        it('supports keyboard navigation - Enter key (Requirement 13.2)', () => {
            render(<FAQSection />);

            const firstFaqButton = screen.getByText('What is the best photo gallery software for wedding photographers?').closest('button');
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'true');

            // Press Enter to close
            fireEvent.keyDown(firstFaqButton!, { key: 'Enter' });
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'false');

            // Press Enter to open
            fireEvent.keyDown(firstFaqButton!, { key: 'Enter' });
            expect(firstFaqButton).toHaveAttribute('aria-expanded', 'true');
        });

        it('supports keyboard navigation - Space key (Requirement 13.2)', () => {
            render(<FAQSection />);

            const secondFaqButton = screen.getByText('Can I try RawDrive for free?').closest('button');
            expect(secondFaqButton).toHaveAttribute('aria-expanded', 'false');

            // Press Space to open
            fireEvent.keyDown(secondFaqButton!, { key: ' ' });
            expect(secondFaqButton).toHaveAttribute('aria-expanded', 'true');
        });

        it('filters FAQs by search query', () => {
            render(<FAQSection />);

            const searchInput = screen.getByPlaceholderText('Search questions...');
            fireEvent.change(searchInput, { target: { value: 'data secure' } });

            // Should show security-related FAQ - may have multiple matches
            expect(screen.getAllByText(/Is my data secure\?/).length).toBeGreaterThan(0);
        });

        it('filters FAQs by category', () => {
            render(<FAQSection />);

            const securityButton = screen.getByText('Security').closest('button');
            fireEvent.click(securityButton!);

            // Should show security-related FAQs
            expect(screen.getByText('Is my data secure?')).toBeInTheDocument();
            expect(screen.getByText('Where is my data stored?')).toBeInTheDocument();
        });

        it('shows "No matching questions" message when search has no results', () => {
            render(<FAQSection />);

            const searchInput = screen.getByPlaceholderText('Search questions...');
            fireEvent.change(searchInput, { target: { value: 'xyznonexistentquery123' } });

            expect(screen.getByText('No matching questions')).toBeInTheDocument();
        });

        it('has correct section id for navigation', () => {
            const { container } = render(<FAQSection />);
            const section = container.querySelector('#faq');
            expect(section).toBeInTheDocument();
        });

        it('renders contact CTA section', () => {
            render(<FAQSection />);
            expect(screen.getByText('Still have questions?')).toBeInTheDocument();
            expect(screen.getByText('Email Support')).toBeInTheDocument();
        });
    });

    describe('FAQSection Schema.org Markup (Requirement 12.5)', () => {
        it('includes FAQPage schema on section element', () => {
            const { container } = render(<FAQSection />);

            const faqSection = container.querySelector('[itemtype="https://schema.org/FAQPage"]');
            expect(faqSection).toBeInTheDocument();
        });

        it('includes JSON-LD structured data', () => {
            const { container } = render(<FAQSection />);

            const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
            expect(jsonLdScript).toBeInTheDocument();

            const jsonContent = JSON.parse(jsonLdScript!.innerHTML);
            expect(jsonContent['@context']).toBe('https://schema.org');
            expect(jsonContent['@type']).toBe('FAQPage');
            expect(jsonContent.mainEntity).toBeDefined();
            expect(Array.isArray(jsonContent.mainEntity)).toBe(true);
            expect(jsonContent.mainEntity.length).toBeGreaterThan(0);
        });

        it('JSON-LD contains properly formatted questions and answers', () => {
            const { container } = render(<FAQSection />);

            const jsonLdScript = container.querySelector('script[type="application/ld+json"]');
            const jsonContent = JSON.parse(jsonLdScript!.innerHTML);

            // Check first question structure
            const firstQuestion = jsonContent.mainEntity[0];
            expect(firstQuestion['@type']).toBe('Question');
            expect(firstQuestion.name).toBeDefined();
            expect(firstQuestion.acceptedAnswer).toBeDefined();
            expect(firstQuestion.acceptedAnswer['@type']).toBe('Answer');
            expect(firstQuestion.acceptedAnswer.text).toBeDefined();
        });

        it('includes Question schema on FAQ items', () => {
            render(<FAQSection />);

            // Open a FAQ to make the answer visible
            const firstFaqButton = screen.getByText('How do I get started with RawDrive?').closest('button');
            fireEvent.click(firstFaqButton!);
            fireEvent.click(firstFaqButton!); // Open it

            // The GlassCard wrapping the FAQ should have Question schema
            const questionElements = document.querySelectorAll('[itemtype="https://schema.org/Question"]');
            expect(questionElements.length).toBeGreaterThan(0);
        });

        it('includes itemProp="name" on question text', () => {
            const { container } = render(<FAQSection />);

            const questionName = container.querySelector('[itemprop="name"]');
            expect(questionName).toBeInTheDocument();
        });
    });

    describe('FAQSection Accessibility (Requirement 13.2)', () => {
        it('has proper aria-labelledby for section', () => {
            const { container } = render(<FAQSection />);
            const section = container.querySelector('[aria-labelledby="faq-heading"]');
            expect(section).toBeInTheDocument();
        });

        it('has proper heading hierarchy', () => {
            render(<FAQSection />);
            const heading = screen.getByRole('heading', { name: 'Frequently Asked Questions' });
            expect(heading).toBeInTheDocument();
        });

        it('FAQ buttons have aria-expanded attribute', () => {
            render(<FAQSection />);
            const buttons = screen.getAllByRole('button').filter(btn =>
                btn.getAttribute('aria-expanded') !== null
            );
            expect(buttons.length).toBeGreaterThan(0);
        });

        it('FAQ buttons have aria-controls attribute', () => {
            render(<FAQSection />);
            const faqButton = screen.getByText('How do I get started with RawDrive?').closest('button');
            expect(faqButton).toHaveAttribute('aria-controls');
        });

        it('search input has accessible label', () => {
            render(<FAQSection />);
            const searchInput = screen.getByLabelText('Search frequently asked questions');
            expect(searchInput).toBeInTheDocument();
        });

        it('category buttons have aria-pressed attribute', () => {
            render(<FAQSection />);
            const allQuestionsButton = screen.getByText('All Questions').closest('button');
            expect(allQuestionsButton).toHaveAttribute('aria-pressed', 'true');
        });
    });

    describe('FAQSection with custom props', () => {
        const customFaqs = [
            {
                question: 'Custom Question 1',
                answer: 'Custom Answer 1',
                category: 'features',
            },
            {
                question: 'Custom Question 2',
                answer: 'Custom Answer 2',
                category: 'pricing',
            },
        ];

        it('renders custom FAQs when provided', () => {
            render(<FAQSection faqs={customFaqs} />);
            expect(screen.getByText('Custom Question 1')).toBeInTheDocument();
            expect(screen.getByText('Custom Question 2')).toBeInTheDocument();
        });

        it('renders custom title when provided', () => {
            render(<FAQSection title="Custom FAQ Title" />);
            expect(screen.getByText('Custom FAQ Title')).toBeInTheDocument();
        });

        it('renders custom subtitle when provided', () => {
            render(<FAQSection subtitle="Custom subtitle text" />);
            expect(screen.getByText('Custom subtitle text')).toBeInTheDocument();
        });
    });
});
