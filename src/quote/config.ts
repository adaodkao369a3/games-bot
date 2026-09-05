export const LAYOUT = {
  // 1575x630 card: the PFP owns exactly the left 40% (630px) and the
  // quote/content owns the right 60% (945px).
  H: 630,
  W: 1575,

  // Curve position as fractions of PFP width
  CURVE_TOP_FRACTION: 0.50,    // curve x at top = 50% of pfp width
  CURVE_BOTTOM_FRACTION: 0.95, // curve x at bottom = 95% of pfp width

  // Base alpha for the fade - ensures the curve is visible (non-zero start)
  CURVE_BASE_ALPHA: 0.18,

  // Right column layout (945px wide for 60% of card)
  // Quote text safe area (fractions of right column width and card height)
  QUOTE_SAFE_LEFT_INSET: 0.06,   // ~6% of column width
  QUOTE_SAFE_RIGHT_INSET: 0.045, // ~4.5% of column width
  QUOTE_SAFE_TOP_INSET: 0.05,    // ~5% of card height
  QUOTE_SAFE_BOTTOM_INSET: 0.81, // ~81% of card height

  // Nickname/username block position (fractions of right column width)
  NICKNAME_LEFT_FRACTION: 0.32,  // ~32% of column width
  NICKNAME_RIGHT_FRACTION: 0.66,  // ~66% of column width

  // Watermark position (absolute pixels from edges)
  WATERMARK_RIGHT_MARGIN: 17,
  WATERMARK_BOTTOM_MARGIN: 18,

  // Text sizing
  MAX_FONT_SIZE: 54,

  // Sticker-only quotes (no text): sticker is centered in the quote area
  // rather than anchored to a side, sized to just under half the quote
  // area's width so a lone sticker doesn't dominate the whole card.
  STICKER_STANDALONE_WIDTH_FRACTION: 0.49,

  // Sticker + text quotes: stacked layout. Text keeps the full quote-area
  // width up top; the sticker sits centered in a band below it, capped to
  // these fractions of the quote area's width/height so it reads as a
  // supporting element rather than competing with the text for space.
  STICKER_STACK_WIDTH_FRACTION: 0.5,
  STICKER_STACK_HEIGHT_FRACTION: 0.38,
  STICKER_STACK_GAP: 24, // px gap between the text block and the sticker band

  // Same idea as the STICKER_* constants above, but for a quoted message's
  // image attachment instead of a sticker. Seeded at the same values but
  // kept separate so the two can be tuned independently later (attachments
  // tend to matter more to the quote than a sticker does, and cover a much
  // wider range of aspect ratios).
  IMAGE_STANDALONE_WIDTH_FRACTION: 0.49,
  IMAGE_STACK_WIDTH_FRACTION: 0.5,
  IMAGE_STACK_HEIGHT_FRACTION: 0.38,
  IMAGE_STACK_GAP: 24,
} as const;

export const FONT_FALLBACK = 'Butler, Georgia, serif';
export const EMOJI_FONT = 'NotoEmoji';

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