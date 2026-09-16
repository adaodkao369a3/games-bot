export const LAYOUT = {
  // 1575x630 card: the PFP owns exactly the left 40% (630px) and the
  // quote/content owns the right 60% (945px).
  H: 630,
  W: 1575,

  // Curve position as fractions of PFP width. Top stays close to full width
  // (minimal cut into the avatar); bottom recedes further (the pronounced
  // curve). Paired with the ease-in curve in renderer.ts so the actual
  // curving motion is concentrated near the bottom, not the top.
  CURVE_TOP_FRACTION: 0.95,    // curve x at top = 95% of pfp width
  CURVE_BOTTOM_FRACTION: 0.50, // curve x at bottom = 50% of pfp width

  // Base alpha for the fade. Lowered from 0.18 — at that level the avatar
  // sat under a flat tint even outside the fade zone, reading as a visible
  // border/frame. Near-zero means the avatar starts fully clean and only
  // the actual fade zone darkens it.
  CURVE_BASE_ALPHA: 0.04,

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

  // Multi-quote stacking (.quote 2, and later .quote 3/4/...): each card
  // keeps its own full H-tall slot (no compression — total height is
  // always an exact multiple of H), but the edge each card shares with a
  // neighbour fades to transparent over this many px, revealing a
  // same-coloured backdrop underneath so adjacent cards melt together at
  // the seam instead of butting against a hard line.
  STACK_EDGE_FADE: 70,

  // Stacked cards get a wider quote/text column than a single card (the
  // avatar itself stays the same H x H square either way) — this
  // multiplies the standard (W - H) quote-column width.
  STACK_QUOTE_WIDTH_MULTIPLIER: 1.2,
} as const;

export const FONT_FALLBACK = 'Butler, Georgia, serif';
export const EMOJI_FONT = 'NotoEmoji';

export const THEME_SELECT_EXPIRY_MS = 5 * 60 * 1000;

export type PresetName =
  | 'classic'
  | 'white'
  | 'sunset'
  | 'ocean'
  | 'purple'
  | 'aurora'
  | 'gold'
  | 'cherry'
  | 'midnight'
  | 'plasma';

export interface GradientPreset {
  type: 'solid' | 'linear';
  colors: [number, number, number][];
  label: string;
}

export const GRADIENT_PRESETS: Record<PresetName, GradientPreset> = {
  classic: { type: 'solid',  colors: [[0, 0, 0]], label: 'Classic' },
  white:   { type: 'solid',  colors: [[255, 255, 255]], label: 'White' },
  sunset:  { type: 'linear', colors: [[255,244,214],[255,183,120],[237,85,45],[168,26,20],[59,9,9]], label: 'Sunset' },
  ocean:   { type: 'linear', colors: [[214,244,255],[120,200,255],[45,120,237],[20,60,168],[9,20,59]], label: 'Ocean' },
  purple:  { type: 'linear', colors: [[244,214,255],[200,120,255],[130,45,237],[70,20,168],[25,9,59]], label: 'Purple' },
  aurora:  { type: 'linear', colors: [[220,255,232],[110,245,220],[40,205,220],[75,110,220],[35,20,90]], label: 'Aurora' },
  gold:    { type: 'linear', colors: [[255,248,220],[255,220,110],[235,175,45],[160,105,25],[70,40,10]], label: 'Gold' },
  cherry:  { type: 'linear', colors: [[255,220,225],[245,100,120],[210,35,65],[125,15,40],[55,5,20]], label: 'Cherry' },
  midnight:{ type: 'linear', colors: [[210,220,235],[110,130,160],[60,70,130],[25,35,85],[5,8,25]], label: 'Midnight' },
  plasma:  { type: 'linear', colors: [[255,210,240],[245,80,190],[190,35,210],[90,45,190],[25,10,80]], label: 'Plasma' },
};