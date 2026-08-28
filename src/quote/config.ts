export const LAYOUT = {
  // Discord avatars are always square, so contain-scaling one to the full
  // card height (H) always makes its drawn width equal H. Hardcoding W as
  // double H keeps the canvas exactly two equal-width blocks: the avatar
  // fills the left half, and the text zone gets the same width on the right.
  H: 630,
  W: 630 * 2,
  // Fade geometry is now derived dynamically from the avatar's real right
  // edge (see renderer.ts) rather than a fixed BOUNDARY_X, so the curve
  // always hugs whatever gets drawn. These two constants control how the
  // curve sits relative to that computed edge:
  FADE_SOFTEN: 30,    // px BEFORE the real edge where the fade starts (softens the seam)
  FADE_SWEEP: 160,    // px AFTER the real edge the curve continues into the text zone
  CIRCLE_R: 630 * 1.15, // controls curve tightness
  STOPS: 8,
  // Quote text should be compact and "settled in its own place" rather than
  // spanning/dominating the whole canvas.
  MAX_FONT_SIZE: 54,
  MAX_TEXT_BLOCK_WIDTH: 620,
} as const;

export const FONT_FALLBACK = 'Butler, Georgia, serif';

// How long the theme-select dropdown stays active on a rendered quote card
// before it's disabled/removed (5 minutes).
export const THEME_SELECT_EXPIRY_MS = 5 * 60 * 1000;

export type PresetName = 'classic' | 'sunset' | 'ocean' | 'purple';

export interface GradientPreset {
  type: 'solid' | 'linear';
  colors: [number, number, number][]; // RGB, ordered light→dark or start→end
  label: string; // display label for the theme select menu
}

export const GRADIENT_PRESETS: Record<PresetName, GradientPreset> = {
  classic: { type: 'solid',  colors: [[0, 0, 0]], label: 'Classic' },
  sunset:  { type: 'linear', colors: [[255,244,214],[255,183,120],[237,85,45],[168,26,20],[59,9,9]], label: 'Sunset' },
  ocean:   { type: 'linear', colors: [[214,244,255],[120,200,255],[45,120,237],[20,60,168],[9,20,59]], label: 'Ocean' },
  purple:  { type: 'linear', colors: [[244,214,255],[200,120,255],[130,45,237],[70,20,168],[25,9,59]], label: 'Purple' },
};
