import { createCanvas, loadImage, Image, SKRSContext2D, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { LAYOUT, GRADIENT_PRESETS, PresetName, FONT_FALLBACK, EMOJI_FONT } from './config.js';
import { segmentText, preloadCustomEmojis, getCustomEmojiFromCache, Segment } from './textSegmenter.js';

const PROJECT_ROOT = cwd();

const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Butler-Free-Bd.otf');
const emojiFontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'NotoColorEmoji.ttf');

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Butler');
    if (success) {
      console.log('[QuoteRenderer] Font loaded: assets/fonts/Butler-Free-Bd.otf');
    } else {
      console.error('[QuoteRenderer] Font registration failed');
    }
  } else {
    console.error('[QuoteRenderer] Font file not found: assets/fonts/Butler-Free-Bd.otf');
  }
} catch (error) {
  console.error('[QuoteRenderer] Failed to load font:', error);
}

try {
  if (existsSync(emojiFontPath)) {
    const success = GlobalFonts.registerFromPath(emojiFontPath, 'NotoEmoji');
    if (success) {
      console.log('[QuoteRenderer] Emoji font loaded: assets/fonts/NotoColorEmoji.ttf');
    } else {
      console.error('[QuoteRenderer] Emoji font registration failed');
    }
  } else {
    console.error('[QuoteRenderer] Emoji font file not found: assets/fonts/NotoColorEmoji.ttf');
  }
} catch (error) {
  console.error('[QuoteRenderer] Failed to load emoji font:', error);
}

export interface QuoteCardOptions {
  avatarUrl: string;
  quoteText: string;
  nickname: string;
  username: string;
  preset?: PresetName;
  /** Direct image URL for a sticker attached to the quoted message (PNG/APNG). */
  stickerUrl?: string;
  /** Direct URL for a quoted message's image attachment. Only used when there's no sticker. */
  imageUrl?: string;
}

/** Internal layout knobs that differ between a standalone quote card and
 * one card inside a `.quote 2`+ stack — everything else about the drawing
 * pipeline is shared. */
interface LayerOptions {
  /** Total card width. Always LAYOUT.W for a single card; wider for a
   * stack, since only the quote/text column grows (avatar stays LAYOUT.H). */
  cardWidth: number;
  /** false: avatar left 40%, quote right 60% (the normal layout).
   *  true: mirrored — quote left, avatar right, curve blend flipped to match. */
  mirror: boolean;
  /** Whether this card draws its own corner "BOMBO PRODUCTIONS" watermark.
   * Stacked cards skip this — the composite draws one shared badge at each
   * seam instead. */
  drawWatermark: boolean;
}

export async function renderQuoteCard(opts: QuoteCardOptions): Promise<Buffer> {
  return renderQuoteCardLayer(opts, { cardWidth: LAYOUT.W, mirror: false, drawWatermark: true });
}

