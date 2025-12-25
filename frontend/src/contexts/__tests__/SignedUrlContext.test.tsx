import { describe, test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React, { useEffect, useState } from 'react';
import { SignedUrlProvider, useSignedUrlContext } from '../SignedUrlContext';
import { signedUrlService } from '../../services/signedUrlService';
import { AuthProvider } from '../AuthContext';

// Mock dependencies
vi.mock('../AuthContext', async () => {
    return {
        useAuth: () => ({ workspace: { workspace_id: 'ws-123' } }),
        AuthProvider: ({ children }: any) => <div>{children}</div>
    };
});

// Mock service
vi.mock('../../services/signedUrlService', () => ({
    signedUrlService: {
        getSignedUrls: vi.fn(),
    }
}));

const TestComponent = ({ assetId }: { assetId: string }) => {
    const { getSignedUrl } = useSignedUrlContext();
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        getSignedUrl(assetId).then(setUrl);
    }, [assetId, getSignedUrl]);

    return <div>{url || 'loading'}</div>;
};

describe('SignedUrlContext', () => {
    test('Property 30: API Request Batching', async () => {
        const getSignedUrlsMock = signedUrlService.getSignedUrls as any;
        
        // Setup mock response
        getSignedUrlsMock.mockImplementation(async (_ws: string, ids: string[]) => {
            const map = new Map();
            ids.forEach(id => map.set(id, `https://url.com/${id}`));
            return map;
        });

        vi.useFakeTimers();

        render(
            <AuthProvider>
                <SignedUrlProvider>
                    <TestComponent assetId="1" />
                    <TestComponent assetId="2" />
                    <TestComponent assetId="3" />
                </SignedUrlProvider>
            </AuthProvider>
        );

        // Advance timers to trigger debounce (50ms)
        await act(async () => {
             vi.advanceTimersByTime(60);
        });

        // Verification: Should have called service ONCE with 3 IDs
        expect(getSignedUrlsMock).toHaveBeenCalledTimes(1);
        const calledIds = getSignedUrlsMock.mock.calls[0][1];
        expect(calledIds).toHaveLength(3);
        expect(calledIds).toContain('1');
        expect(calledIds).toContain('2');
        expect(calledIds).toContain('3');

        vi.useRealTimers();
    });
});
