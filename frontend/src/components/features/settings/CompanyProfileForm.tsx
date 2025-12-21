import React, { useState, useEffect, useRef, useCallback } from 'react';
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
    Download,
    Upload,
    CheckCircle2,
    XCircle,
    Loader2,
    Camera,
    Pencil,
    X
} from 'lucide-react';

import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { Card } from '../../ui/AppCard';
import { useToastActions } from '../../ui/Toast';
import { AvatarCropModal, CropData } from '../../ui/AvatarCropModal';
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '../../ui/Modal';
import { useAuth } from '../../../contexts/AuthContext';
import { companyProfileService, LogoCropData } from '../../../services/companyProfileService';
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

/**
 * Generates a URL-friendly slug from a company name.
 * - Converts to lowercase
 * - Replaces spaces and special chars with hyphens
 * - Removes consecutive hyphens
 * - Trims hyphens from start/end
 */
const generateSlugFromName = (name: string): string => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-')          // Replace spaces with hyphens
        .replace(/-+/g, '-')           // Remove consecutive hyphens
        .replace(/^-|-$/g, '');        // Trim hyphens from ends
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
        socials_instagram: true,
        socials_facebook: true,
        socials_twitter: true,
        socials_linkedin: true,
        custom_links: true
    }
};

interface CompanyProfileFormProps {
    onProfileChange?: (profile: CreateCompanyProfileRequest & { _previewLogoUrl?: string }) => void;
}

