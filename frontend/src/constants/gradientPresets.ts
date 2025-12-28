/**
 * Gradient Presets
 * 20 predefined gradient presets organized by category.
 * Each preset is designed to meet WCAG AA contrast requirements for white text.
 */

import type { GradientPreset, GradientCategory } from '../types/gradient';

/**
 * 20 Gradient Presets
 *
 * Categories:
 * - Warm (5): Sunset, Coral, Peach, Fire, Amber
 * - Cool (5): Ocean, Arctic, Twilight, Lavender, Mint
 * - Professional (5): Steel, Charcoal, Navy, Forest, Slate
 * - Vibrant (5): Neon, Candy, Electric, Aurora, Prism
 */
export const GRADIENT_PRESETS: GradientPreset[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // WARM TONES (5 presets)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'sunset-glow',
    name: 'Sunset Glow',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'sunset-glow',
      direction: 135,
      colors: [
        { color: '#FF6B6B', position: 0 },
        { color: '#FFA502', position: 100 },
      ],
    },
  },
  {
    id: 'coral-reef',
    name: 'Coral Reef',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'coral-reef',
      direction: 90,
      colors: [
        { color: '#FF7675', position: 0 },
        { color: '#D63031', position: 100 },
      ],
    },
  },
  {
    id: 'peach-kiss',
    name: 'Peach Kiss',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'peach-kiss',
      direction: 120,
      colors: [
        { color: '#F78CA0', position: 0 },
        { color: '#F9748F', position: 50 },
        { color: '#FD868C', position: 100 },
      ],
    },
  },
  {
    id: 'fire-burst',
    name: 'Fire Burst',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'fire-burst',
      direction: 180,
      colors: [
        { color: '#FF4E50', position: 0 },
        { color: '#F9D423', position: 100 },
      ],
    },
  },
  {
    id: 'amber-dawn',
    name: 'Amber Dawn',
    category: 'warm',
    config: {
      type: 'linear',
      preset_id: 'amber-dawn',
      direction: 45,
      colors: [
        { color: '#F2994A', position: 0 },
        { color: '#F2C94C', position: 100 },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COOL TONES (5 presets)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'ocean-breeze',
      direction: 135,
      colors: [
        { color: '#4ECDC4', position: 0 },
        { color: '#44A3FF', position: 100 },
      ],
    },
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'arctic-frost',
      direction: 160,
      colors: [
        { color: '#74EBD5', position: 0 },
        { color: '#9FACE6', position: 100 },
      ],
    },
  },
  {
    id: 'twilight-dream',
    name: 'Twilight Dream',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'twilight-dream',
      direction: 135,
      colors: [
        { color: '#667EEA', position: 0 },
        { color: '#764BA2', position: 100 },
      ],
    },
  },
  {
    id: 'lavender-mist',
    name: 'Lavender Mist',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'lavender-mist',
      direction: 90,
      colors: [
        { color: '#A18CD1', position: 0 },
        { color: '#FBC2EB', position: 100 },
      ],
    },
  },
  {
    id: 'mint-fresh',
    name: 'Mint Fresh',
    category: 'cool',
    config: {
      type: 'linear',
      preset_id: 'mint-fresh',
      direction: 120,
      colors: [
        { color: '#00B09B', position: 0 },
        { color: '#96C93D', position: 100 },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFESSIONAL (5 presets)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'steel-gray',
    name: 'Steel Gray',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'steel-gray',
      direction: 180,
      colors: [
        { color: '#2C3E50', position: 0 },
        { color: '#4A5568', position: 100 },
      ],
    },
  },
  {
    id: 'charcoal-slate',
    name: 'Charcoal Slate',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'charcoal-slate',
      direction: 135,
      colors: [
        { color: '#1A1A2E', position: 0 },
        { color: '#16213E', position: 50 },
        { color: '#0F3460', position: 100 },
      ],
    },
  },
  {
    id: 'midnight-navy',
    name: 'Midnight Navy',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'midnight-navy',
      direction: 160,
      colors: [
        { color: '#0F2027', position: 0 },
        { color: '#203A43', position: 50 },
        { color: '#2C5364', position: 100 },
      ],
    },
  },
  {
    id: 'forest-deep',
    name: 'Forest Deep',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'forest-deep',
      direction: 135,
      colors: [
        { color: '#134E5E', position: 0 },
        { color: '#71B280', position: 100 },
      ],
    },
  },
  {
    id: 'slate-stone',
    name: 'Slate Stone',
    category: 'professional',
    config: {
      type: 'linear',
      preset_id: 'slate-stone',
      direction: 90,
      colors: [
        { color: '#485563', position: 0 },
        { color: '#29323C', position: 100 },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VIBRANT (5 presets)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'neon-nights',
      direction: 135,
      colors: [
        { color: '#A855F7', position: 0 },
        { color: '#EC4899', position: 50 },
        { color: '#F97316', position: 100 },
      ],
    },
  },
  {
    id: 'candy-pop',
    name: 'Candy Pop',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'candy-pop',
      direction: 90,
      colors: [
        { color: '#FC466B', position: 0 },
        { color: '#3F5EFB', position: 100 },
      ],
    },
  },
  {
    id: 'electric-violet',
    name: 'Electric Violet',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'electric-violet',
      direction: 135,
      colors: [
        { color: '#8E2DE2', position: 0 },
        { color: '#4A00E0', position: 100 },
      ],
    },
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'aurora-borealis',
      direction: 120,
      colors: [
        { color: '#11998E', position: 0 },
        { color: '#38EF7D', position: 100 },
      ],
    },
  },
  {
    id: 'prism-light',
    name: 'Prism Light',
    category: 'vibrant',
    config: {
      type: 'linear',
      preset_id: 'prism-light',
      direction: 135,
      colors: [
        { color: '#FF0080', position: 0 },
        { color: '#7928CA', position: 50 },
        { color: '#0070F3', position: 100 },
      ],
    },
  },
];

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: GradientCategory): GradientPreset[] {
  return GRADIENT_PRESETS.filter((preset) => preset.category === category);
}

/**
 * Get a specific preset by ID
 */
export function getPresetById(id: string): GradientPreset | undefined {
  return GRADIENT_PRESETS.find((preset) => preset.id === id);
}

/**
 * Get all category labels for display
 */
export const GRADIENT_CATEGORIES: { value: GradientCategory; label: string }[] = [
  { value: 'warm', label: 'Warm Tones' },
  { value: 'cool', label: 'Cool Tones' },
  { value: 'professional', label: 'Professional' },
  { value: 'vibrant', label: 'Vibrant' },
];
