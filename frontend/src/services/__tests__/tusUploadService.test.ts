
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    registerUploadClient,
    unregisterUploadClient,
    autoResumeUploads,
    type TusUploadState
} from '../tusUploadService';

// Mock the interface of TusUploadClient
const createMockClient = (id: string, stateOverrides: Partial<TusUploadState> = {}) => ({
    getState: () => ({
        uploadId: id,
        isPaused: false,
        isComplete: false,
        uploadedBytes: 0,
        totalBytes: 100,
        ...stateOverrides
    }),
    resume: vi.fn().mockResolvedValue(id),
    // Add other required properties strictly if necessary for typing, casting as any for test simplicity
} as any);

describe('tusUploadService Auto-Resume', () => {
    beforeEach(() => {
        // Ideally we would clear the map, but it's private. 
        // We can just rely on unique IDs for each test or unregister everything manually if we tracked them.
        // Since we can't clear the private map, we use unique IDs.
    });

    it('should auto-resume paused clients', async () => {
        const clientId = 'test-resume-1';
        const mockClient = createMockClient(clientId, { isPaused: true });

        registerUploadClient(mockClient);

        await autoResumeUploads();

        expect(mockClient.resume).toHaveBeenCalled();

        // Cleanup
        unregisterUploadClient(clientId);
    });

    it('should not resume active (non-paused) clients', async () => {
        const clientId = 'test-active-1';
        const mockClient = createMockClient(clientId, { isPaused: false });

        registerUploadClient(mockClient);

        await autoResumeUploads();

        expect(mockClient.resume).not.toHaveBeenCalled();

        unregisterUploadClient(clientId);
    });

    it('should not resume completed clients', async () => {
        const clientId = 'test-complete-1';
        const mockClient = createMockClient(clientId, { isPaused: true, isComplete: true });

        registerUploadClient(mockClient);

        await autoResumeUploads();

        expect(mockClient.resume).not.toHaveBeenCalled();

        unregisterUploadClient(clientId);
    });

    it('should not resume clients with errors', async () => {
        const clientId = 'test-error-1';
        const mockClient = createMockClient(clientId, { isPaused: true, error: new Error('Failed') });

        registerUploadClient(mockClient);

        await autoResumeUploads();

        expect(mockClient.resume).not.toHaveBeenCalled();

        unregisterUploadClient(clientId);
    });

    it('should stop tracking clients after unregister', async () => {
        const clientId = 'test-unregister-1';
        const mockClient = createMockClient(clientId, { isPaused: true });

        registerUploadClient(mockClient);
        unregisterUploadClient(clientId);

        await autoResumeUploads();

        expect(mockClient.resume).not.toHaveBeenCalled();
    });
});
