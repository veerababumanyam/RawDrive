import { authFetch } from "@/lib/api/authFetch";
import { getApiBaseUrl } from "@/lib/api/base-url";

const apiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

export interface AvatarPosition {
  x: number;
  y: number;
  zoom: number;
  aspect?: number;
}

export interface ProfileVisibility {
  show_profile_photo: boolean;
  show_name: boolean;
  show_tagline: boolean;
  show_location: boolean;
  show_bio: boolean;
  show_galleries: boolean;
  show_reviews: boolean;
  show_pricing: boolean;
  show_email: boolean;
  show_phone: boolean;
  show_whatsapp: boolean;
  show_socials: boolean;
  show_awards: boolean;
  show_services: boolean;
  show_equipment: boolean;
  show_custom_links: boolean;
}

export interface ProfileCustomLink {
  label: string;
  url: string;
}

export interface PhotographerProfile {
  profile_id?: string;
  photographer_id?: string;
  workspace_id?: string;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  status: "draft" | "published" | "archived" | string;
  first_name: string;
  last_name: string;
  display_name: string;
  professional_title: string;
  tagline: string;
  avatar_url: string;
  avatar_cropped_url: string;
  avatar_position: AvatarPosition;
  cover_url: string;
  cover_position: Record<string, unknown>;
  short_bio: string;
  long_bio: string;
  primary_email: string;
  primary_phone: string;
  whatsapp_number: string;
  secondary_email: string;
  contact_preferences: Record<string, unknown>;
  primary_city: string;
  state: string;
  country: string;
  service_radius_km?: number | null;
  travel_availability: string;
  covered_cities: string[];
  years_experience?: number | null;
  total_weddings_shot?: number | null;
  photography_styles: string[];
  specializations: string[];
  languages_spoken: string[];
  equipment: Record<string, unknown>;
  starting_price?: number | null;
  price_range_max?: number | null;
  custom_quote_available: boolean;
  payment_terms: string;
  deposit_required: boolean;
  deposit_amount?: number | null;
  packages: unknown[];
  featured_galleries: string[];
  testimonials: unknown[];
  video_testimonials: string[];
  average_rating?: number | null;
  social_instagram: string;
  social_facebook: string;
  social_linkedin: string;
  social_youtube: string;
  social_pinterest: string;
  custom_links: ProfileCustomLink[];
  awards: unknown[];
  certifications: unknown[];
  featured_in: string[];
  business_name: string;
  gst_number: string;
  business_address: string;
  payment_methods: string[];
  is_public: boolean;
  visibility_config: ProfileVisibility;
  meta_title: string;
  meta_description: string;
  meta_keywords: string[];
  og_image_url: string;
  url_slug: string;
  selected_theme: string;
  brand_color: string;
  layout_style: string;
  total_profile_views?: number;
  unique_visitors?: number;
  last_viewed_at?: string | null;
}

export interface ProfileGallery {
  id: string;
  title: string;
  slug: string;
  description: string;
  gallery_type: string;
  is_published: boolean;
  status: string;
  cover_thumbnails?: Record<string, string>;
}

export interface ProfileResponse {
  profile: PhotographerProfile | null;
  public_url: string;
}

export interface PublicProfileResponse {
  profile: PhotographerProfile;
  galleries: ProfileGallery[];
  public_url: string;
}

export const DEFAULT_VISIBILITY: ProfileVisibility = {
  show_profile_photo: true,
  show_name: true,
  show_tagline: true,
  show_location: true,
  show_bio: true,
  show_galleries: true,
  show_reviews: true,
  show_pricing: false,
  show_email: true,
  show_phone: false,
  show_whatsapp: true,
  show_socials: true,
  show_awards: true,
  show_services: true,
  show_equipment: false,
  show_custom_links: true,
};

