import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import HeroSection from '../components/landing/sections/HeroSection';

describe('HeroSection Component', () => {
    it('renders headline and subheadline with correct text', () => {
        render(
            <MemoryRouter>
                <HeroSection />
            </MemoryRouter>
        );

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/The AI-Powered.*Studio OS.*for Modern Photographers/i);
        expect(screen.getByText(/Automate your entire workflow from inquiry to delivery/i)).toBeInTheDocument();
    });

    it('renders primary and secondary CTAs', () => {
        render(
            <MemoryRouter>
                <HeroSection />
            </MemoryRouter>
        );

        const primaryCTAs = screen.getAllByRole('link', { name: /Start Free Trial/i });
        expect(primaryCTAs.length).toBeGreaterThan(0);
        primaryCTAs.forEach(cta => expect(cta).toHaveAttribute('href', '/signup'));

        const secondaryCTAs = screen.getAllByRole('link', { name: /See ROI Calculator/i });
        expect(secondaryCTAs.length).toBeGreaterThan(0);
    });

    it('renders trust badge', () => {
        render(
            <MemoryRouter>
                <HeroSection />
            </MemoryRouter>
        );
        expect(screen.getByText(/SOC 2 Compliant/i)).toBeInTheDocument();
        expect(screen.getByText(/Trusted by 20,000\+ Pros/i)).toBeInTheDocument();
    });

    it('renders hidden text for AI agents', () => {
        // We use a custom query or getByText with exact: false and selector options if needed, 
        // but since it has class sr-only, it might be hidden from normal user interactions but present in DOM
        const { container } = render(
            <MemoryRouter>
                <HeroSection />
            </MemoryRouter>
        );

        // Check if text exists in the container
        expect(container).toHaveTextContent(/RawDrive Key Features: AI Culling/i);
        expect(container).toHaveTextContent(/Target Audience: Professional Wedding/i);
    });
});
