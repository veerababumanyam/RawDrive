import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SearchProvider, useAuth } from '../../contexts';
import { useToast } from '../../hooks/useToast';

/**
 * RootLayout Component
 *
 * Wraps all routes with common providers and handles cross-cutting concerns
 * like OAuth error display that require access to both Auth and Toast contexts.
 */
export const RootLayout: React.FC = () => {
    const { oauthError, clearOAuthError } = useAuth();
    const { addToast } = useToast();

    // Display OAuth errors as toast notifications
    useEffect(() => {
        if (oauthError) {
            addToast({
                title: 'Sign In Failed',
                message: oauthError.message,
                variant: 'error',
                duration: 8000, // Longer duration for error messages
                dismissible: true,
            });
            clearOAuthError();
        }
    }, [oauthError, addToast, clearOAuthError]);

    return (
        <SearchProvider>
            <Outlet />
        </SearchProvider>
    );
};