export function emptyPhotographerProfile(): PhotographerProfile {
  return {
    status: "draft",
    first_name: "",
    last_name: "",
    display_name: "",
    professional_title: "Indian Wedding Photographer",
    tagline: "",
    avatar_url: "",
    avatar_cropped_url: "",
    avatar_position: { x: 0, y: 0, zoom: 1, aspect: 1 },
    cover_url: "",
    cover_position: { x: 0, y: 0, zoom: 1 },
    short_bio: "",
    long_bio: "",
    primary_email: "",
    primary_phone: "",
    whatsapp_number: "",
    secondary_email: "",
    contact_preferences: {},
    primary_city: "",
    state: "",
    country: "India",
    service_radius_km: null,
    travel_availability: "",
    covered_cities: [],
    years_experience: null,
    total_weddings_shot: null,
    photography_styles: [],
    specializations: ["wedding"],
    languages_spoken: [],
    equipment: {},
    starting_price: null,
    price_range_max: null,
    custom_quote_available: true,
    payment_terms: "",
    deposit_required: true,
    deposit_amount: null,
    packages: [],
    featured_galleries: [],
    testimonials: [],
    video_testimonials: [],
    average_rating: null,
    social_instagram: "",
    social_facebook: "",
    social_linkedin: "",
    social_youtube: "",
    social_pinterest: "",
    custom_links: [],
    awards: [],
    certifications: [],
    featured_in: [],
    business_name: "",
    gst_number: "",
    business_address: "",
    payment_methods: [],
    is_public: false,
    visibility_config: { ...DEFAULT_VISIBILITY },
    meta_title: "",
    meta_description: "",
    meta_keywords: [],
    og_image_url: "",
    url_slug: "",
    selected_theme: "minimal",
    brand_color: "",
    layout_style: "grid",
    total_profile_views: 0,
    unique_visitors: 0,
    last_viewed_at: null,
  };
}

export async function getPhotographerProfile(): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile");
  if (res.status === 404) return { profile: null, public_url: "" };
  if (!res.ok) throw new Error(`Failed to load profile: ${res.status}`);
  return res.json();
}

export async function savePhotographerProfile(
  profile: PhotographerProfile,
): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function publishPhotographerProfile(): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile/publish", { method: "PUT" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function unpublishPhotographerProfile(): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile/unpublish", { method: "PUT" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function uploadProfileAvatar(
  file: File,
): Promise<ProfileResponse> {
  const form = new FormData();
  form.append("avatar", file);
  const res = await authFetch("/api/v1/profile/avatar/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function cropProfileAvatar(
  position: AvatarPosition,
): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile/avatar/crop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...position, aspect: 1 }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listProfileGalleries(): Promise<ProfileGallery[]> {
  const res = await authFetch("/api/v1/profile/galleries");
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Failed to load galleries: ${res.status}`);
  const body = await res.json();
  return Array.isArray(body.galleries) ? body.galleries : [];
}

export async function addFeaturedProfileGallery(
  galleryId: string,
): Promise<ProfileResponse> {
  const res = await authFetch("/api/v1/profile/galleries/featured", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gallery_id: galleryId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function removeFeaturedProfileGallery(
  galleryId: string,
): Promise<ProfileResponse> {
  const res = await authFetch(
    `/api/v1/profile/galleries/featured/${galleryId}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProfileQRUrl(): Promise<string> {
  const res = await authFetch("/api/v1/profile/qr");
  if (!res.ok) throw new Error(await res.text());
  const body = await res.json();
  return body.url || "";
}

export async function downloadProfileVCard(): Promise<void> {
  const res = await authFetch("/api/v1/profile/vcard");
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "rawdrive-profile.vcf";
  link.click();
  URL.revokeObjectURL(url);
}

export async function getPublicPhotographerProfile(
  slug: string,
): Promise<PublicProfileResponse> {
  const res = await fetch(
    apiUrl(`/api/v1/profile/${encodeURIComponent(slug)}`),
    {
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`Failed to load public profile: ${res.status}`);
  return res.json();
}

export async function trackPublicProfileView(slug: string): Promise<void> {
  await fetch(apiUrl(`/api/v1/profile/${encodeURIComponent(slug)}/view`), {
    method: "POST",
    keepalive: true,
  }).catch(() => {});
}
