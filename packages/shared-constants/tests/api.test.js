import { describe, it, expect } from 'vitest';
import { API_VERSION, API_BASE, WORKSPACE_PATHS, PUBLIC_PATHS } from '../src/api';
describe('API constants', () => {
    it('has expected API version and base', () => {
        expect(API_VERSION).toBe('v1');
        expect(API_BASE).toBe('/api/v1');
    });
    it('builds workspace-scoped paths', () => {
        const ws = 'workspace-123';
        expect(WORKSPACE_PATHS.GALLERIES(ws)).toBe('/api/v1/workspaces/workspace-123/galleries');
        expect(WORKSPACE_PATHS.ASSETS(ws)).toBe('/api/v1/workspaces/workspace-123/assets');
        expect(WORKSPACE_PATHS.UPLOADS(ws)).toBe('/api/v1/workspaces/workspace-123/uploads');
        expect(WORKSPACE_PATHS.INVITATIONS(ws)).toBe('/api/v1/workspaces/workspace-123/digital-invitations');
        expect(WORKSPACE_PATHS.FACE_GROUPS(ws)).toBe('/api/v1/workspaces/workspace-123/face-groups');
        expect(WORKSPACE_PATHS.MEMBERS(ws)).toBe('/api/v1/workspaces/workspace-123/members');
        expect(WORKSPACE_PATHS.ROLES(ws)).toBe('/api/v1/workspaces/workspace-123/roles');
    });
    it('builds public paths', () => {
        expect(PUBLIC_PATHS.GALLERY('slug-1')).toBe('/api/v1/public/galleries/slug-1');
        expect(PUBLIC_PATHS.INVITATION('token-1')).toBe('/api/v1/public/invitations/token-1');
    });
});
