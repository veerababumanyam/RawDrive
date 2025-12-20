import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import { GalleryDetailData } from '../../types/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { Download } from 'lucide-react';

const PublicGalleryPage: React.FC = () => {
    // Note: Parameter name must match route definition
    const { galleryId } = useParams<{ galleryId: string }>();
    const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGallery = async () => {
            if (!galleryId) return;
            setIsLoading(true);
            try {
                const data = await galleryService.getPublicGallery(galleryId);
                setGallery(data);
            } catch (err: any) {
                console.error(err);
                if (err.message && err.message.includes('404')) {
                    setError('Gallery not found or is not public.');
                } else {
                    setError('Failed to load gallery.');
                }
            } finally {
                setIsLoading(false);
            }
        };
        fetchGallery();
    }, [galleryId]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !gallery) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
                <div className="text-center p-8 bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md mx-4">
                    <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Gallery Unavailable</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "This gallery is not publicly accessible."}</p>
                    <AppButton variant="primary" onClick={() => window.location.href = '/'}>Go Home</AppButton>
                </div>
            </div>
        );
    }

    const { company_profile } = gallery;
    const activeColor = company_profile?.brand_color || '#2563EB';

    return (
        <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950" style={{ '--primary-color': activeColor } as React.CSSProperties}>
            <Helmet>
                <title>{gallery.title} {company_profile?.name ? `| ${company_profile.name}` : ''}</title>
            </Helmet>

            {/* Sticky Header */}
            <header className="sticky top-0 z-50 bg-white/90 dark:bg-black/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 transition-all">
                <div className="max-w-7xl mx-auto px-4 md:px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {company_profile?.logo_url ? (
                            <img src={company_profile.logo_url} alt={company_profile.name} className="h-10 w-auto object-contain" />
                        ) : (
                            company_profile?.name && <span className="text-lg font-bold font-heading">{company_profile.name}</span>
                        )}
                        <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 mx-2 hidden sm:block"></div>
                        <h1 className="text-lg font-medium hidden sm:block truncate max-w-md" title={gallery.title}>{gallery.title}</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {gallery.download_policy !== 'view_only' && (
                            <AppButton variant="outline" leftIcon={<Download size={16} />} size="sm">
                                Download
                            </AppButton>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero / Cover */}
            <div className="relative h-[40vh] md:h-[50vh] bg-gray-100 dark:bg-gray-900 overflow-hidden">
                {gallery.cover_asset_id ? (
                    /* Ideally fetch signed URL for cover */
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        {/* Placeholder until we have public signed URLs */}
                        <img src="/placeholder-cover.jpg" alt="Cover" className="w-full h-full object-cover opacity-80"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black"></div>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 text-center">
                    <div className="max-w-2xl">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg">{gallery.title}</h2>
                        {gallery.description && (
                            <p className="text-white/90 text-lg md:text-xl drop-shadow-md">{gallery.description}</p>
                        )}
                        <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/80 text-sm">
                            <span>{new Date(gallery.created_at).toLocaleDateString()}</span>
                            <span>&bull;</span>
                            <span>{gallery.stats.total_photos} Photos</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full">

                {gallery.status !== 'published' && (
                    <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg text-center">
                        This gallery is currently <strong>{gallery.status}</strong>. Only you can see this.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Placeholder for PhotoGrid - Needs Public Assets API */}
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="aspect-[3/2] bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse"></div>
                    ))}
                </div>
                <div className="text-center mt-12 text-gray-500">
                    <p>Gallery assets loading is being implemented.</p>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-gray-50 dark:bg-black py-12 border-t border-gray-100 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 text-center space-y-4">
                    {company_profile?.logo_url && (
                        <img src={company_profile.logo_url} alt="Logo" className="h-8 mx-auto grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100" />
                    )}
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">{company_profile?.name || 'Studio Name'}</p>
                        {company_profile?.website && (
                            <a href={company_profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">
                                {company_profile.website.replace(/^https?:\/\//, '')}
                            </a>
                        )}
                    </div>
                    <div className="text-xs text-gray-400">
                        &copy; {new Date().getFullYear()} {company_profile?.name}. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicGalleryPage;
