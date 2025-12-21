import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { galleryService } from '../../services/galleryService';
import { GalleryDetailData, PublicGalleryAsset } from '../../types/gallery';
import { AppButton } from '../../components/ui/AppButton';
import { Download, Grid } from 'lucide-react';

const PublicGalleryPage: React.FC = () => {
    // Note: Parameter name must match route definition
    const { galleryId } = useParams<{ galleryId: string }>();
    const [gallery, setGallery] = useState<GalleryDetailData | null>(null);
    const [assets, setAssets] = useState<PublicGalleryAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGalleryData = async () => {
            if (!galleryId) return;
            setIsLoading(true);
            try {
                // Fetch gallery details
                const galleryData = await galleryService.getPublicGallery(galleryId);
                setGallery(galleryData);

                // Fetch assets
                const assetsData = await galleryService.getPublicGalleryAssets(galleryId);
                setAssets(assetsData);
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
        fetchGalleryData();
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

    // Construct cover URL
    const coverUrl = gallery.cover_asset_id
        ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview`
        : null;

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
                {coverUrl ? (
                    <div className="absolute inset-0">
                        <img
                            src={coverUrl}
                            alt="Cover"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-black/30"></div>
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-black"></div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-12 p-4 text-center">
                    <div className="max-w-3xl">
                        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg font-heading">{gallery.title}</h2>
                        {gallery.description && (
                            <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">{gallery.description}</p>
                        )}
                        <div className="mt-6 flex flex-wrap justify-center gap-4 text-white/80 text-sm font-medium">
                            <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{new Date(gallery.created_at).toLocaleDateString()}</span>
                            <span className="bg-black/40 px-3 py-1 rounded-full backdrop-blur-sm">{gallery.stats.total_photos} Photos</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 max-w-7xl mx-auto px-4 md:px-6 py-12 w-full">

                {gallery.status !== 'published' && (
                    <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 rounded-lg text-center border border-yellow-200 dark:border-yellow-800">
                        This gallery is currently <strong>{gallery.status}</strong>. Only you can see this.
                    </div>
                )}

                {assets.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <Grid className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>No photos in this gallery yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {assets.map(asset => (
                            <div key={asset.asset_id} className="aspect-[3/2] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden group relative break-inside-avoid">
                                <img
                                    src={`/api/v1/public/galleries/${gallery.gallery_id}/assets/${asset.asset_id}/thumbnail`}
                                    alt={asset.filename}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300"></div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="bg-gray-50 dark:bg-black py-12 border-t border-gray-100 dark:border-gray-800">
                <div className="max-w-7xl mx-auto px-4 text-center space-y-6">
                    {company_profile?.logo_url ? (
                        <img src={company_profile.logo_url} alt="Logo" className="h-10 mx-auto grayscale hover:grayscale-0 transition-all opacity-70 hover:opacity-100" />
                    ) : null}

                    <div>
                        <p className="font-medium text-lg text-gray-900 dark:text-white mb-2">{company_profile?.name || 'Studio Name'}</p>
                        {company_profile?.website && (
                            <a href={company_profile.website} target="_blank" rel="noreferrer" className="text-primary hover:underline transition-colors">
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
