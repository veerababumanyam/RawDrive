/**
 * GalleryCreatePage Component
 * Page for creating a new gallery
 *
 * NOTE: This page is rendered inside WorkspaceLayout via routes.tsx
 * Do NOT wrap in WorkspaceLayout here - it's already provided by the router
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGalleryList } from '../../hooks/useGallery';
import { GalleryCreateForm } from '../../components/features/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import type { GalleryCreateRequest } from '../../types/gallery';

const GalleryCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { workspace, isLoading: authLoading } = useAuth();
  const { createGallery } = useGalleryList({
    workspaceId: workspace?.workspace_id || '',
    autoFetch: false,
  });

  const handleSubmit = async (data: GalleryCreateRequest) => {
    if (!workspace?.workspace_id) {
      throw new Error('Workspace not found. Please ensure you are logged in and have access to a workspace.');
    }

    try {
      const newGallery = await createGallery(data);
      // Navigate to gallery detail page on success
      navigate(`/workspace/galleries/${newGallery.gallery_id}`);
    } catch (error) {
      // Error is handled by GalleryCreateForm component
      // Form data is preserved because we're not resetting state
      throw error; // Re-throw so form can display error
    }
  };

  const handleCancel = () => {
    navigate('/workspace/galleries');
  };

  // Show loading state while auth is initializing
  if (authLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="card-glass rounded-2xl flex items-center justify-center py-16">
          <div className="text-center">
            <div className="relative w-12 h-12 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-accent opacity-30 blur-md animate-pulse"></div>
              <div className="relative animate-spin rounded-full h-12 w-12 border-2 border-transparent border-t-primary border-r-accent"></div>
            </div>
            <p className="text-text-secondary">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if workspace is not available
  if (!workspace?.workspace_id) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <AppCard padding="lg" radius="xl" variant="glass" className="card-glass">
          <div className="text-center py-8">
            <h2 className="text-xl font-bold text-text-primary mb-2">Workspace Not Found</h2>
            <p className="text-text-secondary mb-6">
              Please ensure you are logged in and have access to a workspace.
            </p>
            <AppButton variant="primary" shine onClick={() => navigate('/workspace/galleries')}>
              Back to Galleries
            </AppButton>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header - Enhanced with glass effect */}
      <div className="card-glass rounded-2xl p-4 sm:p-6 flex items-center gap-4">
        <AppButton
          variant="ghost"
          size="icon"
          onClick={handleCancel}
          aria-label="Back to galleries"
          className="hover:bg-surface-hover/50 hover:scale-110 transition-all duration-200"
        >
          <ArrowLeft size={20} />
        </AppButton>
        <div>
          <h1 className="text-2xl font-bold text-gradient">Create New Gallery</h1>
          <p className="text-text-secondary mt-1">
            Start organizing photos for your client
          </p>
        </div>
      </div>

      {/* Form Card - Enhanced with glass-premium effect */}
      <AppCard padding="lg" radius="xl" variant="glass" className="card-glass border border-white/10 dark:border-white/5">
        <GalleryCreateForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />
      </AppCard>
    </div>
  );
};

export default GalleryCreatePage;
