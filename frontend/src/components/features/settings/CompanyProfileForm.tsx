import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import {
    Globe,
    Mail,
    Phone,
    Linkedin,
    Twitter,
    Instagram,
    Facebook,
    Link as LinkIcon,
    Plus,
    Trash2,
    Save,
    Eye,
    EyeOff,
    QrCode,
    Download
} from 'lucide-react';

import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { Card } from '../../ui/AppCard';
import { useToastActions } from '../../ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { companyProfileService } from '../../../services/companyProfileService';
import { CreateCompanyProfileRequest, CompanyVisibilityConfig } from '../../../types/companyProfile';

/**
 * Sanitizes the profile data before submission.
 * - Removes address_structured if all fields are empty
 * - Filters out empty social media entries
 * - Filters out empty custom links
 * - Removes empty optional string fields
 */
const sanitizeProfileData = (data: CreateCompanyProfileRequest): CreateCompanyProfileRequest => {
    const sanitized = { ...data };

    // Check if address_structured has any non-empty values
    if (sanitized.address_structured) {
        const addr = sanitized.address_structured;
        const hasAddressData = addr.line1?.trim() || addr.line2?.trim() ||
                               addr.city?.trim() || addr.state?.trim() ||
                               addr.postal_code?.trim() || addr.country?.trim();
        if (!hasAddressData) {
            sanitized.address_structured = undefined;
        }
    }

    // Filter out empty social media entries
    if (sanitized.socials) {
        const filteredSocials: Record<string, string> = {};
        for (const [key, value] of Object.entries(sanitized.socials)) {
            if (value?.trim()) {
                filteredSocials[key] = value.trim();
            }
        }
        sanitized.socials = Object.keys(filteredSocials).length > 0 ? filteredSocials : undefined;
    }

    // Filter out empty custom links
    if (sanitized.custom_links) {
        sanitized.custom_links = sanitized.custom_links.filter(
            link => link.label?.trim() && link.url?.trim()
        );
        if (sanitized.custom_links.length === 0) {
            sanitized.custom_links = undefined;
        }
    }

    // Clean up empty optional string fields
    if (!sanitized.logo_url?.trim()) sanitized.logo_url = undefined;
    if (!sanitized.favicon_url?.trim()) sanitized.favicon_url = undefined;
    if (!sanitized.tagline?.trim()) sanitized.tagline = undefined;
    if (!sanitized.phone?.trim()) sanitized.phone = undefined;
    if (!sanitized.website?.trim()) sanitized.website = undefined;
    if (!sanitized.brand_color?.trim()) sanitized.brand_color = undefined;
    if (!sanitized.brand_font?.trim()) sanitized.brand_font = undefined;

    return sanitized;
};

const DEFAULT_PROFILE: CreateCompanyProfileRequest = {
    name: '',
    slug: '',
    email: '',
    logo_url: '',
    tagline: '',
    phone: '',
    website: '',
    address_structured: {
        line1: '',
        city: '',
        state: '',
        postal_code: '',
        country: ''
    },
    socials: {
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: ''
    },
    custom_links: [],
    company_visibility: {
        name: true,
        tagline: true,
        logo_url: true,
        email: true,
        phone: true,
        website: true,
        address: true,
        socials: true,
        custom_links: true
    }
};