export const CompanyProfileForm: React.FC<CompanyProfileFormProps> = ({ onProfileChange }) => {
    const { workspace } = useAuth();
    const toast = useToastActions();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [profileExists, setProfileExists] = useState(false);

    const { register, control, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<CreateCompanyProfileRequest>({
        defaultValues: DEFAULT_PROFILE
    });

    const { fields: linkFields, append, remove } = useFieldArray({
        control,
        name: "custom_links"
    });

    // Logo upload state
    const [logoBlobUrl, setLogoBlobUrl] = useState<string | null>(null);
    const logoBlobUrlRef = useRef<string | null>(null);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isDraggingLogo, setIsDraggingLogo] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // Crop modal state
    const [cropModalOpen, setCropModalOpen] = useState(false);
    const [imageForCrop, setImageForCrop] = useState<string | null>(null);

    // Slug validation state
    const [slugValidation, setSlugValidation] = useState<{
        status: 'idle' | 'checking' | 'available' | 'taken';
        message?: string;
    }>({ status: 'idle' });
    const slugCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastCheckedSlugRef = useRef<string>('');
    const prevWatchedValuesRef = useRef<string>('');
    // Track the original slug loaded from server (to know if slug changed)
    const originalSlugRef = useRef<string>('');
    // Inline slug editing mode - prevents accidental changes
    const [isEditingSlug, setIsEditingSlug] = useState(false);
    const [tempSlug, setTempSlug] = useState('');
    // Save confirmation modal
    const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
    const [pendingSaveData, setPendingSaveData] = useState<CreateCompanyProfileRequest | null>(null);

    // Watch all form values for live preview
    const watchedValues = watch();

    useEffect(() => {
        if (workspace?.workspace_id) {
            loadProfile(workspace.workspace_id);
        }
    }, [workspace?.workspace_id]);

    // Notify parent of profile changes for live preview
    useEffect(() => {
        if (onProfileChange && !isFetching) {
            // Use JSON comparison to avoid infinite loops from object reference changes
            const valuesJson = JSON.stringify(watchedValues);
            if (valuesJson !== prevWatchedValuesRef.current) {
                prevWatchedValuesRef.current = valuesJson;
                // Include blob URL for live preview - this allows immediate display after upload
                onProfileChange({
                    ...watchedValues,
                    _previewLogoUrl: logoBlobUrl || undefined,
                });
            }
        }
    }, [watchedValues, onProfileChange, isFetching, logoBlobUrl]);

    const loadProfile = async (id: string) => {
        setIsFetching(true);
        try {
            const profile = await companyProfileService.getProfile(id);
            setProfileExists(true); // Profile exists, will use update on save
            originalSlugRef.current = profile.slug || ''; // Store original slug for comparison
            // Merge with default to ensure all fields exist
            reset({
                ...DEFAULT_PROFILE,
                ...profile,
                // Ensure nested objects are merged correctly if partial
                address_structured: profile.address_structured || DEFAULT_PROFILE.address_structured,
                socials: profile.socials || DEFAULT_PROFILE.socials,
                company_visibility: { ...DEFAULT_PROFILE.company_visibility, ...profile.company_visibility }
            });

            // Fetch logo as blob URL if profile has a logo
            // Backend now only returns logo_url if actual logo data exists in company_logo_images
            if (profile.logo_url) {
                const blobUrl = await companyProfileService.getLogoBlobUrl(id, 256);
                if (blobUrl) {
                    // Revoke previous blob URL
                    if (logoBlobUrlRef.current) {
                        URL.revokeObjectURL(logoBlobUrlRef.current);
                    }
                    setLogoBlobUrl(blobUrl);
                    logoBlobUrlRef.current = blobUrl;
                }
            }
        } catch (error: any) {
            if (error.response?.status === 404) {
                // No profile yet, use defaults - will create on save
                setProfileExists(false);
                originalSlugRef.current = ''; // No original slug for new profiles
            } else {
                toast.error("Could not fetch company profile details.", {
                    title: "Error loading profile"
                });
            }
        } finally {
            setIsFetching(false);
        }
    };

    // Sync blob URL ref - we only revoke when replacing with a new URL
    // NOT on unmount, to prevent strict mode issues
    useEffect(() => {
        logoBlobUrlRef.current = logoBlobUrl;
    }, [logoBlobUrl]);

    // Auto-generate slug from company name (only for new profiles)
    const currentName = watch('name');
    useEffect(() => {
        // Only auto-generate if:
        // 1. Profile doesn't exist yet (creating new)
        // 2. Name has a value
        // 3. Slug is empty or was auto-generated (matches generated form of name)
        if (!profileExists && currentName && !isFetching) {
            const generatedSlug = generateSlugFromName(currentName);
            const currentSlugValue = watch('slug');
            // Only update if slug is empty or matches the previously generated pattern
            if (!currentSlugValue || currentSlugValue === generateSlugFromName(currentSlugValue)) {
                setValue('slug', generatedSlug);
            }
        }
    }, [currentName, profileExists, isFetching, setValue, watch]);

    // Logo upload handlers - opens crop modal
    const handleLogoFileSelect = useCallback(async (file: File) => {
        if (!workspace?.workspace_id) return;

        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            toast.error('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
            return;
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Logo must be less than 5MB');
            return;
        }

        // Read file and open crop modal
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageForCrop(e.target?.result as string);
            setCropModalOpen(true);
        };
        reader.readAsDataURL(file);
    }, [workspace?.workspace_id, toast]);

    // Handle crop completion - upload cropped image
    const handleCropComplete = useCallback(async (croppedBlob: Blob, cropData: CropData) => {
        if (!workspace?.workspace_id) return;

        setIsUploadingLogo(true);
        setCropModalOpen(false);

        try {
            // Convert CropData to LogoCropData format
            const logoCropData: LogoCropData = {
                crop_x: cropData.crop_x,
                crop_y: cropData.crop_y,
                crop_scale: cropData.crop_scale,
            };

            // Upload cropped image
            await companyProfileService.uploadCroppedLogo(
                workspace.workspace_id,
                croppedBlob,
                logoCropData
            );
            toast.success('Logo uploaded successfully');

            // Reload profile to get fresh logo blob URL
            await loadProfile(workspace.workspace_id);
        } catch (error: any) {
            toast.error(error.message || 'Failed to upload logo');
        } finally {
            setIsUploadingLogo(false);
            setImageForCrop(null);
        }
    }, [workspace?.workspace_id, toast]);

    // Handle crop modal cancel
    const handleCropCancel = useCallback(() => {
        setCropModalOpen(false);
        setImageForCrop(null);
    }, []);

    const handleLogoDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingLogo(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleLogoFileSelect(file);
        }
    }, [handleLogoFileSelect]);

    const handleLogoInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleLogoFileSelect(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    }, [handleLogoFileSelect]);

    // Slug validation with debounce
    const validateSlug = useCallback(async (slug: string) => {
        if (!workspace?.workspace_id || !slug || slug.length < 3) {
            setSlugValidation({ status: 'idle' });
            return;
        }

        // Don't recheck if same slug
        if (slug === lastCheckedSlugRef.current) return;

        // Clear previous timeout
        if (slugCheckTimeoutRef.current) {
            clearTimeout(slugCheckTimeoutRef.current);
        }

        setSlugValidation({ status: 'checking' });

        // Debounce the API call
        slugCheckTimeoutRef.current = setTimeout(async () => {
            try {
                const result = await companyProfileService.checkSlugAvailability(
                    workspace.workspace_id,
                    slug
                );
                lastCheckedSlugRef.current = slug;
                setSlugValidation({
                    status: result.available ? 'available' : 'taken',
                    message: result.available ? 'Slug is available' : 'This slug is already taken'
                });
            } catch (error) {
                setSlugValidation({ status: 'idle' });
            }
        }, 500);
    }, [workspace?.workspace_id]);

    // Watch slug changes for validation (use tempSlug when editing, otherwise currentSlug)
    const currentSlug = watch('slug');
    const slugToValidate = isEditingSlug ? tempSlug : currentSlug;
    useEffect(() => {
        if (!slugToValidate || slugToValidate.length < 3) {
            setSlugValidation({ status: 'idle' });
            return;
        }

        // If slug matches the original (unchanged), show as available without API call
        if (slugToValidate === originalSlugRef.current) {
            setSlugValidation({ status: 'available', message: 'Current slug' });
            return;
        }

        // Validate format
        if (!/^[a-z0-9-]+$/.test(slugToValidate)) {
            setSlugValidation({ status: 'idle' });
            return;
        }

        // Validate with API for new/changed slugs
        validateSlug(slugToValidate);
    }, [slugToValidate, validateSlug]);

    // Slug inline editing handlers
    const handleStartEditingSlug = useCallback(() => {
        setTempSlug(currentSlug || '');
        setIsEditingSlug(true);
    }, [currentSlug]);

    const handleCancelSlugEdit = useCallback(() => {
        setTempSlug('');
        setIsEditingSlug(false);
        setSlugValidation({ status: 'idle' });
    }, []);

    const handleConfirmSlugEdit = useCallback(() => {
        if (slugValidation.status === 'available' || slugValidation.status === 'idle') {
            setValue('slug', tempSlug);
            originalSlugRef.current = tempSlug; // Update reference so it shows as "current"
            setIsEditingSlug(false);
            setTempSlug('');
        }
    }, [tempSlug, slugValidation.status, setValue]);

    // Note: Logo preview now uses blob URLs fetched in loadProfile()

    // Form submit handler - shows confirmation dialog for existing profiles
    const onSubmit = async (data: CreateCompanyProfileRequest) => {
        if (!workspace?.workspace_id) return;

        // Sanitize data before submission - removes empty optional fields
        const sanitizedData = sanitizeProfileData(data);

        if (profileExists) {
            // Show confirmation dialog before updating existing profile
            setPendingSaveData(sanitizedData);
            setShowSaveConfirmation(true);
        } else {
            // For new profiles, save directly without confirmation
            await performSave(sanitizedData);
        }
    };

    // Actual save function - called after confirmation
    const performSave = async (data: CreateCompanyProfileRequest) => {
        if (!workspace?.workspace_id) return;
        setIsLoading(true);

        try {
            if (profileExists) {
                // Profile already exists, update it directly
                await companyProfileService.updateProfile(workspace.workspace_id, data);
                toast.success("Company profile settings saved.", { title: "Profile updated" });
            } else {
                // No profile yet, create a new one
                await companyProfileService.createProfile(workspace.workspace_id, data);
                setProfileExists(true); // Mark as existing for future saves
                toast.success("Company profile has been set up successfully.", { title: "Profile created" });
            }
            // Update original slug reference after successful save
            // This ensures future saves with the same slug don't trigger validation
            originalSlugRef.current = data.slug;
        } catch (error: any) {
            toast.error(error.response?.data?.error?.message || "Failed to save changes.", {
                title: "Error saving profile"
            });
        } finally {
            setIsLoading(false);
            setShowSaveConfirmation(false);
            setPendingSaveData(null);
        }
    };

    // Confirmation dialog handlers
    const handleConfirmSave = async () => {
        if (pendingSaveData) {
            await performSave(pendingSaveData);
        }
    };

    const handleCancelSave = () => {
        setShowSaveConfirmation(false);
        setPendingSaveData(null);
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

            {/* Logo Upload */}
            <Card>
                <Card.Header action={renderVisibilityToggle('logo_url', 'Logo')}>
                    <Card.Title>Company Logo</Card.Title>
                    <Card.Description>Upload your company logo for public display.</Card.Description>
                </Card.Header>
                <Card.Content>
                    <div className="flex items-start gap-6">
                        {/* Logo Preview */}
                        <div
                            className={`
                                relative w-32 h-32 rounded-lg border-2 border-dashed
                                flex items-center justify-center cursor-pointer
                                transition-all overflow-hidden
                                ${isDraggingLogo ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}
                                ${isUploadingLogo ? 'opacity-50' : ''}
                            `}
                            onClick={() => logoInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                            onDragLeave={() => setIsDraggingLogo(false)}
                            onDrop={handleLogoDrop}
                        >
                            {logoBlobUrl ? (
                                <>
                                    <img
                                        src={logoBlobUrl}
                                        alt="Company logo"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Camera className="w-6 h-6 text-white" />
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-4">
                                    <Upload className="w-8 h-8 mx-auto mb-2 text-text-tertiary" />
                                    <span className="text-xs text-text-tertiary">Drop or click</span>
                                </div>
                            )}
                            {isUploadingLogo && (
                                <div className="absolute inset-0 bg-surface/80 flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                                </div>
                            )}
                        </div>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleLogoInputChange}
                            className="hidden"
                        />
                        <div className="flex-1 text-sm text-text-secondary">
                            <p className="mb-2">Recommended: Square image, at least 512x512 pixels.</p>
                            <p>Supported formats: JPEG, PNG, WebP, GIF (max 5MB)</p>
                        </div>
                    </div>
                </Card.Content>
            </Card>

            {/* Logo Crop Modal */}
            {imageForCrop && (
                <AvatarCropModal
                    imageSrc={imageForCrop}
                    isOpen={cropModalOpen}
                    onCropComplete={handleCropComplete}
                    onCancel={handleCropCancel}
                    isLoading={isUploadingLogo}
                />
            )}

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

                        {/* Public Slug - Inline edit for existing profiles */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-text-primary">Public Slug</label>
                                    {profileExists && !isEditingSlug ? (
                                        // Display mode - show current slug with edit button
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-surface-hover rounded-lg border border-border">
                                                <span className="text-text-secondary text-sm">lumina.co/p/</span>
                                                <span className="text-text-primary font-medium">{currentSlug}</span>
                                            </div>
                                            <AppButton
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleStartEditingSlug}
                                                title="Edit slug"
                                            >
                                                <Pencil size={16} />
                                            </AppButton>
                                        </div>
                                    ) : isEditingSlug ? (
                                        // Edit mode - show input with confirm/cancel
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 relative">
                                                    <AppInput
                                                        value={tempSlug}
                                                        onChange={(e) => setTempSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                        placeholder="e.g. acme-photo"
                                                        leftAddon="lumina.co/p/"
                                                        error={slugValidation.status === 'taken' ? slugValidation.message : undefined}
                                                    />
                                                    {/* Validation indicator */}
                                                    {tempSlug && tempSlug.length >= 3 && (
                                                        <div className="absolute right-3 top-3">
                                                            {slugValidation.status === 'checking' && (
                                                                <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
                                                            )}
                                                            {slugValidation.status === 'available' && (
                                                                <CheckCircle2 className="w-4 h-4 text-success" />
                                                            )}
                                                            {slugValidation.status === 'taken' && (
                                                                <XCircle className="w-4 h-4 text-error" />
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <AppButton
                                                    type="button"
                                                    variant="primary"
                                                    size="icon"
                                                    onClick={handleConfirmSlugEdit}
                                                    disabled={slugValidation.status === 'taken' || slugValidation.status === 'checking' || tempSlug.length < 3}
                                                    title="Confirm"
                                                >
                                                    <CheckCircle2 size={16} />
                                                </AppButton>
                                                <AppButton
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleCancelSlugEdit}
                                                    title="Cancel"
                                                >
                                                    <X size={16} />
                                                </AppButton>
                                            </div>
                                            <p className="text-xs text-text-tertiary">
                                                Only lowercase letters, numbers, and hyphens allowed. Min 3 characters.
                                            </p>
                                        </div>
                                    ) : (
                                        // Create mode - show regular input
                                        <div className="relative">
                                            <AppInput
                                                {...register('slug', {
                                                    required: "Slug is required",
                                                    pattern: {
                                                        value: /^[a-z0-9-]+$/,
                                                        message: "Only lowercase letters, numbers, and hyphens allowed"
                                                    },
                                                    minLength: { value: 3, message: "Slug must be at least 3 characters" }
                                                })}
                                                error={errors.slug?.message || (slugValidation.status === 'taken' ? slugValidation.message : undefined)}
                                                placeholder="e.g. acme-photo"
                                                helperText={`Public URL: lumina.co/p/${watch('slug') || '...'}`}
                                                leftAddon="lumina.co/p/"
                                            />
                                            {/* Slug validation indicator */}
                                            {currentSlug && currentSlug.length >= 3 && (
                                                <div className="absolute right-3 top-3">
                                                    {slugValidation.status === 'checking' && (
                                                        <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" />
                                                    )}
                                                    {slugValidation.status === 'available' && (
                                                        <CheckCircle2 className="w-4 h-4 text-success" />
                                                    )}
                                                    {slugValidation.status === 'taken' && (
                                                        <XCircle className="w-4 h-4 text-error" />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
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
                <Card.Header>
                    <Card.Title>Social Profiles</Card.Title>
                    <Card.Description>Connect your audiences across platforms.</Card.Description>
                </Card.Header>
                <Card.Content className="space-y-4">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <AppInput
                                label="Instagram"
                                leftIcon={<Instagram size={16} />}
                                {...register('socials.instagram')}
                                placeholder="username or URL"
                            />
                        </div>
                        <div className="mt-8">
                            {renderVisibilityToggle('socials_instagram', 'Instagram')}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <AppInput
                                label="Facebook"
                                leftIcon={<Facebook size={16} />}
                                {...register('socials.facebook')}
                                placeholder="username or URL"
                            />
                        </div>
                        <div className="mt-8">
                            {renderVisibilityToggle('socials_facebook', 'Facebook')}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <AppInput
                                label="Twitter / X"
                                leftIcon={<Twitter size={16} />}
                                {...register('socials.twitter')}
                                placeholder="username or URL"
                            />
                        </div>
                        <div className="mt-8">
                            {renderVisibilityToggle('socials_twitter', 'Twitter/X')}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <AppInput
                                label="LinkedIn"
                                leftIcon={<Linkedin size={16} />}
                                {...register('socials.linkedin')}
                                placeholder="username or URL"
                            />
                        </div>
                        <div className="mt-8">
                            {renderVisibilityToggle('socials_linkedin', 'LinkedIn')}
                        </div>
                    </div>
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

            {/* Save Confirmation Modal */}
            <Modal
                isOpen={showSaveConfirmation}
                onClose={handleCancelSave}
                size="sm"
            >
                <ModalHeader bordered={false}>
                    <ModalTitle>Confirm Changes</ModalTitle>
                </ModalHeader>
                <ModalBody padding="md">
                    <p className="text-text-secondary">
                        Are you sure you want to save these changes to your company profile?
                        This will update your public profile information.
                    </p>
                </ModalBody>
                <ModalFooter bordered>
                    <AppButton
                        variant="secondary"
                        onClick={handleCancelSave}
                        disabled={isLoading}
                    >
                        Cancel
                    </AppButton>
                    <AppButton
                        variant="primary"
                        onClick={handleConfirmSave}
                        isLoading={isLoading}
                    >
                        Save Changes
                    </AppButton>
                </ModalFooter>
            </Modal>

        </form>
    );
};
