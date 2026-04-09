"use client";

export interface CoverStyle {
  id: string;
  name: string;
  category: string;
  cssClass: string;
  objectPosition: string;
  overlay?: string;
  textAlign: "left" | "right" | "center";
  aspectRatio: string;
}

export const COVER_STYLES: CoverStyle[] = [
  // Classic (3)
  { id: "classic-full", name: "Classic Full", category: "classic", cssClass: "cover-classic-full", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  { id: "classic-split", name: "Classic Split", category: "classic", cssClass: "cover-classic-split", objectPosition: "center center", textAlign: "left", aspectRatio: "16/9" },
  { id: "classic-minimal", name: "Classic Minimal", category: "classic", cssClass: "cover-classic-minimal", objectPosition: "center center", textAlign: "center", aspectRatio: "21/9" },
  // Hero (3)
  { id: "hero-overlay", name: "Hero Overlay", category: "hero", cssClass: "cover-hero-overlay", objectPosition: "center center", overlay: "linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.6))", textAlign: "center", aspectRatio: "16/9" },
  { id: "hero-gradient", name: "Hero Gradient", category: "hero", cssClass: "cover-hero-gradient", objectPosition: "center center", overlay: "linear-gradient(135deg, rgba(0,0,0,0.4), transparent)", textAlign: "left", aspectRatio: "16/9" },
  { id: "hero-blur", name: "Hero Blur", category: "hero", cssClass: "cover-hero-blur", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  // Editorial (3)
  { id: "editorial-left", name: "Editorial Left", category: "editorial", cssClass: "cover-editorial-left", objectPosition: "center center", textAlign: "left", aspectRatio: "4/3" },
  { id: "editorial-right", name: "Editorial Right", category: "editorial", cssClass: "cover-editorial-right", objectPosition: "center center", textAlign: "right", aspectRatio: "4/3" },
  { id: "editorial-center", name: "Editorial Center", category: "editorial", cssClass: "cover-editorial-center", objectPosition: "center center", textAlign: "center", aspectRatio: "4/3" },
  // Magazine (3)
  { id: "magazine-cover", name: "Magazine Cover", category: "magazine", cssClass: "cover-magazine-cover", objectPosition: "center top", textAlign: "center", aspectRatio: "3/4" },
  { id: "magazine-spread", name: "Magazine Spread", category: "magazine", cssClass: "cover-magazine-spread", objectPosition: "center center", textAlign: "center", aspectRatio: "21/9" },
  { id: "magazine-minimal", name: "Magazine Minimal", category: "magazine", cssClass: "cover-magazine-minimal", objectPosition: "center center", textAlign: "center", aspectRatio: "1/1" },
  // Cinematic (3)
  { id: "cinematic-wide", name: "Cinematic Wide", category: "cinematic", cssClass: "cover-cinematic-wide", objectPosition: "center center", overlay: "linear-gradient(to top, rgba(0,0,0,0.3), transparent 50%)", textAlign: "center", aspectRatio: "21/9" },
  { id: "cinematic-dark", name: "Cinematic Dark", category: "cinematic", cssClass: "cover-cinematic-dark", objectPosition: "center center", overlay: "rgba(0,0,0,0.35)", textAlign: "center", aspectRatio: "16/9" },
  { id: "cinematic-grain", name: "Cinematic Grain", category: "cinematic", cssClass: "cover-cinematic-grain", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  // Elegant (3)
  { id: "elegant-border", name: "Elegant Border", category: "elegant", cssClass: "cover-elegant-border", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  { id: "elegant-frame", name: "Elegant Frame", category: "elegant", cssClass: "cover-elegant-frame", objectPosition: "center center", textAlign: "center", aspectRatio: "4/3" },
  { id: "elegant-vignette", name: "Elegant Vignette", category: "elegant", cssClass: "cover-elegant-vignette", objectPosition: "center center", overlay: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4))", textAlign: "center", aspectRatio: "16/9" },
  // Modern (3)
  { id: "modern-grid", name: "Modern Grid", category: "modern", cssClass: "cover-modern-grid", objectPosition: "center center", textAlign: "left", aspectRatio: "16/9" },
  { id: "modern-asymmetric", name: "Modern Asymmetric", category: "modern", cssClass: "cover-modern-asymmetric", objectPosition: "center center", textAlign: "left", aspectRatio: "16/9" },
  { id: "modern-overlap", name: "Modern Overlap", category: "modern", cssClass: "cover-modern-overlap", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  // Vintage (3)
  { id: "vintage-polaroid", name: "Vintage Polaroid", category: "vintage", cssClass: "cover-vintage-polaroid", objectPosition: "center center", textAlign: "center", aspectRatio: "1/1" },
  { id: "vintage-film", name: "Vintage Film", category: "vintage", cssClass: "cover-vintage-film", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  { id: "vintage-sepia", name: "Vintage Sepia", category: "vintage", cssClass: "cover-vintage-sepia", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  // Bold (3)
  { id: "bold-typography", name: "Bold Typography", category: "bold", cssClass: "cover-bold-typography", objectPosition: "center center", textAlign: "center", aspectRatio: "16/9" },
  { id: "bold-color-block", name: "Bold Color Block", category: "bold", cssClass: "cover-bold-color-block", objectPosition: "center center", textAlign: "left", aspectRatio: "16/9" },
  { id: "bold-geometric", name: "Bold Geometric", category: "bold", cssClass: "cover-bold-geometric", objectPosition: "center center", textAlign: "center", aspectRatio: "1/1" },
  // Nature (3)
  { id: "nature-earth", name: "Nature Earth", category: "nature", cssClass: "cover-nature-earth", objectPosition: "center center", overlay: "linear-gradient(to bottom, transparent 60%, rgba(34,51,34,0.5))", textAlign: "center", aspectRatio: "16/9" },
  { id: "nature-botanical", name: "Nature Botanical", category: "nature", cssClass: "cover-nature-botanical", objectPosition: "center center", textAlign: "center", aspectRatio: "4/3" },
  { id: "nature-panoramic", name: "Nature Panoramic", category: "nature", cssClass: "cover-nature-panoramic", objectPosition: "center center", textAlign: "center", aspectRatio: "21/9" },
];

export const COVER_CATEGORIES = ["classic", "hero", "editorial", "magazine", "cinematic", "elegant", "modern", "vintage", "bold", "nature"] as const;

export function getCoverStyleById(id: string): CoverStyle | undefined {
  return COVER_STYLES.find((s) => s.id === id);
}

export function getCoverStylesByCategory(category: string): CoverStyle[] {
  return COVER_STYLES.filter((s) => s.category === category);
}
