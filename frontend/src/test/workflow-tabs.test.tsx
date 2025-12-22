import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkflowTabs } from '../components/landing/sections/WorkflowTabs';

// Mock AnimatePresence to render children immediately
vi.mock('framer-motion', async () => {
    const actual = await vi.importActual('framer-motion');
    return {
        ...actual,
        AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>
    };
});

describe('WorkflowTabs Component', () => {
    it('renders all tab buttons', () => {
        render(<WorkflowTabs />);
        expect(screen.getByRole('tab', { name: /Attract/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Manage/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Deliver/i })).toBeInTheDocument();
    });

    it('displays default active tab content (Attract)', () => {
        render(<WorkflowTabs />);
        expect(screen.getByText('Your Brand, Front and Center')).toBeInTheDocument();
        expect(screen.getByText(/public profile and SEO-optimized portfolio/i)).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /Attract/i })).toHaveAttribute('aria-selected', 'true');
    });

    it('switches content when managing tab is clicked', () => {
        render(<WorkflowTabs />);

        const manageTab = screen.getByRole('tab', { name: /Manage/i });
        fireEvent.click(manageTab);

        expect(screen.getByText('Never Lose a Lead Again')).toBeInTheDocument();
        expect(screen.getByText(/Streamline your client communications/i)).toBeInTheDocument();
        expect(manageTab).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: /Attract/i })).toHaveAttribute('aria-selected', 'false');
    });

    it('switches content when deliver tab is clicked', () => {
        render(<WorkflowTabs />);

        const deliverTab = screen.getByRole('tab', { name: /Deliver/i });
        fireEvent.click(deliverTab);

        expect(screen.getByText('Delivery That Wows Clients')).toBeInTheDocument();
        expect(screen.getByText(/mobile-friendly galleries/i)).toBeInTheDocument();
    });
});
