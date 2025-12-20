
import React, { createContext, useContext, useRef, useCallback, useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { SearchModal } from '../components/features/gallery/SearchModal';

type SearchHandler = (query: string) => void;

interface SearchContextType {
    /** Register a custom search handler for the current page */
    registerHandler: (handler: SearchHandler) => void;
    /** Unregister the current handler (cleanup) */
    unregisterHandler: () => void;
    /** Submit a search query to the registered handler (or return false if none) */
    submitSearch: (query: string) => boolean;
    /** Whether a custom handler is currently registered */
    hasHandler: boolean;
    /** Open the global search modal */
    openGlobalSearch: () => void;
}

const SearchContext = createContext<SearchContextType | null>(null);

export const useSearch = () => {
    const context = useContext(SearchContext);
    if (!context) {
        throw new Error('useSearch must be used within a SearchProvider');
    }
    return context;
};

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const navigate = useNavigate();
    const handlerRef = useRef<SearchHandler | null>(null);
    // We use state for hasHandler to trigger re-renders in consumers (like the Header)
    const [hasHandler, setHasHandler] = useState(false);
    const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

    const registerHandler = useCallback((handler: SearchHandler) => {
        handlerRef.current = handler;
        setHasHandler(true);
    }, []);

    const unregisterHandler = useCallback(() => {
        handlerRef.current = null;
        setHasHandler(false);
    }, []);

    const submitSearch = useCallback((query: string) => {
        if (handlerRef.current) {
            handlerRef.current(query);
            return true;
        }
        return false;
    }, []);

    const openGlobalSearch = useCallback(() => {
        setIsGlobalSearchOpen(true);
    }, []);

    const handleNavigate = useCallback((type: string, id: string) => {
        switch (type) {
            case 'gallery':
                navigate(`/workspace/galleries/${id}`);
                break;
            // Add other types as needed, e.g. navigate to asset text/search view
            case 'asset':
                // We might need a way to navigate to a specific asset in a gallery
                // For now, maybe just log or handle if we have galleryId
                break;
        }
        setIsGlobalSearchOpen(false);
    }, [navigate]);

    return (
        <SearchContext.Provider value={{
            registerHandler,
            unregisterHandler,
            submitSearch,
            hasHandler,
            openGlobalSearch
        }}>
            {children}
            <SearchModal
                isOpen={isGlobalSearchOpen}
                onClose={() => setIsGlobalSearchOpen(false)}
                onNavigate={handleNavigate}
            />
        </SearchContext.Provider>
    );
};
