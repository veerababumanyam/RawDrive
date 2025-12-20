import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
    Globe,
    Mail,
    Phone,
    MapPin,
    Instagram,
    Facebook,
    Twitter,
    Linkedin,
    Download,
    QrCode,
    Share2
} from 'lucide-react';
import { PublicCompanyProfile } from '../../../types/companyProfile';
import { companyProfileService } from '../../../services/companyProfileService';
import { AppButton } from '../../ui/AppButton';

interface Props {
    slug: string;
}

export const PublicProfileView: React.FC<Props> = ({ slug }) => {
    const [profile, setProfile] = useState<PublicCompanyProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            setIsLoading(true);
            try {
                const data = await companyProfileService.getPublicProfile(slug);
                setProfile(data);
            } catch (err: any) {
                console.error(err);
                if (err.response?.status === 404) {
                    setError("Profile not found");
                } else {
                    setError("Failed to load profile");
                }
            } finally {
                setIsLoading(false);
            }
        };
        if (slug) fetchProfile();
    }, [slug]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
                <div className="text-center max-w-md w-full bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">{error || "Profile not found"}</p>
                    <AppButton variant="primary" onClick={() => window.location.href = '/'}>Go Home</AppButton>
                </div>
            </div>
        );
    }

    const { name, tagline, logo_url, company_visibility, address_structured, socials, custom_links, seo_schema } = profile;
    const displayName = name || 'Company Profile';

    const handleDownloadVCard = () => {
        window.open(companyProfileService.getVCardUrl(slug), '_blank');
    };

    const handleDownloadQr = () => {
        const url = companyProfileService.getQrCodeUrl(slug);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${slug}-qr.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    return (
        <>
            <Helmet>
                <title>{displayName} | Profile</title>
                <meta name="description" content={tagline || `${displayName} business profile`} />
                {seo_schema && <script type="application/ld+json">{JSON.stringify(seo_schema)}</script>}
            </Helmet>

            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">

                {/* Main Card */}
                <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800 transition-all hover:shadow-2xl">

                    {/* Header / Brand */}
                    <div className="relative pt-12 pb-8 px-8 text-center bg-gradient-to-b from-primary/5 to-transparent">
                        {company_visibility?.logo_url && logo_url ? (
                            <div className="mx-auto w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-6 bg-white dark:bg-gray-800 flex items-center justify-center">
                                <img src={logo_url} alt={displayName} className="w-full h-full object-cover" />
                            </div>
                        ) : (
                            <div className="mx-auto w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg mb-6 bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white text-4xl font-bold">
                                {displayName.charAt(0)}
                            </div>
                        )}

                        {company_visibility?.name && name && (
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{name}</h1>
                        )}
                        {company_visibility?.tagline && tagline && (
                            <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">{tagline}</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="px-8 pb-8 flex gap-3 justify-center">
                        <AppButton variant="primary" className="flex-1" onClick={handleDownloadVCard} leftIcon={<Download size={18} />}>
                            Save Contact
                        </AppButton>
                        <AppButton variant="outline" size="icon" onClick={handleDownloadQr} title="QR Code">
                            <QrCode size={20} />
                        </AppButton>
                        <AppButton variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(window.location.href)} title="Share">
                            <Share2 size={20} />
                        </AppButton>
                    </div>

                    {/* Contact Details */}
                    <div className="px-8 py-6 border-t border-gray-100 dark:border-gray-800 space-y-4">

                        {company_visibility?.email && profile.email && (
                            <a href={`mailto:${profile.email}`} className="flex items-center gap-4 text-gray-700 dark:text-gray-300 hover:text-primary transition-colors p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg">
                                    <Mail size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 uppercase font-semibold">Email</div>
                                    <div className="font-medium">{profile.email}</div>
                                </div>
                            </a>
                        )}

                        {company_visibility?.phone && profile.phone && (
                            <a href={`tel:${profile.phone}`} className="flex items-center gap-4 text-gray-700 dark:text-gray-300 hover:text-primary transition-colors p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg">
                                    <Phone size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 uppercase font-semibold">Phone</div>
                                    <div className="font-medium">{profile.phone}</div>
                                </div>
                            </a>
                        )}

                        {company_visibility?.website && profile.website && (
                            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 text-gray-700 dark:text-gray-300 hover:text-primary transition-colors p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800">
                                <div className="p-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg">
                                    <Globe size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 uppercase font-semibold">Website</div>
                                    <div className="font-medium truncate">{profile.website.replace(/^https?:\/\//, '')}</div>
                                </div>
                            </a>
                        )}

                        {company_visibility?.address && address_structured && address_structured.line1 && (
                            <div className="flex items-center gap-4 text-gray-700 dark:text-gray-300 p-3 rounded-xl">
                                <div className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    <MapPin size={20} />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-gray-500 uppercase font-semibold">Location</div>
                                    <div className="font-medium">
                                        {address_structured.line1}<br />
                                        {address_structured.city}, {address_structured.state} {address_structured.postal_code}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Links & Socials */}
                    {(company_visibility?.socials || company_visibility?.custom_links) && (
                        <div className="px-8 py-6 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                            <div className="grid grid-cols-4 gap-4 justify-items-center">
                                {company_visibility?.socials && socials?.instagram && (
                                    <a href={`https://instagram.com/${socials.instagram.replace('@', '')}`} target="_blank" rel="noopener" className="p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full text-pink-600 transition-transform hover:-translate-y-1">
                                        <Instagram size={24} />
                                    </a>
                                )}
                                {company_visibility?.socials && socials?.facebook && (
                                    <a href={socials.facebook} target="_blank" rel="noopener" className="p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full text-blue-600 transition-transform hover:-translate-y-1">
                                        <Facebook size={24} />
                                    </a>
                                )}
                                {company_visibility?.socials && socials?.twitter && (
                                    <a href={socials.twitter} target="_blank" rel="noopener" className="p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full text-sky-500 transition-transform hover:-translate-y-1">
                                        <Twitter size={24} />
                                    </a>
                                )}
                                {company_visibility?.socials && socials?.linkedin && (
                                    <a href={socials.linkedin} target="_blank" rel="noopener" className="p-3 bg-white dark:bg-gray-800 shadow-sm hover:shadow-md rounded-full text-blue-700 transition-transform hover:-translate-y-1">
                                        <Linkedin size={24} />
                                    </a>
                                )}
                            </div>

                            {company_visibility?.custom_links && custom_links && custom_links.length > 0 && (
                                <div className="mt-6 space-y-3">
                                    {custom_links.map((link, idx) => (
                                        <a key={idx} href={link.url} target="_blank" rel="noopener" className="block w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-center font-medium text-gray-700 dark:text-gray-200 hover:border-primary hover:text-primary transition-all shadow-sm hover:shadow">
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="py-4 text-center text-xs text-gray-400">
                        Powered by Lumina
                    </div>

                </div>
            </div>
        </>
    );
};