async function renderQuoteCardLayer(opts: QuoteCardOptions, layout: LayerOptions): Promise<Buffer> {
  const { H } = LAYOUT;
  const { cardWidth, mirror, drawWatermark } = layout;
  const preset = GRADIENT_PRESETS[opts.preset ?? 'classic'];
  const isWhitePreset = (opts.preset ?? 'classic') === 'white';

  const SCALE = 2;
  const canvas = createCanvas(cardWidth * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Everything is rendered directly into the card. The canvas itself clips
  // anything outside the card, so the PFP can never create an external
  // circle/shadow/overflow beyond the quote-card bounds.
  drawBackground(ctx, preset, cardWidth);

  const avatarImg = await loadImage(opts.avatarUrl);
  const pfpWidth = H; // the avatar is always exactly H x H, regardless of cardWidth
  const avatarX = mirror ? cardWidth - pfpWidth : 0;

  // The PFP owns one H-wide edge of the card — left normally, right when
  // mirrored. Discord avatars are normally square; object-fit: cover keeps
  // that H x H footprint even if an unexpected non-square source is returned.
  drawAvatar(ctx, avatarImg, pfpWidth, avatarX, H);

  // The colour layer is full-card and sits ABOVE the PFP. Its edge nearest
  // the quote text is a single broad curve that cuts into the PFP near the
  // top/bottom and reaches the 50% boundary around the vertical centre.
  // Mirroring the card flips which side that curve faces.
  drawColorCurveOverlay(ctx, preset, cardWidth, pfpWidth, mirror);

  await drawText(
    ctx,
    opts.quoteText,
    opts.nickname,
    opts.username,
    cardWidth,
    pfpWidth,
    H,
    mirror,
    drawWatermark,
    isWhitePreset,
    opts.stickerUrl,
    opts.imageUrl,
  );

  return canvas.toBuffer('image/png');
}

/**
 * Stacks 2+ quote cards vertically — oldest/topmost message first, most
 * recent last — into ONE continuous composite, drawn in a single pass on
 * one canvas (not N independently-rendered cards glued together
 * afterward). That matters for two things that broke under the old
 * glue-after-the-fact approach:
 *
 *  - Backdrop continuity: the whole composite gets exactly one background
 *    fill, painted once, in one direction. There is structurally no seam
 *    to mismatch, because there's nothing separate to mismatch against —
 *    every card's avatar-curve overlay reuses that same fill function, so
 *    its color at any (x, y) is always identical to whatever the backdrop
 *    already painted there. (Trade-off: since the fill is never reversed
 *    per-card anymore, a mirrored card's quote text sits over whichever
 *    end of the gradient naturally falls at that x — it no longer always
 *    gets the "rich" end the way the single quote card's text does.)
 *  - Melt direction: cards alternate orientation (1st/3rd/5th... normal
 *    avatar-left/quote-right; 2nd/4th/6th... mirrored avatar-right/
 *    quote-left) AND, on top of that, every card except the first also
 *    flips its curve mask vertically. That's what makes each avatar's
 *    "deep melt" concentrate toward the seam it shares with a neighbour
 *    (framing the shared watermark badge) instead of both cards melting
 *    toward the bottom regardless of the seam's actual position.
 *    (This two-seam framing is only validated for exactly 2 cards; a
 *    future .quote 3+ middle card sits between two seams and would need
 *    its own two-ended curve shape, not just a flip.)
 *
 * The quote/text column is widened (LAYOUT.STACK_QUOTE_WIDTH_MULTIPLIER)
 * on every card, while the avatar stays the same H x H size, so the
 * composite reads as a wide banner rather than stacked squares. No card
 * draws its own corner watermark; instead one centered "BOMBO PRODUCTIONS"
 * badge sits at each seam between cards.
 *
 * All cards must share one preset (opts.preset on cards[0] is treated as
 * the composite's theme).
 */
export async function renderStackedQuoteCard(cards: QuoteCardOptions[]): Promise<Buffer> {
  if (cards.length === 0) {
    throw new Error('renderStackedQuoteCard requires at least one card');
  }
  if (cards.length === 1) {
    return renderQuoteCard(cards[0]);
  }

  const { H, W, STACK_QUOTE_WIDTH_MULTIPLIER, STACK_HEIGHT_MULTIPLIER } = LAYOUT;
  const N = cards.length;
  const preset = GRADIENT_PRESETS[cards[0].preset ?? 'classic'];
  const isWhitePreset = (cards[0].preset ?? 'classic') === 'white';

  const stackCardWidth = H + (W - H) * STACK_QUOTE_WIDTH_MULTIPLIER;

  // Total composite height is capped at H*1.5 regardless of N (see
  // STACK_HEIGHT_MULTIPLIER) — each card's slot, and its square avatar,
  // shrinks to fit within that instead of the old H*N (no compression).
  const compH = H * STACK_HEIGHT_MULTIPLIER;
  const rowHeight = compH / N;
  const pfpWidth = rowHeight; // avatar stays square: side = this card's (now-compressed) slot height

  const SCALE = 2;
  const canvas = createCanvas(stackCardWidth * SCALE, compH * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // ONE continuous diagonal backdrop for the entire composite, painted once.
  // Every card's overlay below reuses this exact same fill (never reversed,
  // just re-anchored to its own row offset), so there is nothing for a seam
  // to mismatch against.
  fillPresetDiagonal(ctx, preset, stackCardWidth, compH, stackCardWidth, compH, 0);

  const avatarImgs = await Promise.all(cards.map((c) => loadImage(c.avatarUrl)));

  // Built once (the per-pixel curve computation is the expensive part) and
  // reused per card via cheap canvas-transform flips instead of recomputing.
  // `true` bakes in the seam-facing (bottom-edge) fade — only a stacked
  // composite has an internal seam to soften; a standalone card's top/bottom
  // are just the canvas edges.
  const baseMask = createCurveMask(stackCardWidth, pfpWidth, rowHeight, true);

  for (let i = 0; i < N; i++) {
    const mirror = i % 2 === 1;       // avatar-right/quote-left instead of avatar-left/quote-right
    const flipVertical = i > 0;       // this card's near-seam edge is its own top, not its own bottom
    const avatarX = mirror ? stackCardWidth - pfpWidth : 0;
    const rowYOffset = i * rowHeight;

    ctx.save();
    ctx.translate(0, rowYOffset);

    drawAvatar(ctx, avatarImgs[i], pfpWidth, avatarX, rowHeight);
    drawStackCurveOverlay(
      ctx, preset, stackCardWidth, pfpWidth, rowHeight, baseMask as any, mirror, flipVertical,
      stackCardWidth, compH, rowYOffset,
    );

    ctx.restore();
  }

  // One shared watermark badge centered at each internal seam, instead of
  // a per-card corner watermark.
  for (let i = 0; i < N - 1; i++) {
    const seamY = (i + 1) * rowHeight;
    drawWatermarkBadge(ctx, stackCardWidth / 2, seamY, isWhitePreset);
  }

  // Text/nickname/media drawn last (on top of every avatar+overlay), one
  // card at a time so each stays sequential against the shared context.
  for (let i = 0; i < N; i++) {
    const mirror = i % 2 === 1;
    ctx.save();
    ctx.translate(0, i * rowHeight);
    await drawText(
      ctx,
      cards[i].quoteText,
      cards[i].nickname,
      cards[i].username,
      stackCardWidth,
      pfpWidth,
      rowHeight,
      mirror,
      false, // per-card watermark stays off — the shared seam badge covers it
      isWhitePreset,
      cards[i].stickerUrl,
      cards[i].imageUrl,
    );
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

/**
 * Draws one card's avatar-curve overlay directly into a stacked composite.
 * Unlike drawColorCurveOverlay (used by the standalone single-card path),
 * this always fills with the SAME unreversed function of x that painted
 * the composite's shared backdrop — so its color matches that backdrop
 * exactly at every point, guaranteeing no visible seam regardless of which
 * card or how many share the canvas. `mirror` flips the mask horizontally
 * (avatar to the right edge); `flipVertical` additionally flips it so the
 * curve's "deep melt" end lands on whichever edge is nearest a seam.
 */
function drawStackCurveOverlay(
  mainCtx: SKRSContext2D,
  preset: (typeof GRADIENT_PRESETS)[PresetName],
  cardWidth: number,
  pfpWidth: number,
  rowHeight: number,
  baseMask: ReturnType<typeof createCanvas>,
  mirror: boolean,
  flipVertical: boolean,
  totalWidth: number,
  totalHeight: number,
  rowYOffset: number,
) {
  const overlay = createCanvas(cardWidth, rowHeight);
  const octx = overlay.getContext('2d');

  // Anchored to this row's absolute position so it reproduces exactly the
  // same diagonal gradient the shared backdrop painted there — same trick
  // the old plain x-based fillPreset call got "for free", just carried
  // over explicitly now that the fill also depends on y.
  fillPresetDiagonal(octx, preset, cardWidth, rowHeight, totalWidth, totalHeight, rowYOffset);

  const mask = transformMask(baseMask, cardWidth, rowHeight, mirror, flipVertical);
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask as any, 0, 0);

  mainCtx.drawImage(overlay as any, 0, 0);
}

/** Centered "BOMBO PRODUCTIONS" badge (text only, no border) — used at
 * stack seams, where a single shared watermark replaces each card's own
 * corner one. */
function drawWatermarkBadge(ctx: SKRSContext2D, centerX: number, centerY: number, isWhitePreset: boolean) {
  const label = 'BOMBO PRODUCTIONS';

  ctx.font = 'bold 18px ' + FONT_FALLBACK; // 40% smaller than the original 30px
  ctx.fillStyle = isWhitePreset ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, centerX, centerY + 1);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
}

/** Returns a new canvas with `source` flipped horizontally (flipX),
 * vertically (flipY), or both (180° rotation) — or the same source
 * untouched if neither is requested. Used to re-orient a curve mask
 * without recomputing its per-pixel boundary math from scratch. */
function transformMask(source: ReturnType<typeof createCanvas>, w: number, h: number, flipX: boolean, flipY: boolean) {
  if (!flipX && !flipY) return source;

  const out = createCanvas(w, h);
  const octx = out.getContext('2d');
  octx.translate(flipX ? w : 0, flipY ? h : 0);
  octx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  octx.drawImage(source as any, 0, 0);
  return out;
}

function drawBackground(ctx: SKRSContext2D, preset: (typeof GRADIENT_PRESETS)[PresetName], cardWidth: number) {
  const { H } = LAYOUT;
  fillPreset(ctx, preset, cardWidth, H);
}

/** Shared fill logic so the single-card background and the multi-quote
 * backdrop (which spans a taller/wider canvas) always match pixel-for-pixel.
 * Deliberately NOT reversed for mirrored cards — kept as a plain function of
 * x across the whole composite, so a mirrored card's backdrop colour still
 * matches its non-mirrored neighbour at the same x for the seam blend. */
function fillPreset(
  ctx: SKRSContext2D,
  preset: (typeof GRADIENT_PRESETS)[PresetName],
  w: number,
  h: number,
  reverse = false,
) {
  if (preset.type === 'solid') {
    ctx.fillStyle = rgb(preset.colors[0]);
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const grad = reverse ? ctx.createLinearGradient(w, 0, 0, 0) : ctx.createLinearGradient(0, 0, w, 0);
  preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), rgb(c)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Continuous diagonal backdrop for stacked quotes. A soft, straight band of
 * the preset's second-darkest colour runs from bottom-left to top-right;
 * the opposite diagonal stays at the darkest colour. Keeping the highlight
 * capped at a mid-tone protects white quote text from washing out.
 *
 * The gradient is anchored to the full composite, and each row overlay uses
 * the same absolute y offset so the colour field remains seamless.
 */
function fillPresetDiagonal(
  ctx: SKRSContext2D,
  preset: (typeof GRADIENT_PRESETS)[PresetName],
  w: number,
  h: number,
  totalW: number,
  totalH: number,
  yOffset: number,
) {
  if (preset.type === 'solid') {
    ctx.fillStyle = rgb(preset.colors[0]);
    ctx.fillRect(0, 0, w, h);
    return;
  }

  const colors = preset.colors; // ordered palest → darkest
  const darkest = colors[colors.length - 1];
  const highlight = colors[Math.max(0, colors.length - 2)];

  // Axis runs top-left → bottom-right; its midpoint's iso-line runs
  // bottom-left → top-right, matching the intended diagonal flow.
  const grad = ctx.createLinearGradient(0, -yOffset, totalW, totalH - yOffset);
  grad.addColorStop(0, rgb(darkest));
  grad.addColorStop(0.5, rgb(highlight));
  grad.addColorStop(1, rgb(darkest));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Builds the avatar-side fade mask assuming the avatar sits at the LEFT
 * edge of a `cardWidth`-wide canvas. Mirroring is handled by the caller
 * flipping the returned mask, rather than recomputing the boundary math —
 * the curve's own geometry (blend strengthens moving away from the avatar,
 * toward the quote text) is symmetric under that flip.
 */
function createCurveMask(cardWidth: number, pfpWidth: number, rowHeight: number, includeSeamFade: boolean) {
  const { CURVE_TOP_FRACTION, CURVE_BOTTOM_FRACTION, CURVE_BASE_ALPHA } = LAYOUT;

  const mask = createCanvas(cardWidth, rowHeight);
  const maskCtx = mask.getContext('2d');
  const pixels = maskCtx.createImageData(cardWidth, rowHeight);
  const data = pixels.data;

  // Smooth deterministic "noise" (sum of a few irrational-ratio sine
  // harmonics) — no RNG/seed state needed, just a wavy function of its
  // input. Used to perturb the curve boundary and, at smaller amplitude,
  // the alpha itself, so the avatar/text edge reads as a soft, slightly
  // wispy fade rather than a mathematically clean line.
  const noise = (v: number, phase: number) =>
    Math.sin(v * 0.013 + phase) * 0.5 +
    Math.sin(v * 0.031 + phase * 1.7) * 0.3 +
    Math.sin(v * 0.057 + phase * 2.3) * 0.2;

  const BOUNDARY_WAVE_PX = 34; // how far the boundary line waves left/right
  const MIN_FADE_PX = 115; // floor on fade width — the old curve narrowed to ~31px near the bottom, reading as a hard cut
  const TURBULENCE_STRENGTH = 0.03; // subtle alpha texture inside the transition band only — lowered so it doesn't add its own faint ridge now that CURVE_BASE_ALPHA is near zero

  // Calculate curve boundary using ease-in interpolation: the boundary
  // stays close to topX for most of the height and only swings toward
  // bottomX aggressively near the very bottom. (Previously ease-out, which
  // put the fast movement at the top instead — that's what produced the
  // "hooked" curve near the top of the avatar.)
  const boundaryX = (y: number) => {
    const topX = pfpWidth * CURVE_TOP_FRACTION;
    const bottomX = pfpWidth * CURVE_BOTTOM_FRACTION;
    const t = Math.max(0, Math.min(1, y / rowHeight));
    const eased = Math.pow(t, 3); // Ease-in cubic
    const base = topX + (bottomX - topX) * eased;
    return base + noise(y, 0) * BOUNDARY_WAVE_PX;
  };

  // Full opacity is reached exactly at the PFP edge.
  // The fade happens entirely within the PFP area, providing a smooth blend.
  const fullyOpaqueX = pfpWidth;

  // Seam-facing counterpart to boundaryX above, transposed onto the other
  // axis: instead of a boundary in x that varies with y, this is a fade
  // depth in y that varies with x, softening the avatar's BOTTOM edge
  // where it meets the next card's seam (the hard line the previous version
  // left behind). Only baked in for a stacked composite (includeSeamFade) —
  // a standalone card's top/bottom are the canvas edges, not a seam, so
  // they never need this. Whichever row actually needs the fade on its TOP
  // edge instead gets it by the caller flipping this whole mask vertically,
  // not by recomputing it here — only validated for the 2-card case; a
  // future middle card (seams on both edges) would need its own two-ended
  // version of this.
  const seamFadeDepth = (x: number) => {
    const nearDepth = rowHeight * (1 - CURVE_TOP_FRACTION);    // shallow, far from the text side
    const farDepth = rowHeight * (1 - CURVE_BOTTOM_FRACTION);  // deep, near the text side
    const t = Math.max(0, Math.min(1, x / pfpWidth));
    const eased = Math.pow(t, 3);
    const base = nearDepth + (farDepth - nearDepth) * eased;
    return Math.max(MIN_FADE_PX, base + noise(x, 3.1) * BOUNDARY_WAVE_PX);
  };

  for (let y = 0; y < rowHeight; y++) {
    // Clamp so the wave can never push the boundary within MIN_FADE_PX of
    // the PFP edge — otherwise on some rows the fade would collapse right
    // at x=fullyOpaqueX, leaving the avatar visibly peeking through the
    // color layer (a translucent "notch") instead of a clean full-opacity edge.
    const edge = Math.min(boundaryX(y), fullyOpaqueX - MIN_FADE_PX);
    const fadeWidth = Math.max(MIN_FADE_PX, fullyOpaqueX - edge);
    const distFromBottom = rowHeight - y;

    for (let x = 0; x < cardWidth; x++) {
      // Text-facing progress: 0 right at the boundary, 1 once fully past it.
      const nx = Math.max(0, Math.min(1, (x - edge) / fadeWidth));

      let u = nx;
      if (includeSeamFade && x < pfpWidth) {
        // Seam-facing progress, same idea transposed onto y.
        const fadePx = seamFadeDepth(x);
        const ny = Math.max(0, Math.min(1, (fadePx - distFromBottom) / fadePx));

        // Rounded-corner combine (p-norm) instead of a raw max(). A plain
        // max() of two independently-noisy 1D fades creates a visible
        // crease/glitch exactly where they cross — near the crossover,
        // tiny noise differences flip which one "wins," so the boundary
        // jitters instead of curving smoothly. This blends nx/ny into ONE
        // continuous field first, so the corner rounds off the way a
        // single quarter-circle-ish fade would, then everything below
        // (bias + smoothstep + wisp) runs once against that combined value.
        const CORNER_ROUNDING_POWER = 2.2;
        u = Math.min(1, Math.pow(Math.pow(nx, CORNER_ROUNDING_POWER) + Math.pow(ny, CORNER_ROUNDING_POWER), 1 / CORNER_ROUNDING_POWER));
      }

      // Apply bias for gradual strengthening, then smoothstep
      const biased = Math.pow(u, 1.5);
      const smooth = biased * biased * (3 - 2 * biased);

      // Light turbulence, faded out at the u=0/u=1 extremes (via the
      // smooth value itself) so it only textures the transition band and
      // never touches the fully-opaque or fully-transparent regions.
      const wisp = noise(x * 1.3 + y * 0.7, y * 0.01) * TURBULENCE_STRENGTH * (1 - Math.abs(smooth * 2 - 1));
      const alphaFrac = Math.max(0, Math.min(1, CURVE_BASE_ALPHA + (1 - CURVE_BASE_ALPHA) * smooth + wisp));
      const alpha = Math.round(alphaFrac * 255);

      const i = (y * cardWidth + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }

  maskCtx.putImageData(pixels, 0, 0);

  // Sanity check: ensure mask alpha at PFP edge is sufficiently opaque
  // to prevent hard seams. Sample a few rows near the middle.
  for (let y = Math.floor(rowHeight * 0.3); y <= Math.floor(rowHeight * 0.7); y += Math.floor(rowHeight * 0.2)) {
    const i = (y * cardWidth + (pfpWidth - 1)) * 4 + 3; // Alpha channel at x = pfpWidth - 1
    const alphaAtEdge = data[i];
    if (alphaAtEdge < 242) { // Require at least ~95% opacity at edge
      console.warn(`[QuoteRenderer] Mask alpha at PFP edge (${y}, ${pfpWidth - 1}) is ${alphaAtEdge}/255, expected ≥242`);
    }
  }

  return mask;
}

function drawAvatar(mainCtx: SKRSContext2D, avatarImg: Image, pfpWidth: number, avatarX: number, rowHeight: number) {
  // Cover exactly the pfpWidth x rowHeight PFP area without stretching the source.
  const scale = Math.max(pfpWidth / avatarImg.width, rowHeight / avatarImg.height);
  const drawWidth = avatarImg.width * scale;
  const drawHeight = avatarImg.height * scale;
  const cropX = (drawWidth - pfpWidth) / 2;
  const cropY = (drawHeight - rowHeight) / 2;

  mainCtx.save();
  mainCtx.beginPath();
  mainCtx.rect(avatarX, 0, pfpWidth, rowHeight);
  mainCtx.clip();
  mainCtx.drawImage(avatarImg, avatarX - cropX, -cropY, drawWidth, drawHeight);
  mainCtx.restore();
}

function drawColorCurveOverlay(
  mainCtx: SKRSContext2D,
  preset: (typeof GRADIENT_PRESETS)[PresetName],
  cardWidth: number,
  pfpWidth: number,
  mirror: boolean,
) {
  const { H } = LAYOUT;
  const overlay = createCanvas(cardWidth, H);
  const octx = overlay.getContext('2d');

  // Build the full-card colour layer first. It is deliberately ABOVE the
  // PFP; the mask only controls where this layer is allowed to cover it.
  // Unlike the shared backdrop fill (which must stay a plain function of x
  // for the stack-seam blend), THIS overlay is local to one card and gets
  // masked down to whichever side isn't the avatar. Without reversing it,
  // a mirrored card's mask would reveal the LEFT (pale) end of the
  // gradient behind the quote text instead of the RIGHT (rich) end that
  // a non-mirrored card shows — so flip the gradient here when mirrored.
  fillPreset(octx, preset, cardWidth, H, mirror);

  // The mask is always built assuming the avatar is at the LEFT edge;
  // mirrored cards just flip it, which moves the fade to the right edge
  // while keeping the same blend direction relative to the avatar.
  const mask = transformMask(createCurveMask(cardWidth, pfpWidth, H, false) as any, cardWidth, H, mirror, false);

  // Keep only the area on the far side of the curved boundary. The mask is
  // feathered, so its alpha falls gradually toward the PFP instead of making
  // a hard black edge. Because this overlay is drawn after the PFP, the
  // PFP naturally shows through more as the mask becomes transparent.
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask as any, 0, 0);

  mainCtx.drawImage(overlay as any, 0, 0);
}

async function drawText(
  ctx: SKRSContext2D,
  quote: string,
  nickname: string,
  username: string,
  cardWidth: number,
  pfpWidth: number,
  cardHeight: number,
  mirror: boolean,
  drawWatermark: boolean,
  isWhitePreset: boolean,
  stickerUrl?: string,
  imageUrl?: string,
) {
  const H = cardHeight;
  const {
    QUOTE_SAFE_LEFT_INSET,
    QUOTE_SAFE_RIGHT_INSET,
    QUOTE_SAFE_TOP_INSET,
    QUOTE_SAFE_BOTTOM_INSET,
    NICKNAME_LEFT_FRACTION,
    NICKNAME_RIGHT_FRACTION,
    WATERMARK_RIGHT_MARGIN,
    WATERMARK_BOTTOM_MARGIN,
    MAX_FONT_SIZE,
    STICKER_STANDALONE_WIDTH_FRACTION,
    STICKER_STACK_WIDTH_FRACTION,
    STICKER_STACK_HEIGHT_FRACTION,
    STICKER_STACK_GAP,
    IMAGE_STANDALONE_WIDTH_FRACTION,
    IMAGE_STACK_WIDTH_FRACTION,
    IMAGE_STACK_HEIGHT_FRACTION,
    IMAGE_STACK_GAP,
  } = LAYOUT;

  // The quote/text column occupies whichever side the avatar doesn't.
  const quoteAreaX0 = mirror ? 0 : pfpWidth;
  const quoteAreaX1 = mirror ? cardWidth - pfpWidth : cardWidth;
  const quoteAreaWidth = quoteAreaX1 - quoteAreaX0;

  // Insets are defined relative to the avatar boundary, not literal left/
  // right, so they carry over correctly under mirroring: the inset nearest
  // the avatar stays nearest the avatar either way.
  const nearAvatarInset = QUOTE_SAFE_LEFT_INSET;
  const farInset = QUOTE_SAFE_RIGHT_INSET;

  const quoteLeft = mirror
    ? quoteAreaX0 + quoteAreaWidth * farInset
    : quoteAreaX0 + quoteAreaWidth * nearAvatarInset;
  const quoteRight = mirror
    ? quoteAreaX1 - quoteAreaWidth * nearAvatarInset
    : quoteAreaX1 - quoteAreaWidth * farInset;
  const quoteTop = H * QUOTE_SAFE_TOP_INSET;
  const quoteBottom = H * QUOTE_SAFE_BOTTOM_INSET;
  const quoteWidth = quoteRight - quoteLeft;
  const quoteHeight = quoteBottom - quoteTop;

  // Center used by nickname/username/separator — always the full quote
  // area, regardless of whether a sticker is splitting it.
  const fullAreaCenterX = quoteLeft + quoteWidth / 2;

  const hasText = quote.trim().length > 0;

  // A quote uses at most one piece of media: a sticker takes priority if
  // present (matches how Discord treats sticker messages as having no
  // other attachments), otherwise the message's image attachment is used.
  // Each kind has its own sizing constants so they can be tuned independently.
  const mediaUrl = stickerUrl ?? imageUrl;
  const mediaKind: 'sticker' | 'image' | null = stickerUrl ? 'sticker' : imageUrl ? 'image' : null;

  const standaloneWidthFraction =
    mediaKind === 'image' ? IMAGE_STANDALONE_WIDTH_FRACTION : STICKER_STANDALONE_WIDTH_FRACTION;
  const stackWidthFraction =
    mediaKind === 'image' ? IMAGE_STACK_WIDTH_FRACTION : STICKER_STACK_WIDTH_FRACTION;
  const stackHeightFraction =
    mediaKind === 'image' ? IMAGE_STACK_HEIGHT_FRACTION : STICKER_STACK_HEIGHT_FRACTION;
  const stackGap = mediaKind === 'image' ? IMAGE_STACK_GAP : STICKER_STACK_GAP;

  // If there's media, try to load it before laying anything out, since its
  // presence (and load success) determines how the quote area splits.
  let mediaImg: Image | null = null;
  if (mediaUrl) {
    try {
      mediaImg = await loadImage(mediaUrl);
    } catch (error) {
      console.error(`[QuoteRenderer] Failed to load ${mediaKind} image:`, error);
    }
  }

  // Text region defaults to the full quote area. When media is present
  // alongside text, the quote area splits vertically: text keeps the full
  // width up top, media sits centered in a band below it. Media with no
  // text is centered and capped to a smaller width of its own.
  let textAreaLeft = quoteLeft;
  let textAreaWidth = quoteWidth;
  let textAreaTop = quoteTop;
  let textAreaHeight = quoteHeight;

  if (mediaImg) {
    if (hasText) {
      // Media + text: stacked — media centered in a band at the
      // bottom of the quote area, text keeps the full-width remainder above it.
      const mediaAreaHeight = quoteHeight * stackHeightFraction;
      const mediaAreaWidth = quoteWidth * stackWidthFraction;
      const mediaAreaTop = quoteBottom - mediaAreaHeight;
      const mediaAreaLeft = quoteLeft + (quoteWidth - mediaAreaWidth) / 2;

      drawMedia(ctx, mediaImg, mediaAreaLeft, mediaAreaTop, mediaAreaWidth, mediaAreaHeight);

      textAreaTop = quoteTop;
      textAreaHeight = mediaAreaTop - stackGap - quoteTop;
      textAreaLeft = quoteLeft;
      textAreaWidth = quoteWidth;
    } else {
      // Media-only: centered in the quote area, and sized down (30%
      // smaller than a full-width sticker/image) so it doesn't dominate the card.
      const mediaAreaWidth = quoteWidth * standaloneWidthFraction;
      const mediaAreaLeft = quoteLeft + (quoteWidth - mediaAreaWidth) / 2;

      drawMedia(ctx, mediaImg, mediaAreaLeft, quoteTop, mediaAreaWidth, quoteHeight);
      textAreaWidth = 0;
    }
  }

  if (hasText && textAreaWidth > 0) {
    // Reduce usable width by 10% and center it in the text area
    const usableWidth = textAreaWidth * 0.9;
    const safeBoxCenterX = textAreaLeft + textAreaWidth / 2;

    ctx.fillStyle = isWhitePreset ? '#000000' : '#ffffff';
    ctx.textBaseline = 'middle';
    if (!isWhitePreset) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.32)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
    }

    // Segment the text for emoji support
    const segments = segmentText(quote);

    // Preload custom emoji images (must be done before wrapping)
    await preloadCustomEmojis(segments);

    const { fontSize, lines } = fitFontSize(ctx, segments, usableWidth, textAreaHeight, MAX_FONT_SIZE);
    ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
    const lineHeight = fontSize * 1.25;
    const blockHeight = lines.length * lineHeight;

    // Vertically center quote text within its text area, then nudge lower
    const safeBoxCenterY = textAreaTop + textAreaHeight / 2;
    let y = safeBoxCenterY - blockHeight / 2 + 20;

    for (const line of lines) {
      // Calculate line width for proper centering
      const lineWidth = measureLineWidth(ctx, line, fontSize);
      const lineStartX = safeBoxCenterX - lineWidth / 2;

      let xOffset = 0;
      for (const segment of line) {
        if (segment.type === 'text') {
          ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
          ctx.fillText(segment.content, lineStartX + xOffset, y);
          xOffset += ctx.measureText(segment.content).width;
        } else if (segment.type === 'emoji') {
          ctx.font = `${fontSize}px ${EMOJI_FONT}`;
          ctx.fillText(segment.content, lineStartX + xOffset, y);
          xOffset += ctx.measureText(segment.content).width;
        } else if (segment.type === 'customEmoji') {
          const emojiImage = getCustomEmojiFromCache(segment);
          if (emojiImage) {
            const emojiSize = fontSize * 1.15;
            ctx.drawImage(emojiImage, lineStartX + xOffset, y - emojiSize / 2, emojiSize, emojiSize);
            xOffset += emojiSize;
          } else {
            // Fallback to rendering literal :name: text
            ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
            const fallbackText = `:${segment.name}:`;
            ctx.fillText(fallbackText, lineStartX + xOffset, y);
            xOffset += ctx.measureText(fallbackText).width;
          }
        }
      }
      y += lineHeight;
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Nickname/username block positioned below quote safe area
  const nicknameLeft = quoteAreaX0 + quoteAreaWidth * NICKNAME_LEFT_FRACTION;
  const nicknameRight = quoteAreaX0 + quoteAreaWidth * NICKNAME_RIGHT_FRACTION;
  const nicknameY = quoteBottom + 20;
  const separatorWidth = nicknameRight - nicknameLeft;

  // Center separator line around the full quote area, unaffected by any
  // sticker split above it.
  ctx.strokeStyle = isWhitePreset ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(fullAreaCenterX - separatorWidth / 2, nicknameY);
  ctx.lineTo(fullAreaCenterX + separatorWidth / 2, nicknameY);
  ctx.stroke();

  // Nickname block sits toward the outer edge of its quote area, away from
  // the shared center seam. Mirrored cards use the opposite side.
  const nicknameCenterX = mirror
    ? quoteAreaX0 + quoteAreaWidth * 0.28
    : quoteAreaX0 + quoteAreaWidth * 0.72;
  ctx.textAlign = 'center';
  ctx.font = `26px ${FONT_FALLBACK}`;
  ctx.fillStyle = isWhitePreset ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
  ctx.fillText(nickname, nicknameCenterX, nicknameY + 32);

  ctx.font = `20px ${FONT_FALLBACK}`;
  ctx.fillStyle = isWhitePreset ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)';
  ctx.fillText(`@${username}`, nicknameCenterX, nicknameY + 62);
  ctx.textAlign = 'left'; // Reset to default

  if (drawWatermark) {
    // Watermark in bottom-right corner of the card (single quotes only —
    // stacked composites draw one shared badge at each seam instead).
    ctx.font = 'bold 15px ' + FONT_FALLBACK; // 10% bigger than the original 14px
    ctx.fillStyle = isWhitePreset ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('BOMBO PRODUCTIONS', cardWidth - WATERMARK_RIGHT_MARGIN, H - WATERMARK_BOTTOM_MARGIN);
    ctx.textAlign = 'left'; // Reset to default
    ctx.textBaseline = 'middle'; // Reset to default
  }
}

/**
 * Draws a sticker or image into a box using object-fit: contain (no
 * cropping, no stretching), centered within that box.
 */
function drawMedia(
  ctx: SKRSContext2D,
  img: Image,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
) {
  const scale = Math.min(boxW / img.width, boxH / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const x = boxX + (boxW - drawWidth) / 2;
  const y = boxY + (boxH - drawHeight) / 2;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
}

/**
 * Picks the largest font size (down to minSize) that fits the segments
 * within maxWidth AND maxHeight, wrapping as needed. The line cap is
 * derived from maxHeight rather than a fixed constant, so a text-only
 * quote (tall textAreaHeight) allows more lines than a text+media
 * stacked quote (short textAreaHeight) gets to keep automatically.
 *
 * If nothing fits even at minSize, the wrapped text is hard-truncated to
 * however many lines actually fit the box, with the last line clipped and
 * an ellipsis appended — never left to overflow past the box.
 */
function fitFontSize(
  ctx: SKRSContext2D, segments: Segment[], maxWidth: number, maxHeight: number,
  maxSize: number, minSize = 28,
): { fontSize: number; lines: Segment[][] } {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${size}px ${FONT_FALLBACK}`;
    const lineHeight = size * 1.25;
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
    const lines = wrapText(ctx, segments, maxWidth, size);
    const widest = Math.max(...lines.map(line => measureLineWidth(ctx, line, size)));
    if (lines.length <= maxLines && widest <= maxWidth) return { fontSize: size, lines };
  }

  // Nothing fit even at minSize. Clamp to however many lines actually fit
  // the available height and truncate the last visible line with an
  // ellipsis, instead of drawing every wrapped line regardless of box size.
  ctx.font = `${minSize}px ${FONT_FALLBACK}`;
  const lineHeight = minSize * 1.25;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  let lines = wrapText(ctx, segments, maxWidth, minSize);

  if (lines.length > maxLines) {
    console.warn(`[QuoteRenderer] Quote text truncated: ${lines.length} lines wrapped, only ${maxLines} fit the box`);
    lines = truncateToMaxLines(ctx, lines, maxLines, maxWidth, minSize);
  }

  return { fontSize: minSize, lines };
}

/**
 * Keeps only the first maxLines lines, trimming the last one (character by
 * character, dropping trailing segments as needed) until "<line> + …" fits
 * within maxWidth, then appends the ellipsis. Guarantees the returned block
 * never exceeds maxLines regardless of how much text was passed in.
 */
function truncateToMaxLines(
  ctx: SKRSContext2D,
  lines: Segment[][],
  maxLines: number,
  maxWidth: number,
  fontSize: number,
): Segment[][] {
  const kept = lines.slice(0, maxLines);
  const ellipsis = '…';

  ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
  const ellipsisWidth = ctx.measureText(ellipsis).width;

  let lastLine = [...kept[maxLines - 1]];

  while (lastLine.length > 0 && measureLineWidth(ctx, lastLine, fontSize) + ellipsisWidth > maxWidth) {
    const last = lastLine[lastLine.length - 1];
    if (last.type === 'text' && last.content.length > 1) {
      lastLine[lastLine.length - 1] = { ...last, content: last.content.slice(0, -1) };
    } else {
      lastLine.pop();
    }
  }

  // Drop trailing whitespace so the ellipsis doesn't float away from the text
  const trailing = lastLine[lastLine.length - 1];
  if (trailing?.type === 'text') {
    lastLine[lastLine.length - 1] = { ...trailing, content: trailing.content.replace(/\s+$/, '') };
  }

  lastLine.push({ type: 'text', content: ellipsis });
  kept[maxLines - 1] = lastLine;
  return kept;
}

function wrapText(ctx: SKRSContext2D, segments: Segment[], maxWidth: number, fontSize: number): Segment[][] {
  const lines: Segment[][] = [];
  let currentLine: Segment[] = [];
  let currentWidth = 0;

  const flush = () => {
    if (currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }
  };

  for (const segment of segments) {
    const segmentWidth = measureSegmentWidth(ctx, segment, fontSize);

    // If segment alone exceeds max width, we can't split it, so start new line
    if (segmentWidth > maxWidth) {
      flush();
      currentLine.push(segment);
      currentWidth = segmentWidth;
      flush(); // Force this oversized segment to its own line
      continue;
    }

    // Try to add to current line
    if (currentWidth + segmentWidth <= maxWidth) {
      currentLine.push(segment);
      currentWidth += segmentWidth;
    } else {
      // Start new line
      flush();
      currentLine.push(segment);
      currentWidth = segmentWidth;
    }
  }

  flush();

  // Regression guard: validate that all lines fit within maxWidth
  for (let i = 0; i < lines.length; i++) {
    const lineWidth = measureLineWidth(ctx, lines[i], fontSize);
    if (lineWidth > maxWidth) {
      console.error(`[QuoteRenderer] Line ${i} exceeds maxWidth: ${lineWidth} > ${maxWidth}`);
      // Log the line content for debugging
      const lineContent = lines[i].map(s => s.type === 'text' ? s.content : `[${s.type}]`).join('');
      console.error(`[QuoteRenderer] Line content: "${lineContent}"`);
    }
  }

  return lines;
}

function measureSegmentWidth(ctx: SKRSContext2D, segment: Segment, fontSize: number): number {
  if (segment.type === 'text') {
    ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
    return ctx.measureText(segment.content).width;
  } else if (segment.type === 'emoji') {
    ctx.font = `${fontSize}px ${EMOJI_FONT}`;
    return ctx.measureText(segment.content).width;
  } else if (segment.type === 'customEmoji') {
    // Custom emoji images are rendered at fontSize * 1.15 square
    return fontSize * 1.15;
  }
  return 0;
}

function measureLineWidth(ctx: SKRSContext2D, line: Segment[], fontSize: number): number {
  return line.reduce((total, segment) => total + measureSegmentWidth(ctx, segment, fontSize), 0);
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;