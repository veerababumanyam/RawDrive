export type CoverTemplateLayout =
  | "single"
  | "split"
  | "quad"
  | "journal"
  | "frame"
  | "stripe"
  | "stamp"
  | "outline";

export interface CoverTemplate {
  id: string;
  name: string;
  mood: string;
  layout: CoverTemplateLayout;
  slotCount: number;
  aspectRatio: string;
  mobileAspectRatio: string;
  textAlign: "left" | "center" | "right";
  titlePosition: { x: number; y: number };
  subtitlePosition: { x: number; y: number };
  mediaMode: "single-photo" | "slideshow" | "short-video" | "photo-grid";
}

export const COVER_TEMPLATES: CoverTemplate[] = [
  {
    id: "classic-full",
    name: "Center",
    mood: "Single photo, centered title",
    layout: "single",
    slotCount: 1,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 64 },
    subtitlePosition: { x: 50, y: 75 },
    mediaMode: "single-photo",
  },
  {
    id: "editorial-left",
    name: "Left",
    mood: "Photo with left editorial copy",
    layout: "single",
    slotCount: 1,
    aspectRatio: "4/3",
    mobileAspectRatio: "4/5",
    textAlign: "left",
    titlePosition: { x: 26, y: 58 },
    subtitlePosition: { x: 26, y: 70 },
    mediaMode: "single-photo",
  },
  {
    id: "classic-split",
    name: "Divider",
    mood: "Two photos side by side",
    layout: "split",
    slotCount: 2,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 62 },
    subtitlePosition: { x: 50, y: 74 },
    mediaMode: "single-photo",
  },
  {
    id: "modern-grid",
    name: "Four Grid",
    mood: "Four-photo album opener",
    layout: "quad",
    slotCount: 4,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 56 },
    subtitlePosition: { x: 50, y: 67 },
    mediaMode: "photo-grid",
  },
  {
    id: "magazine-minimal",
    name: "Journal",
    mood: "Photo and quiet text panel",
    layout: "journal",
    slotCount: 1,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "right",
    titlePosition: { x: 72, y: 54 },
    subtitlePosition: { x: 72, y: 66 },
    mediaMode: "single-photo",
  },
  {
    id: "elegant-frame",
    name: "Frame",
    mood: "Inset framed photograph",
    layout: "frame",
    slotCount: 1,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 62 },
    subtitlePosition: { x: 50, y: 73 },
    mediaMode: "single-photo",
  },
  {
    id: "cinematic-wide",
    name: "Stripe",
    mood: "Wide cinematic strip",
    layout: "stripe",
    slotCount: 1,
    aspectRatio: "21/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 52 },
    subtitlePosition: { x: 50, y: 64 },
    mediaMode: "single-photo",
  },
  {
    id: "vintage-polaroid",
    name: "Stamp",
    mood: "Small keepsake photo",
    layout: "stamp",
    slotCount: 1,
    aspectRatio: "1/1",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 72 },
    subtitlePosition: { x: 50, y: 82 },
    mediaMode: "single-photo",
  },
  {
    id: "elegant-border",
    name: "Outline",
    mood: "Full photo with border guide",
    layout: "outline",
    slotCount: 1,
    aspectRatio: "16/9",
    mobileAspectRatio: "4/5",
    textAlign: "center",
    titlePosition: { x: 50, y: 55 },
    subtitlePosition: { x: 50, y: 66 },
    mediaMode: "single-photo",
  },
];

const DEFAULT_TEMPLATE = COVER_TEMPLATES[0];

export function getCoverTemplate(styleId?: string | null): CoverTemplate {
  return (
    COVER_TEMPLATES.find((template) => template.id === styleId) ||
    DEFAULT_TEMPLATE
  );
}

export function coverTemplateSlotIndices(template: CoverTemplate): number[] {
  return Array.from({ length: template.slotCount }, (_, index) => index);
}
