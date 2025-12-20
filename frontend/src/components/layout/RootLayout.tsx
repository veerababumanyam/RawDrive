import React from 'react';
import { Outlet } from 'react-router-dom';
import { SearchProvider } from '../../contexts';

export const RootLayout: React.FC = () => {
    return (
        <SearchProvider>
            <Outlet />
        </SearchProvider>
    );
};
