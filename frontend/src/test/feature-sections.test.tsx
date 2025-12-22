import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AutomationSection } from '../components/landing/sections/AutomationSection';
import { SecuritySection } from '../components/landing/sections/SecuritySection';

// Mock IntersectionObserver for Framer Motion
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

describe('Feature Sections Components', () => {
    describe('AutomationSection', () => {
        it('renders headline', () => {
            render(<AutomationSection />);
            expect(screen.getByText('Built for the Future of Automation')).toBeInTheDocument();
        });

        it('renders all feature cards', () => {
            render(<AutomationSection />);
            expect(screen.getByText('Zapier Integration')).toBeInTheDocument();
            expect(screen.getByText('Open API')).toBeInTheDocument();
            expect(screen.getByText('AI Assistant')).toBeInTheDocument();
            expect(screen.getByText('Green Hosting')).toBeInTheDocument();
        });
    });

    describe('SecuritySection', () => {
        it('renders headline', () => {
            render(<SecuritySection />);
            expect(screen.getByText('Bank-Grade Security for Your Art')).toBeInTheDocument();
        });

        it('renders section badge', () => {
            render(<SecuritySection />);
            expect(screen.getByText('Enterprise Security')).toBeInTheDocument();
        });

        it('renders all three required security features (SOC 2, Granular Access, Global Backup)', () => {
            render(<SecuritySection />);
            // Requirements 5.2, 5.3, 5.4: Must display SOC 2, Granular Access, Global Backup
            expect(screen.getByText('SOC 2 Certified')).toBeInTheDocument();
            expect(screen.getByText('Granular Access')).toBeInTheDocument();
            expect(screen.getByText('Global Backup')).toBeInTheDocument();
        });

        it('renders End-to-End Encryption as fourth feature', () => {
            render(<SecuritySection />);
            expect(screen.getByText('End-to-End Encryption')).toBeInTheDocument();
        });

        it('displays accurate description for SOC 2 feature', () => {
            render(<SecuritySection />);
            // Requirement 5.2: SOC 2 with explanation of enterprise-grade security standards
            expect(screen.getByText(/Enterprise-grade security standards/i)).toBeInTheDocument();
        });

        it('displays accurate description for Granular Access feature', () => {
            render(<SecuritySection />);
            // Requirement 5.3: Granular Access with explanation of permission controls and link expiration
            expect(screen.getByText(/permission controls/i)).toBeInTheDocument();
            expect(screen.getByText(/link expiration/i)).toBeInTheDocument();
        });

        it('displays accurate description for Global Backup feature', () => {
            render(<SecuritySection />);
            // Requirement 5.4: Global Backup with explanation of disaster recovery and point-in-time restore
            expect(screen.getByText(/point-in-time recovery/i)).toBeInTheDocument();
        });

        it('displays accurate description for End-to-End Encryption feature', () => {
            render(<SecuritySection />);
            expect(screen.getByText(/encrypted in transit and at rest/i)).toBeInTheDocument();
        });

        it('has correct section id for navigation', () => {
            const { container } = render(<SecuritySection />);
            const section = container.querySelector('#security');
            expect(section).toBeInTheDocument();
        });
    });
});
