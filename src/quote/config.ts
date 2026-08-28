export const LAYOUT = {
  // 1260x630 card: the PFP owns exactly the left 50% (630px) and the
  // quote/content owns the right 50% (630px).
  H: 630,
  W: 630 * 2,

  // Left edge of the full-width colour layer. The colour layer is ABOVE the
  // PFP, so this curve intentionally overlaps the PFP near the top/bottom and
  // meets the 50% boundary around the vertical centre.
  // Curve endpoints are positions INSIDE the 630px PFP.
  CURVE_TOP_X: 504, // ← CHANGE: top starts at ~80% of the PFP width
  CURVE_BOTTOM_X: 567, // ← CHANGE: bottom ends at ~90% of the PFP width

  // ← CHANGE: pushes ONLY the middle of the curve to the RIGHT.
  // 0 = no centre shift; 20–40 = increasingly rightward centre.
  CURVE_CENTER_SHIFT_X: 45,

  // ← CHANGE: controls the FULL fade distance from PFP toward the text.
  // This is intentionally large so the colour is fading throughout the
  // transition, not just at the final edge.
  CURVE_FADE_START_AFTER_PFP: 0.30, // ← CHANGE: 0.30 = start the fade 30% of the PFP width past the PFP edge

  // Quote stays in the right half. The existing quote sizing is retained.
  TEXT_X: 700,
  MAX_FONT_SIZE: 54,
  MAX_TEXT_BLOCK_WIDTH: 620,
} as const;

export const FONT_FALLBACK = 'Butler, Georgia, serif';

export const THEME_SELECT_EXPIRY_MS = 5 * 60 * 1000;

export type PresetName = 'classic' | 'sunset' | 'ocean' | 'purple';

export interface GradientPreset {
  type: 'solid' | 'linear';
  colors: [number, number, number][];
  label: string;
}

export const GRADIENT_PRESETS: Record<PresetName, GradientPreset> = {
  classic: { type: 'solid',  colors: [[0, 0, 0]], label: 'Classic' },
  sunset:  { type: 'linear', colors: [[255,244,214],[255,183,120],[237,85,45],[168,26,20],[59,9,9]], label: 'Sunset' },
  ocean:   { type: 'linear', colors: [[214,244,255],[120,200,255],[45,120,237],[20,60,168],[9,20,59]], label: 'Ocean' },
  purple:  { type: 'linear', colors: [[244,214,255],[200,120,255],[130,45,237],[70,20,168],[25,9,59]], label: 'Purple' },
};
