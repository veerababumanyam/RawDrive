import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import routes from '../router/routes';

// Mock RootLayout to bypass SearchProvider and AuthProvider dependencies
vi.mock('../components/layout/RootLayout', () => ({
    RootLayout: () => <Outlet />,
}));

// Mock the components (especially lazy ones) to make testing easier and faster
vi.mock('../pages/public/LandingPage', () => ({
    default: () => <div data-testid="landing-page">Landing Page</div>,
}));

// Mock other components if necessary to prevent errors/suspense issues in test
vi.mock('../pages/public/SignInPage', () => ({ default: () => <div>Sign In</div> }));

describe('Landing Page Routing', () => {
    it('renders landing page at root route /', async () => {
        const router = createMemoryRouter(routes, {
            initialEntries: ['/'],
            future: {
                v7_relativeSplatPath: true,
            },
        });

        render(<RouterProvider router={router} />);

        screen.debug();

        await waitFor(() => {
            expect(screen.getByTestId('landing-page')).toBeInTheDocument();
        });
    });

    it('navigates to landing page from 404 page', async () => {
        // This test simulates landing on a bad route, seeing 404, and finding the link/button to go home.
        // In a real browser, clicking the link with href="/" causes a reload. 
        // In this test environment, we verify the link exists and points to /.

        const router = createMemoryRouter(routes, {
            initialEntries: ['/non-existent-route-12345'],
            future: {
                v7_relativeSplatPath: true,
            },
        });

        render(<RouterProvider router={router} />);

        // Should see 404
        await waitFor(() => {
            expect(screen.getByText('404')).toBeInTheDocument();
        });

        // Verify "Go Home" link exists and points to /
        const homeLink = screen.getByText('Go Home');
        expect(homeLink).toBeInTheDocument();
        expect(homeLink.closest('a')).toHaveAttribute('href', '/');
    });
});
