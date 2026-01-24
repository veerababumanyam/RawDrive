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
    Youtube,
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
    X,
    Copy,
    Palette,
    MapPin,
    Navigation,
    Music2,
    Paintbrush,
    Dribbble,
    ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { AppInput } from '../../ui/AppInput';
import { AppButton } from '../../ui/AppButton';
import { Card } from '../../ui/AppCard';
import { useToastActions } from '../../ui/Toast';
import { AvatarEditorModal } from '../../ui/AvatarEditor';
import type { CropData } from '../../ui/AvatarEditor/types';
import { Modal, ModalHeader, ModalTitle, ModalBody, ModalFooter } from '../../ui/Modal';
import { useAuth } from '../../../contexts/AuthContext';
import { companyProfileService, LogoCropData } from '../../../services/companyProfileService';
import { CreateCompanyProfileRequest, CompanyVisibilityConfig } from '../../../types/companyProfile';
import { useWorkspacePrivacySettings } from '../../../hooks/useWorkspaceSettings';
import { ProfileStatusBar } from '../../profile/ProfileStatusBar';
import { ThemeSelector } from './ThemeSelector';
import { ThemeCustomization } from './ThemeCustomization';
import { UndoRedoControls } from './UndoRedoControls';
import { useThemeUndoRedo } from '../../../hooks/useThemeUndoRedo';
import { themeService } from '../../../services/themeService';
import type { Theme, ThemeCustomization as ThemeCustomizationType } from '../../../types/profileEditor';
import { validateCoordinates } from '../../../utils/themeTransformer';
import { VisibilityToggle } from '../../settings/VisibilityToggle';

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
        const hasCoordinates = addr.latitude !== undefined && addr.longitude !== undefined;
        if (!hasAddressData && !hasCoordinates) {
            sanitized.address_structured = undefined;
        } else if (sanitized.address_structured) {
            // Remove empty/invalid coordinate values
            if (addr.latitude === undefined || addr.latitude === null || isNaN(addr.latitude)) {
                delete sanitized.address_structured.latitude;
            }
            if (addr.longitude === undefined || addr.longitude === null || isNaN(addr.longitude)) {
                delete sanitized.address_structured.longitude;
            }
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

    // Filter out empty secondary contacts
    if (sanitized.secondary_emails) {
        sanitized.secondary_emails = sanitized.secondary_emails.filter(
            contact => contact.value?.trim()
        );
        if (sanitized.secondary_emails.length === 0) {
            sanitized.secondary_emails = undefined;
        }
    }

    if (sanitized.secondary_phones) {
        sanitized.secondary_phones = sanitized.secondary_phones.filter(
            contact => contact.value?.trim()
        );
        if (sanitized.secondary_phones.length === 0) {
            sanitized.secondary_phones = undefined;
        }
    }

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

// Get the public URL prefix from the service
const PUBLIC_URL_PREFIX = companyProfileService.getPublicUrlPrefix();

const DEFAULT_PROFILE: CreateCompanyProfileRequest = {
    name: '',
    slug: '',
    email: '',
    logo_url: '',
    tagline: '',
    phone: '',
    website: '',
    secondary_emails: [],
    secondary_phones: [],
    address_structured: {
        line1: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
        latitude: undefined,
        longitude: undefined,
    },
    socials: {
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: '',
        youtube: '',
        tiktok: '',
        whatsapp: '',
        pinterest: '',
        behance: '',
        dribbble: '',
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
        socials_youtube: true,
        socials_tiktok: true,
        socials_whatsapp: true,
        socials_pinterest: true,
        socials_behance: true,
        socials_dribbble: true,
        custom_links: true,
        secondary_email_1: true,
        secondary_email_2: true,
        secondary_phone_1: true,
        secondary_phone_2: true,
        qr_code: true,
        vcard: true
    },
    brand_color: '#3B82F6',
    brand_font: 'Inter'
};

// Extended type for profile change callback including theme data
export interface ProfileFormChangeData extends CreateCompanyProfileRequest {
    _previewLogoUrl?: string;
    _theme?: Theme | null;
    _themeCustomization?: Partial<ThemeCustomizationType> | null;
}

interface CompanyProfileFormProps {
    onProfileChange?: (profile: ProfileFormChangeData) => void;
}

/**
 * CollapsibleSection Component
 * Reusable collapsible section with expand/collapse functionality
 */
const CollapsibleSection: React.FC<{
    title: string;
    description?: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}> = ({ title, description, children, defaultOpen = false, icon, action }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <Card variant="glass" className="overflow-hidden">
            <div
                className="flex flex-col sm:flex-row sm:items-center justify-between"
                style={{ position: 'relative' }}
            >
                <div
                    className="flex-1 px-5 py-4 cursor-pointer hover:bg-surface-hover/30 transition-colors"
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className="flex items-center gap-3">
                        {icon && <div className="text-primary flex-shrink-0">{icon}</div>}
                        <div className="min-w-0">
                            <Card.Title className="truncate">{title}</Card.Title>
                            {description && <Card.Description className="truncate">{description}</Card.Description>}
                        </div>
                    </div>
                </div>
                {action && (
                    <div className="flex items-center gap-3 px-5 py-3 sm:py-0 border-t sm:border-t-0 border-border/50">
                        <div className="">{action}</div>
                        <button
                            type="button"
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 hover:bg-surface-hover rounded-lg transition-colors text-text-tertiary"
                            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
                        >
                            <ChevronDown
                                size={20}
                                className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </div>
                )}
                {!action && (
                    <div className="px-5 py-3 sm:py-0">
                        <button
                            type="button"
                            onClick={() => setIsOpen(!isOpen)}
                            className="p-2 hover:bg-surface-hover rounded-lg transition-colors text-text-tertiary"
                            aria-label={isOpen ? 'Collapse section' : 'Expand section'}
                        >
                            <ChevronDown
                                size={20}
                                className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                            />
                        </button>
                    </div>
                )}
            </div>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                    >
                        <div className="border-t border-border">
                            <Card.Content>
                                {children}
                            </Card.Content>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
};

export const CompanyProfileForm: React.FC<CompanyProfileFormProps> = ({ onProfileChange }) => {
    const { workspace } = useAuth();
    const toast = useToastActions();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [profileExists, setProfileExists] = useState(false);
    const [updatingVisibility, setUpdatingVisibility] = useState(false);

    // Workspace privacy settings for public profile visibility
    const { settings: privacySettings, update: updatePrivacy } = useWorkspacePrivacySettings(workspace?.workspace_id || '');

    const { register, control, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<CreateCompanyProfileRequest>({
        defaultValues: DEFAULT_PROFILE
    });

    const { fields: linkFields, append: appendLink, remove: removeLink } = useFieldArray({
        control,
        name: "custom_links"
    });

    // Secondary contacts field arrays
    const {
        fields: secondaryEmailFields,
        append: appendSecondaryEmail,
        remove: removeSecondaryEmail
    } = useFieldArray({
        control,
        name: "secondary_emails"
    });

    const {
        fields: secondaryPhoneFields,
        append: appendSecondaryPhone,
        remove: removeSecondaryPhone
    } = useFieldArray({
        control,
        name: "secondary_phones"
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

    // Pending logo state (for profile creation - logo selected before profile exists)
    const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
    const [pendingLogoCropData, setPendingLogoCropData] = useState<CropData | null>(null);

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

    // Theme state
    const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
    const [themeCustomization, setThemeCustomization] = useState<Partial<ThemeCustomizationType> | null>(null);
    const [copiedUrl, setCopiedUrl] = useState(false);

    // Theme undo/redo hook
    const themeUndoRedo = useThemeUndoRedo(themeCustomization, {
        onChange: (newCustomization) => {
            // Auto-save theme customization
            if (newCustomization) {
                setThemeCustomization(newCustomization);
            }
        },
        autoSaveDebounce: 1500,
    });

    // Watch all form values for live preview
    const watchedValues = watch();

    useEffect(() => {
        if (workspace?.workspace_id) {
            loadProfile(workspace.workspace_id);
        }
    }, [workspace?.workspace_id]);

    // Notify parent of profile changes for live preview
    // Use themeUndoRedo.state for immediate preview updates (not debounced themeCustomization)
    const currentThemeState = themeUndoRedo.state;
    useEffect(() => {
        if (onProfileChange && !isFetching) {
            // Use JSON comparison to avoid infinite loops from object reference changes
            // Include theme data in comparison - use currentThemeState for live preview
            const dataToCompare = {
                ...watchedValues,
                _theme: selectedTheme?.theme_id,
                _themeCustomization: currentThemeState,
            };
            const valuesJson = JSON.stringify(dataToCompare);
            if (valuesJson !== prevWatchedValuesRef.current) {
                prevWatchedValuesRef.current = valuesJson;
                // Include blob URL and theme data for live preview
                // Use currentThemeState (immediate) instead of themeCustomization (debounced)
                onProfileChange({
                    ...watchedValues,
                    _previewLogoUrl: logoBlobUrl || undefined,
                    _theme: selectedTheme,
                    _themeCustomization: currentThemeState,
                });
            }
        }
    }, [watchedValues, onProfileChange, isFetching, logoBlobUrl, selectedTheme, currentThemeState]);

    // Sync brand_color form field with theme primary color
    useEffect(() => {
        const primaryColor = themeUndoRedo.state?.custom_colors?.primary;
        if (primaryColor && !isFetching) {
            setValue('brand_color', primaryColor);
        }
    }, [themeUndoRedo.state?.custom_colors?.primary, isFetching, setValue]);

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

    // Handle logo save from editor modal
    const handleLogoSave = useCallback(async (file: File, cropData?: CropData) => {
        if (!workspace?.workspace_id) return;

        setCropModalOpen(false);

        // If profile doesn't exist yet, store logo as pending (will upload after profile creation)
        if (!profileExists) {
            // Store pending logo for upload after profile creation
            setPendingLogoFile(file);
            setPendingLogoCropData(cropData || null);

            // Create preview URL for immediate display
            const previewUrl = URL.createObjectURL(file);
            if (logoBlobUrlRef.current) {
                URL.revokeObjectURL(logoBlobUrlRef.current);
            }
            logoBlobUrlRef.current = previewUrl;
            setLogoBlobUrl(previewUrl);

            toast.success('Logo will be uploaded when you save the profile', {
                title: 'Logo ready'
            });
            setImageForCrop(null);
            return;
        }

        // Profile exists - upload immediately
        setIsUploadingLogo(true);

        try {
            // Convert CropData to LogoCropData format
            const logoCropData: LogoCropData | undefined = cropData ? {
                crop_x: cropData.crop_x,
                crop_y: cropData.crop_y,
                crop_scale: cropData.crop_scale,
            } : undefined;

            // Upload cropped image (file is already the cropped result)
            await companyProfileService.uploadCroppedLogo(
                workspace.workspace_id,
                file,
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
    }, [workspace?.workspace_id, profileExists, toast]);

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
            let profileId: string | undefined;

            if (profileExists) {
                // Profile already exists, update it directly
                const result = await companyProfileService.updateProfile(workspace.workspace_id, data);
                profileId = result?.profile_id;
                toast.success("Company profile settings saved.", { title: "Profile updated" });
            } else {
                // No profile yet, create a new one
                const result = await companyProfileService.createProfile(workspace.workspace_id, data);
                profileId = result?.profile_id;
                setProfileExists(true); // Mark as existing for future saves

                // Upload pending logo if one was selected during profile creation
                if (pendingLogoFile) {
                    try {
                        const logoCropData: LogoCropData | undefined = pendingLogoCropData ? {
                            crop_x: pendingLogoCropData.crop_x,
                            crop_y: pendingLogoCropData.crop_y,
                            crop_scale: pendingLogoCropData.crop_scale,
                        } : undefined;

                        await companyProfileService.uploadCroppedLogo(
                            workspace.workspace_id,
                            pendingLogoFile,
                            logoCropData
                        );
                        // Clear pending logo state
                        setPendingLogoFile(null);
                        setPendingLogoCropData(null);
                    } catch (logoError) {
                        console.error('Failed to upload logo:', logoError);
                        toast.error("Logo upload failed. You can try again after saving.", { title: "Warning" });
                    }
                }

                toast.success("Company profile has been set up successfully.", { title: "Profile created" });
            }

            // Save theme selection if a theme is selected
            if (selectedTheme && profileId) {
                try {
                    await themeService.saveThemeSelection(
                        workspace.workspace_id,
                        profileId,
                        selectedTheme.theme_id,
                        themeCustomization || undefined
                    );
                } catch (themeError) {
                    console.error('Failed to save theme selection:', themeError);
                    // Don't fail the whole save if theme save fails
                    toast.error("Theme changes may not have been saved.", { title: "Warning" });
                }
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

    // Copy public URL to clipboard
    const handleCopyPublicUrl = useCallback(async () => {
        const slug = watch('slug');
        if (slug) {
            const publicUrl = `${PUBLIC_URL_PREFIX}${slug}`;
            try {
                await navigator.clipboard.writeText(publicUrl);
                setCopiedUrl(true);
                toast.success('Public URL copied to clipboard!');
                setTimeout(() => setCopiedUrl(false), 2000);
            } catch {
                toast.error('Failed to copy URL');
            }
        }
    }, [watch, toast]);

    // Handle theme selection
    const handleThemeSelect = useCallback((theme: Theme) => {
        setSelectedTheme(theme);
        // Initialize customization from theme defaults
        setThemeCustomization({
            theme_id: theme.theme_id,
            custom_colors: theme.base_colors,
            custom_typography: theme.default_typography,
            custom_layout: theme.layout_config,
            is_preset: false,
        });
        // Sync brand color with theme primary color
        setValue('brand_color', theme.base_colors.primary);
    }, [setValue]);

    // Handle theme customization changes
    const handleThemeCustomizationChange = useCallback((changes: Partial<ThemeCustomizationType>) => {
        themeUndoRedo.update(changes);
    }, [themeUndoRedo]);

    // Reset theme to defaults
    const handleThemeReset = useCallback(() => {
        if (selectedTheme) {
            setThemeCustomization({
                theme_id: selectedTheme.theme_id,
                custom_colors: selectedTheme.base_colors,
                custom_typography: selectedTheme.default_typography,
                custom_layout: selectedTheme.layout_config,
                is_preset: false,
            });
            themeUndoRedo.reset();
        }
    }, [selectedTheme, themeUndoRedo]);

    // Early return AFTER all hooks have been called
    if (isFetching) {
        return <div className="p-8 text-center text-text-secondary">Loading profile settings...</div>;
    }

    // Helper to render visibility toggle
    const renderVisibilityToggle = (field: keyof CompanyVisibilityConfig, label: string) => (
        <Controller
            name={`company_visibility.${field}`}
            control={control}
            render={({ field: { onChange, value } }) => (
                <VisibilityToggle
                    isVisible={!!value}
                    onChange={onChange}
                    label={label}
                />
            )}
        />
    );

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-4xl mx-auto pb-12">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold text-text-primary">Company Profile</h2>
                        <ProfileStatusBar
                            companyProfile={watchedValues}
                            section="company"
                        />
                    </div>
                    <p className="text-text-secondary mt-1">Manage your public brand presence and contact information.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    {watch('slug') && (
                        <>
                            {/* Public URL with Copy */}
                            <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5 bg-surface-alt/50">
                                <Globe size={14} className="text-text-tertiary flex-shrink-0" />
                                <span className="text-sm text-text-secondary truncate max-w-[200px]">
                                    {PUBLIC_URL_PREFIX}{watch('slug')}
                                </span>
                                <AppButton
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={handleCopyPublicUrl}
                                    leftIcon={copiedUrl ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />}
                                    className="ml-1"
                                    title="Copy public URL"
                                >
                                    {copiedUrl ? 'Copied' : 'Copy'}
                                </AppButton>
                            </div>
                            <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1">
                                <AppButton variant="ghost" size="sm" type="button" onClick={handleDownloadVCard} leftIcon={<Download size={14} />}>
                                    vCard
                                </AppButton>
                                {renderVisibilityToggle('vcard', 'vCard on public page')}
                            </div>
                            <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1">
                                <AppButton variant="ghost" size="sm" type="button" onClick={handleDownloadQRCode} leftIcon={<QrCode size={14} />}>
                                    QR
                                </AppButton>
                                {renderVisibilityToggle('qr_code', 'QR Code on public page')}
                            </div>
                        </>
                    )}
                    <AppButton type="submit" variant="primary" isLoading={isLoading} leftIcon={<Save size={18} />}>
                        Save Changes
                    </AppButton>
                </div>
            </div>

            {/* Public Profile Visibility Toggle */}
            {workspace?.workspace_id && (
                <div className="glass-card p-4 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-start gap-3 flex-1">
                            <Eye className="w-5 h-5 text-text-tertiary mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="font-medium text-text-primary">Public Profile Visibility</div>
                                <div className="text-sm text-text-secondary mt-0.5">
                                    Make the company profile visible to the public. When enabled, your profile will be accessible at the public URL.
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={!!privacySettings?.public_profile_enabled}
                            aria-label={privacySettings?.public_profile_enabled ? 'Disable public profile visibility' : 'Enable public profile visibility'}
                            onClick={async () => {
                                if (!privacySettings || updatingVisibility) return;
                                setUpdatingVisibility(true);
                                try {
                                    await updatePrivacy({ public_profile_enabled: !privacySettings.public_profile_enabled });
                                } catch (err) {
                                    toast.error('Failed to update public profile visibility');
                                } finally {
                                    setUpdatingVisibility(false);
                                }
                            }}
                            disabled={updatingVisibility || !privacySettings}
                            className={`
                                group
                                relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
                                border-2 border-transparent transition-colors duration-200 ease-in-out
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2
                                disabled:cursor-not-allowed disabled:opacity-50
                                bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500
                                aria-checked:bg-green-500 aria-checked:hover:bg-green-600
                            `}
                            title={privacySettings?.public_profile_enabled ? 'Enabled' : 'Disabled'}
                        >
                            <span
                                className={`
                                    pointer-events-none inline-block h-5 w-5 transform rounded-full
                                    bg-white shadow ring-0 transition duration-200 ease-in-out
                                    translate-x-0 group-aria-checked:translate-x-5
                                `}
                            />
                        </button>
                    </div>
                </div>
            )}

            {/* Logo & QR Code */}
            <CollapsibleSection
                title="Company Logo & QR Code"
                description="Your logo and QR code for easy sharing."
                icon={<Camera size={20} />}
                action={renderVisibilityToggle('logo_url', 'Logo')}
                defaultOpen={true}
            >
                <div className="flex flex-wrap items-start gap-6">
                    {/* Logo Preview */}
                    <div className="flex flex-col items-center gap-2">
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
                        <span className="text-xs text-text-tertiary">Logo</span>
                    </div>

                    {/* QR Code Preview */}
                    {watch('slug') && (
                        <div className="flex flex-col items-center gap-2">
                            <div className="relative w-32 h-32 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden">
                                <img
                                    src={companyProfileService.getQrCodeUrl(watch('slug'))}
                                    alt="Profile QR Code"
                                    className="w-28 h-28 object-contain"
                                />
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-text-tertiary">QR Code</span>
                                {renderVisibilityToggle('qr_code', 'QR Code')}
                            </div>
                            <AppButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleDownloadQRCode}
                                leftIcon={<Download size={12} />}
                                className="text-xs"
                            >
                                Download
                            </AppButton>
                        </div>
                    )}

                    {/* Instructions */}
                    <div className="flex-1 min-w-[200px] text-sm text-text-secondary space-y-3">
                        <div>
                            <p className="font-medium text-text-primary mb-1">Logo</p>
                            <p>Recommended: Square, at least 512x512px</p>
                            <p className="text-xs text-text-tertiary">JPEG, PNG, WebP, GIF (max 5MB)</p>
                        </div>
                        {watch('slug') && (
                            <div>
                                <p className="font-medium text-text-primary mb-1">QR Code</p>
                                <p>Scan to visit your public profile</p>
                                <p className="text-xs text-text-tertiary">Toggle visibility for public page</p>
                            </div>
                        )}
                    </div>
                </div>
            </CollapsibleSection>

            {/* Logo Editor Modal */}
            {
                imageForCrop && (
                    <AvatarEditorModal
                        imageSrc={imageForCrop}
                        isOpen={cropModalOpen}
                        onSave={handleLogoSave}
                        onCancel={handleCropCancel}
                        isLoading={isUploadingLogo}
                        title="Edit Logo"
                    />
                )
            }

            {/* Basic Information */}
            <CollapsibleSection
                title="Basic Information"
                description="Core identity details visible on your public profile."
                icon={<Globe size={20} />}
                defaultOpen={true}
            >
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Company Name"
                                    {...register('name', { required: "Name is required" })}
                                    error={errors.name?.message}
                                    placeholder="e.g. Acme Photography"
                                    variant="glass"
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
                                    variant="glass"
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
                                    <label className="text-sm font-medium text-text-primary" id="slug-label">
                                        Public Slug
                                    </label>
                                    {profileExists && !isEditingSlug ? (
                                        // Display mode - show current slug with edit button
                                        <div className="flex items-center gap-2 min-h-[48px]">
                                            <div
                                                className="flex-1 flex items-center gap-2 px-4 py-3 bg-white/5 rounded-lg border border-white/10 min-h-[48px]"
                                                aria-labelledby="slug-label"
                                            >
                                                <span className="text-text-secondary text-sm">{PUBLIC_URL_PREFIX}</span>
                                                <span className="text-text-primary font-medium">{currentSlug}</span>
                                            </div>
                                            <AppButton
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleCopyPublicUrl}
                                                title="Copy public URL to clipboard"
                                                aria-label="Copy public URL"
                                            >
                                                {copiedUrl ? <CheckCircle2 size={16} className="text-success" /> : <Copy size={16} />}
                                            </AppButton>
                                            <AppButton
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={handleStartEditingSlug}
                                                title="Edit your public URL slug. Changing this will change your public profile URL."
                                                aria-label="Edit public slug"
                                            >
                                                <Pencil size={16} />
                                            </AppButton>
                                        </div>
                                    ) : isEditingSlug ? (
                                        // Edit mode - show input with confirm/cancel
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 min-h-[48px]">
                                                <div className="flex-1 relative">
                                                    <AppInput
                                                        value={tempSlug}
                                                        onChange={(e) => setTempSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                        placeholder="e.g. acme-photo"
                                                        leftAddon={PUBLIC_URL_PREFIX}
                                                        error={slugValidation.status === 'taken' ? slugValidation.message : undefined}
                                                        aria-labelledby="slug-label"
                                                        aria-describedby="slug-requirements"
                                                        variant="glass"
                                                    />
                                                    {/* Validation indicator */}
                                                    {tempSlug && tempSlug.length >= 3 && (
                                                        <div className="absolute right-3 top-3" role="status" aria-live="polite">
                                                            {slugValidation.status === 'checking' && (
                                                                <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" aria-label="Checking availability" />
                                                            )}
                                                            {slugValidation.status === 'available' && (
                                                                <CheckCircle2 className="w-4 h-4 text-success" aria-label="Slug is available" />
                                                            )}
                                                            {slugValidation.status === 'taken' && (
                                                                <XCircle className="w-4 h-4 text-error" aria-label="Slug is already taken" />
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
                                                    title="Confirm slug change"
                                                    aria-label="Confirm slug change"
                                                >
                                                    <CheckCircle2 size={16} />
                                                </AppButton>
                                                <AppButton
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleCancelSlugEdit}
                                                    title="Cancel editing"
                                                    aria-label="Cancel editing"
                                                >
                                                    <X size={16} />
                                                </AppButton>
                                            </div>
                                            <p id="slug-requirements" className="text-xs text-text-tertiary">
                                                Only lowercase letters, numbers, and hyphens allowed. Minimum 3 characters.
                                            </p>
                                        </div>
                                    ) : (
                                        // Create mode - show regular input with min height for consistency
                                        <div className="relative min-h-[48px]">
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
                                                helperText={`Your public profile will be at: ${PUBLIC_URL_PREFIX}${watch('slug') || '...'}`}
                                                leftAddon={PUBLIC_URL_PREFIX}
                                                aria-labelledby="slug-label"
                                                aria-describedby="slug-helper"
                                                variant="glass"
                                            />
                                            {/* Slug validation indicator */}
                                            {currentSlug && currentSlug.length >= 3 && (
                                                <div className="absolute right-3 top-3" role="status" aria-live="polite">
                                                    {slugValidation.status === 'checking' && (
                                                        <Loader2 className="w-4 h-4 animate-spin text-text-tertiary" aria-label="Checking availability" />
                                                    )}
                                                    {slugValidation.status === 'available' && (
                                                        <CheckCircle2 className="w-4 h-4 text-success" aria-label="Slug is available" />
                                                    )}
                                                    {slugValidation.status === 'taken' && (
                                                        <XCircle className="w-4 h-4 text-error" aria-label="Slug is already taken" />
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
                                    variant="glass"
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
                                    variant="glass"
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
                                    variant="glass"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('phone', 'Phone')}
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* Secondary Contacts */}
            <CollapsibleSection
                title="Secondary Contacts"
                description="Additional email addresses and phone numbers (up to 2 each)."
                icon={<Mail size={20} />}
                defaultOpen={false}
            >
                <div className="space-y-6">
                    {/* Secondary Emails */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-text-primary">Secondary Emails</h4>
                            {secondaryEmailFields.length < 2 && (
                                <AppButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<Plus size={14} />}
                                    onClick={() => appendSecondaryEmail({ value: '', label: '' })}
                                >
                                    Add Email
                                </AppButton>
                            )}
                        </div>
                        {secondaryEmailFields.length === 0 ? (
                            <p className="text-sm text-text-tertiary italic">No secondary emails added.</p>
                        ) : (
                            secondaryEmailFields.map((field, index) => (
                                <div key={field.id} className="flex gap-3 items-end">
                                    <div className="w-40">
                                        <AppInput
                                            label={index === 0 ? "Label" : undefined}
                                            placeholder="e.g. Support"
                                            {...register(`secondary_emails.${index}.label` as const)}
                                            variant="glass"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <AppInput
                                            label={index === 0 ? "Email Address" : undefined}
                                            placeholder="support@example.com"
                                            leftIcon={<Mail size={14} />}
                                            {...register(`secondary_emails.${index}.value` as const, {
                                                pattern: {
                                                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                                    message: "Invalid email format"
                                                }
                                            })}
                                            error={errors.secondary_emails?.[index]?.value?.message}
                                            variant="glass"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {renderVisibilityToggle(
                                            `secondary_email_${index + 1}` as keyof CompanyVisibilityConfig,
                                            `Secondary Email ${index + 1}`
                                        )}
                                        <AppButton
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-error hover:bg-error/10 hover:text-error"
                                            onClick={() => removeSecondaryEmail(index)}
                                            title="Remove email"
                                        >
                                            <Trash2 size={16} />
                                        </AppButton>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border" />

                    {/* Secondary Phones */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium text-text-primary">Secondary Phones</h4>
                            {secondaryPhoneFields.length < 2 && (
                                <AppButton
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    leftIcon={<Plus size={14} />}
                                    onClick={() => appendSecondaryPhone({ value: '', label: '' })}
                                >
                                    Add Phone
                                </AppButton>
                            )}
                        </div>
                        {secondaryPhoneFields.length === 0 ? (
                            <p className="text-sm text-text-tertiary italic">No secondary phones added.</p>
                        ) : (
                            secondaryPhoneFields.map((field, index) => (
                                <div key={field.id} className="flex gap-3 items-end">
                                    <div className="w-40">
                                        <AppInput
                                            label={index === 0 ? "Label" : undefined}
                                            placeholder="e.g. Mobile"
                                            {...register(`secondary_phones.${index}.label` as const)}
                                            variant="glass"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <AppInput
                                            label={index === 0 ? "Phone Number" : undefined}
                                            placeholder="+1 (555) 000-0000"
                                            leftIcon={<Phone size={14} />}
                                            {...register(`secondary_phones.${index}.value` as const)}
                                            variant="glass"
                                        />
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {renderVisibilityToggle(
                                            `secondary_phone_${index + 1}` as keyof CompanyVisibilityConfig,
                                            `Secondary Phone ${index + 1}`
                                        )}
                                        <AppButton
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="text-error hover:bg-error/10 hover:text-error"
                                            onClick={() => removeSecondaryPhone(index)}
                                            title="Remove phone"
                                        >
                                            <Trash2 size={16} />
                                        </AppButton>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </CollapsibleSection>

            {/* Address */}
            <CollapsibleSection
                title="Structured Address"
                description="Physical location for SEO and map integration."
                icon={<MapPin size={20} />}
                action={renderVisibilityToggle('address', 'Address')}
                defaultOpen={false}
            >
                <div className="space-y-4">
                    <AppInput label="Address Line 1" {...register('address_structured.line1')} placeholder="123 Main St" variant="glass" />
                    <AppInput label="Address Line 2" {...register('address_structured.line2')} placeholder="Suite 100" variant="glass" />
                    <div className="grid grid-cols-2 gap-4">
                        <AppInput label="City" {...register('address_structured.city')} placeholder="New York" variant="glass" />
                        <AppInput label="State/Province" {...register('address_structured.state')} placeholder="NY" variant="glass" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <AppInput label="Postal Code" {...register('address_structured.postal_code')} placeholder="10001" variant="glass" />
                        <AppInput label="Country" {...register('address_structured.country')} placeholder="USA" variant="glass" />
                    </div>

                    {/* GPS Coordinates Section */}
                    <div className="border-t border-border pt-4 mt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <MapPin size={16} className="text-text-secondary" />
                            <h4 className="text-sm font-medium text-text-primary">GPS Coordinates</h4>
                            <span className="text-xs text-text-tertiary">(optional)</span>
                        </div>
                        <p className="text-xs text-text-tertiary mb-3">
                            For precise map navigation. Coordinates take priority over text address when visitors click your location.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <Controller
                                name="address_structured.latitude"
                                control={control}
                                rules={{
                                    validate: (value) => {
                                        if (value === undefined || value === null) return true;
                                        const num = typeof value === 'string' ? parseFloat(value) : value;
                                        if (isNaN(num)) return 'Invalid number';
                                        const result = validateCoordinates(num, undefined);
                                        return result.valid || result.errors[0];
                                    }
                                }}
                                render={({ field: { onChange, value, ...rest }, fieldState: { error } }) => (
                                    <AppInput
                                        label="Latitude"
                                        variant="glass"
                                        placeholder="e.g. 40.7128"
                                        leftIcon={<Navigation size={14} />}
                                        helperText="-90 to 90"
                                        error={error?.message}
                                        value={value ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                onChange(undefined);
                                            } else {
                                                const num = parseFloat(val);
                                                onChange(isNaN(num) ? val : num);
                                            }
                                        }}
                                        {...rest}
                                    />
                                )}
                            />
                            <Controller
                                name="address_structured.longitude"
                                control={control}
                                rules={{
                                    validate: (value) => {
                                        if (value === undefined || value === null) return true;
                                        const num = typeof value === 'string' ? parseFloat(value) : value;
                                        if (isNaN(num)) return 'Invalid number';
                                        const result = validateCoordinates(undefined, num);
                                        return result.valid || result.errors[0];
                                    }
                                }}
                                render={({ field: { onChange, value, ...rest }, fieldState: { error } }) => (
                                    <AppInput
                                        label="Longitude"
                                        variant="glass"
                                        placeholder="e.g. -74.0060"
                                        leftIcon={<Navigation size={14} className="rotate-90" />}
                                        helperText="-180 to 180"
                                        error={error?.message}
                                        value={value ?? ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === '') {
                                                onChange(undefined);
                                            } else {
                                                const num = parseFloat(val);
                                                onChange(isNaN(num) ? val : num);
                                            }
                                        }}
                                        {...rest}
                                    />
                                )}
                            />
                        </div>
                        <AppButton
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-2"
                            leftIcon={<Navigation size={14} />}
                            onClick={async () => {
                                if (!navigator.geolocation) {
                                    toast.error('Geolocation is not supported by your browser');
                                    return;
                                }
                                navigator.geolocation.getCurrentPosition(
                                    (position) => {
                                        const lat = parseFloat(position.coords.latitude.toFixed(6));
                                        const lng = parseFloat(position.coords.longitude.toFixed(6));
                                        setValue('address_structured.latitude', lat);
                                        setValue('address_structured.longitude', lng);
                                        toast.success('Location detected successfully');
                                    },
                                    (error) => {
                                        let message = 'Unable to get your location';
                                        if (error.code === error.PERMISSION_DENIED) {
                                            message = 'Location access was denied. Please enable location in your browser settings.';
                                        }
                                        toast.error(message);
                                    },
                                    { enableHighAccuracy: true, timeout: 10000 }
                                );
                            }}
                        >
                            Get Current Location
                        </AppButton>
                    </div>
                </div>
            </CollapsibleSection>

            {/* Social Media */}
            <CollapsibleSection
                title="Social Profiles"
                description="Connect your audiences across platforms."
                icon={<Instagram size={20} />}
                defaultOpen={false}
            >
                <div className="space-y-4">
                    {/* Primary Platforms */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="Instagram"
                                    variant="glass"
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
                                    variant="glass"
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
                                    variant="glass"
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
                                    variant="glass"
                                    leftIcon={<Linkedin size={16} />}
                                    {...register('socials.linkedin')}
                                    placeholder="username or URL"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('socials_linkedin', 'LinkedIn')}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="YouTube"
                                    variant="glass"
                                    leftIcon={<Youtube size={16} />}
                                    {...register('socials.youtube')}
                                    placeholder="channel URL"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('socials_youtube', 'YouTube')}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <AppInput
                                    label="TikTok"
                                    variant="glass"
                                    leftIcon={<Music2 size={16} />}
                                    {...register('socials.tiktok')}
                                    placeholder="@username or URL"
                                />
                            </div>
                            <div className="mt-8">
                                {renderVisibilityToggle('socials_tiktok', 'TikTok')}
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-border pt-4 mt-4">
                        <h4 className="text-sm font-medium text-text-secondary mb-4">Messaging & Creative Platforms</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <AppInput
                                        label="WhatsApp"
                                        variant="glass"
                                        leftIcon={<Phone size={16} />}
                                        {...register('socials.whatsapp')}
                                        placeholder="phone number or wa.me link"
                                    />
                                </div>
                                <div className="mt-8">
                                    {renderVisibilityToggle('socials_whatsapp', 'WhatsApp')}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <AppInput
                                        label="Pinterest"
                                        variant="glass"
                                        leftIcon={<Globe size={16} />}
                                        {...register('socials.pinterest')}
                                        placeholder="username or URL"
                                    />
                                </div>
                                <div className="mt-8">
                                    {renderVisibilityToggle('socials_pinterest', 'Pinterest')}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <AppInput
                                        label="Behance"
                                        variant="glass"
                                        leftIcon={<Paintbrush size={16} />}
                                        {...register('socials.behance')}
                                        placeholder="username or URL"
                                    />
                                </div>
                                <div className="mt-8">
                                    {renderVisibilityToggle('socials_behance', 'Behance')}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1">
                                    <AppInput
                                        label="Dribbble"
                                        variant="glass"
                                        leftIcon={<Dribbble size={16} />}
                                        {...register('socials.dribbble')}
                                        placeholder="username or URL"
                                    />
                                </div>
                                <div className="mt-8">
                                    {renderVisibilityToggle('socials_dribbble', 'Dribbble')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </CollapsibleSection>

            {/* Custom Links */}
            <CollapsibleSection
                title="Custom Links"
                description="Add extra links like Portfolio, Booking, etc."
                icon={<LinkIcon size={20} />}
                action={renderVisibilityToggle('custom_links', 'Custom Links')}
                defaultOpen={false}
            >
                <div className="space-y-4">
                    {linkFields.map((field, index) => (
                        <div key={field.id} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <AppInput
                                    label={index === 0 ? "Label" : undefined}
                                    variant="glass"
                                    placeholder="Link Title (e.g. Portfolio)"
                                    {...register(`custom_links.${index}.label` as const, { required: true })}
                                />
                            </div>
                            <div className="flex-[2]">
                                <AppInput
                                    label={index === 0 ? "URL" : undefined}
                                    variant="glass"
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
                                onClick={() => removeLink(index)}
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
                        onClick={() => appendLink({ label: '', url: '' })}
                    >
                        Add Link
                    </AppButton>
                </div>
            </CollapsibleSection>

            {/* Public Profile Theme */}
            <CollapsibleSection
                title="Public Profile Theme"
                description="Customize the look and feel of your public profile page."
                icon={<Palette size={20} className="text-primary" />}
                defaultOpen={true}
            >
                <div className="space-y-6">
                    {/* Theme Selector */}
                    <div>
                        <h4 className="text-sm font-medium text-text-primary mb-4">Choose a Theme</h4>
                        <ThemeSelector
                            selectedThemeId={selectedTheme?.theme_id}
                            onSelect={handleThemeSelect}
                        />
                    </div>

                    {/* Theme Customization - only show when theme is selected */}
                    {selectedTheme && themeCustomization && (
                        <div className="border-t border-border pt-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-medium text-text-primary">Customize Theme</h4>
                                <UndoRedoControls
                                    canUndo={themeUndoRedo.canUndo}
                                    canRedo={themeUndoRedo.canRedo}
                                    onUndo={themeUndoRedo.undo}
                                    onRedo={themeUndoRedo.redo}
                                    onReset={handleThemeReset}
                                    undoCount={themeUndoRedo.undoCount}
                                    redoCount={themeUndoRedo.redoCount}
                                    isDirty={themeUndoRedo.isDirty}
                                    isSavePending={themeUndoRedo.isSavePending}
                                    lastSaveTime={themeUndoRedo.lastSaveTime}
                                    compact
                                />
                            </div>
                            <ThemeCustomization
                                theme={selectedTheme}
                                customization={themeCustomization}
                                onChange={handleThemeCustomizationChange}
                                onReset={handleThemeReset}
                            />
                        </div>
                    )}

                    {/* No theme selected message */}
                    {!selectedTheme && (
                        <div className="text-center py-8 text-text-tertiary">
                            <Palette size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Select a theme above to start customizing your public profile appearance.</p>
                        </div>
                    )}
                </div>
            </CollapsibleSection>

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

        </form >
    );
};
