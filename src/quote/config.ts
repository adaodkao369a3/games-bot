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

  // Multi-quote stacking (.quote 2, and later .quote 3/4/...): every card
  // keeps its own full H-tall slot (no compression — total height is
  // always an exact multiple of H). The whole stack is painted as one
  // continuous backdrop across all cards in a single pass, so there is no
  // per-card seam to blend — the earlier STACK_EDGE_FADE compositing trick
  // is gone because there's no longer a seam it needs to hide.

  // Stacked cards get a wider quote/text column than a single card (the
  // avatar itself stays the same H x H square either way) — this
  // multiplies the standard (W - H) quote-column width.
  STACK_QUOTE_WIDTH_MULTIPLIER: 1.4,

  // Total composite height target for a stack, regardless of N (fixed at
  // H*1.6 for now rather than H*N — each card's slot, and its square
  // avatar, shrinks to fit within this instead of the composite growing
  // with every added card). Bumped from 1.5 so each row has room for the
  // name block below the quote. Revisit this ratio if/when .quote 3+ needs
  // a different one; for now every N squeezes into the same H*1.6 total.
  STACK_HEIGHT_MULTIPLIER: 1.6,

  // Stacked cards only: fixed pixel height reserved at the bottom of each
  // row for the bar + nickname + username, so the block always fits inside
  // its row no matter how small the row gets (the single-card layout uses
  // fractions of a taller card and is untouched).
  STACK_NAME_BLOCK_RESERVE: 108,

  // Stacked cards only: the bar above the name spans this fraction of the
  // quote column's width, anchored to the outer edge (away from the pfp).
  STACK_BAR_LENGTH_FRACTION: 0.75,
} as const;

export const FONT_FALLBACK = 'Butler, Georgia, serif';
export const EMOJI_FONT = 'NotoEmoji';

export type FontName =
  | 'butler'
  | 'roboto'
  | 'roboto_bold'
  | 'angels'
  | 'blazed'
  | 'bleeding_cowboys'
  | 'bouncy'
  | 'cowboy_movie'
  | 'flame'
  | 'hanged_letters'
  | 'magazine_letter'
  | 'matcha_world'
  | 'next_ups'
  | 'sabrina'
  | 'spider_man'
  | 'iknowaghost';

export interface FontOption {
  label: string;
  font: string;
  fallback: string;
}

export const FONT_OPTIONS: Record<FontName, FontOption> = {
  butler: { label: 'Butler', font: 'Butler', fallback: 'Georgia, serif' },
  roboto: { label: 'Roboto', font: 'Roboto', fallback: 'Arial, sans-serif' },
  roboto_bold: { label: 'Roboto Bold', font: 'Roboto-Bold', fallback: 'Arial, sans-serif' },
  angels: { label: 'Angels', font: 'Angels', fallback: 'Georgia, serif' },
  blazed: { label: 'Blazed', font: 'Blazed', fallback: 'Impact, sans-serif' },
  bleeding_cowboys: { label: 'Bleeding Cowboys', font: 'Bleeding_Cowboys', fallback: 'Georgia, serif' },
  bouncy: { label: 'Bouncy', font: 'Bouncy', fallback: 'Comic Sans MS, cursive' },
  cowboy_movie: { label: 'Cowboy Movie', font: 'Cowboy_Movie', fallback: 'Georgia, serif' },
  flame: { label: 'Flame', font: 'Flame', fallback: 'Impact, sans-serif' },
  hanged_letters: { label: 'Hanged Letters', font: 'Hanged_Letters', fallback: 'Georgia, serif' },
  magazine_letter: { label: 'Magazine Letter', font: 'MagazineLetterByBrntlbrnl-Regular', fallback: 'Georgia, serif' },
  matcha_world: { label: 'Matcha World', font: 'Matcha_World', fallback: 'Arial, sans-serif' },
  next_ups: { label: 'Next Ups', font: 'Next_Ups', fallback: 'Arial, sans-serif' },
  sabrina: { label: 'Sabrina', font: 'SABRINAS', fallback: 'Georgia, serif' },
  spider_man: { label: 'Spider-Man', font: 'The_Amazing_Spider_Man', fallback: 'Impact, sans-serif' },
  iknowaghost: { label: 'I Know A Ghost', font: 'iknowaghost', fallback: 'Georgia, serif' },
};

export const THEME_SELECT_EXPIRY_MS = 5 * 60 * 1000;

export type PresetName =
  | 'classic'
  | 'white'
  | 'sunset'
  | 'purple'
  | 'aurora'
  | 'gold'
  | 'cherry'
  | 'midnight'
  | 'plasma'
  | 'emerald'
  | 'rose'
  | 'ember'
  | 'sapphire'
  | 'coral'
  | 'lime';

export interface GradientPreset {
  type: 'solid' | 'linear';
  colors: [number, number, number][];
  label: string;
}

export const GRADIENT_PRESETS: Record<PresetName, GradientPreset> = {
  classic:  { type: 'solid',  colors: [[0, 0, 0]], label: 'Classic' },
  white:    { type: 'solid',  colors: [[255, 255, 255]], label: 'White' },
  sunset:   { type: 'linear', colors: [[255,244,214],[255,183,120],[237,85,45],[168,26,20],[59,9,9]], label: 'Sunset' },
  purple:   { type: 'linear', colors: [[244,214,255],[200,120,255],[130,45,237],[70,20,168],[25,9,59]], label: 'Purple' },
  aurora:   { type: 'linear', colors: [[220,255,232],[110,245,220],[40,205,220],[75,110,220],[35,20,90]], label: 'Aurora' },
  gold:     { type: 'linear', colors: [[255,248,220],[255,220,110],[235,175,45],[160,105,25],[70,40,10]], label: 'Gold' },
  cherry:   { type: 'linear', colors: [[255,220,225],[245,100,120],[210,35,65],[125,15,40],[55,5,20]], label: 'Cherry' },
  midnight: { type: 'linear', colors: [[210,220,235],[110,130,160],[60,70,130],[25,35,85],[5,8,25]], label: 'Midnight' },
  plasma:   { type: 'linear', colors: [[255,210,240],[245,80,190],[190,35,210],[90,45,190],[25,10,80]], label: 'Plasma' },
  emerald:  { type: 'linear', colors: [[220,252,231],[110,231,183],[16,185,129],[5,120,87],[2,44,34]], label: 'Emerald' },
  rose:     { type: 'linear', colors: [[255,228,235],[253,164,190],[244,63,125],[190,24,93],[76,5,35]], label: 'Rose' },
  ember:    { type: 'linear', colors: [[255,237,213],[251,146,60],[234,88,12],[154,52,18],[67,20,7]], label: 'Ember' },
  sapphire: { type: 'linear', colors: [[220,240,255],[110,180,255],[30,110,230],[20,55,160],[8,20,65]], label: 'Sapphire' },
  coral:    { type: 'linear', colors: [[255,225,215],[255,160,135],[251,105,90],[205,55,60],[90,20,30]], label: 'Coral' },
  lime:     { type: 'linear', colors: [[245,255,205],[190,245,90],[120,220,35],[45,145,35],[12,65,25]], label: 'Lime' },
};