export const CompanyProfileForm: React.FC = () => {
    const { workspace } = useAuth();
    const toast = useToastActions();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);

    const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm<CreateCompanyProfileRequest>({
        defaultValues: DEFAULT_PROFILE
    });

    const { fields: linkFields, append, remove } = useFieldArray({
        control,
        name: "custom_links"
    });

    useEffect(() => {
        if (workspace?.workspace_id) {
            loadProfile(workspace.workspace_id);
        }
    }, [workspace?.workspace_id]);

    const loadProfile = async (id: string) => {
        setIsFetching(true);
        try {
            const profile = await companyProfileService.getProfile(id);
            // Merge with default to ensure all fields exist
            reset({
                ...DEFAULT_PROFILE,
                ...profile,
                // Ensure nested objects are merged correctly if partial
                address_structured: profile.address_structured || DEFAULT_PROFILE.address_structured,
                socials: profile.socials || DEFAULT_PROFILE.socials,
                company_visibility: { ...DEFAULT_PROFILE.company_visibility, ...profile.company_visibility }
            });
        } catch (error: any) {
            if (error.response?.status === 404) {
                // No profile yet, use defaults
            } else {
                toast.error("Could not fetch company profile details.", {
                    title: "Error loading profile"
                });
            }
        } finally {
            setIsFetching(false);
        }
    };

    const onSubmit = async (data: CreateCompanyProfileRequest) => {
        if (!workspace?.workspace_id) return;
        setIsLoading(true);

        // Sanitize data before submission - removes empty optional fields
        const sanitizedData = sanitizeProfileData(data);

        try {
            try {
                await companyProfileService.createProfile(workspace.workspace_id, sanitizedData);
                toast.success("Company profile has been set up successfully.", { title: "Profile created" });
            } catch (err: any) {
                if (err.response?.status === 409) {
                    await companyProfileService.updateProfile(workspace.workspace_id, sanitizedData);
                    toast.success("Company profile settings saved.", { title: "Profile updated" });
                } else {
                    throw err;
                }
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || "Failed to save changes.", {
                title: "Error saving profile"
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadVCard = () => {
        const slug = watch('slug');
        if (slug) {
            window.open(companyProfileService.getVCardUrl(slug), '_blank');
        }
    };

    const handleDownloadQRCode = () => {
        const slug = watch('slug');
        if (slug) {
            // Fetch blob and download
            const url = companyProfileService.getQrCodeUrl(slug);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${slug}-qr.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    if (isFetching) {
        return <div className="p-8 text-center text-text-secondary">Loading profile settings...</div>;
    }

    // Helper to render visibility toggle
    const renderVisibilityToggle = (field: keyof CompanyVisibilityConfig, label: string) => (
        <Controller
            name={`company_visibility.${field}`}
            control={control}
            render={({ field: { onChange, value } }) => (
                <div className="flex items-center gap-2" title={`Toggle visibility for ${label}`}>
                    <button
                        type="button"
                        onClick={() => onChange(!value)}
                        className={`p-1.5 rounded-md transition-colors ${value ? 'text-primary bg-primary/10' : 'text-text-disabled hover:text-text-secondary'}`}
                    >
                        {value ? <Eye size={16} /> : <EyeOff size={16} />}
                    </button>
                </div>
            )}
        />
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto pb-12">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-text-primary">Company Profile</h2>
                    <p className="text-text-secondary">Manage your public brand presence and contact information.</p>
                </div>
                <div className="flex gap-3">
                    {watch('slug') && (
                        <>
                            <AppButton variant="outline" size="sm" type="button" onClick={handleDownloadVCard} leftIcon={<Download size={14} />}>
                                vCard
                            </AppButton>
                            <AppButton variant="outline" size="sm" type="button" onClick={handleDownloadQRCode} leftIcon={<QrCode size={14} />}>
                                QR Code
                            </AppButton>
                        </>
                    )}
                    <AppButton type="submit" variant="primary" isLoading={isLoading} leftIcon={<Save size={18} />}>
                        Save Changes
                    </AppButton>
                </div>
            </div>

            {/* Main Info */}
            <Card>
                <Card.Header>
                    <Card.Title>Basic Information</Card.Title>
                    <Card.Description>Core identity details visible on your public profile.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Company Name"
                                    {...register('name', { required: "Name is required" })}
                                    error={errors.name?.message}
                                    placeholder="e.g. Acme Photography"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('name', 'Name')}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Tagline"
                                    {...register('tagline')}
                                    placeholder="e.g. Capturing moments that matter"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('tagline', 'Tagline')}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Public Slug"
                                    {...register('slug', {
                                        required: "Slug is required",
                                        pattern: {
                                            value: /^[a-z0-9-]+$/,
                                            message: "Only lowercase letters, numbers, and hyphens allowed"
                                        }
                                    })}
                                    error={errors.slug?.message}
                                    placeholder="e.g. acme-photo"
                                    helperText={`Public URL: lumina.co/p/${watch('slug') || '...'}`}
                                    leftAddon="lumina.co/p/"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Website"
                                    {...register('website')}
                                    placeholder="https://example.com"
                                    leftIcon={<Globe size={16} />}
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('website', 'Website')}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Email Address"
                                    {...register('email', { required: "Email is required" })}
                                    error={errors.email?.message}
                                    placeholder="contact@example.com"
                                    leftIcon={<Mail size={16} />}
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('email', 'Email')}
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Phone Number"
                                    {...register('phone')}
                                    placeholder="+1 (555) 000-0000"
                                    leftIcon={<Phone size={16} />}
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('phone', 'Phone')}
                            </div>
                        </div>
                    </div>
                </Card.Content>
            </Card>

            {/* Address */}
            <Card>
                <Card.Header action={renderVisibilityToggle('address', 'Address')}>
                    <Card.Title>Structured Address</Card.Title>
                    <Card.Description>Physical location for SEO and map integration.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-4">
                    <AppInput label="Address Line 1" {...register('address_structured.line1')} placeholder="123 Main St" />
                    <AppInput label="Address Line 2" {...register('address_structured.line2')} placeholder="Suite 100" />
                    <div className="grid grid-cols-2 gap-4">
                        <AppInput label="City" {...register('address_structured.city')} placeholder="New York" />
                        <AppInput label="State/Province" {...register('address_structured.state')} placeholder="NY" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <AppInput label="Postal Code" {...register('address_structured.postal_code')} placeholder="10001" />
                        <AppInput label="Country" {...register('address_structured.country')} placeholder="USA" />
                    </div>
                </Card.Content>
            </Card>

            {/* Social Media */}
            <Card>
                <Card.Header action={renderVisibilityToggle('socials', 'Social Media')}>
                    <Card.Title>Social Profiles</Card.Title>
                    <Card.Description>Connect your audiences across platforms.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-4">
                    <AppInput
                        label="Instagram"
                        leftIcon={<Instagram size={16} />}
                        {...register('socials.instagram')}
                        placeholder="username or URL"
                    />
                    <AppInput
                        label="Facebook"
                        leftIcon={<Facebook size={16} />}
                        {...register('socials.facebook')}
                        placeholder="username or URL"
                    />
                    <AppInput
                        label="Twitter / X"
                        leftIcon={<Twitter size={16} />}
                        {...register('socials.twitter')}
                        placeholder="username or URL"
                    />
                    <AppInput
                        label="LinkedIn"
                        leftIcon={<Linkedin size={16} />}
                        {...register('socials.linkedin')}
                        placeholder="username or URL"
                    />
                </Card.Content>
            </Card>

            {/* Custom Links */}
            <Card>
                <Card.Header action={renderVisibilityToggle('custom_links', 'Custom Links')}>
                    <Card.Title>Custom Links</Card.Title>
                    <Card.Description>Add extra links like Portfolio, Booking, etc.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-4">
                    {linkFields.map((field, index) => (
                        <div key={field.id} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <AppInput
                                    label={index === 0 ? "Label" : undefined}
                                    placeholder="Link Title (e.g. Portfolio)"
                                    {...register(`custom_links.${index}.label` as const, { required: true })}
                                />
                            </div>
                            <div className="flex-[2]">
                                <AppInput
                                    label={index === 0 ? "URL" : undefined}
                                    placeholder="https://"
                                    leftIcon={<LinkIcon size={14} />}
                                    {...register(`custom_links.${index}.url` as const, { required: true })}
                                />
                            </div>
                            <AppButton
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-error hover:bg-error/10 hover:text-error"
                                onClick={() => remove(index)}
                            >
                                <Trash2 size={18} />
                            </AppButton>
                        </div>
                    ))}

                    <AppButton
                        type="button"
                        variant="outline"
                        size="sm"
                        leftIcon={<Plus size={16} />}
                        onClick={() => append({ label: '', url: '' })}
                    >
                        Add Link
                    </AppButton>
                </Card.Content>
            </Card>

        </form>
    );
};
