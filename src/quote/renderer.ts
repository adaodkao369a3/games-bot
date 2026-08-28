import { createCanvas, loadImage, Image, SKRSContext2D, GlobalFonts } from '@napi-rs/canvas';
import { join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { LAYOUT, GRADIENT_PRESETS, PresetName, FONT_FALLBACK } from './config';

const PROJECT_ROOT = cwd();

const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Butler-Free-Bd.otf');

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

export interface QuoteCardOptions {
  avatarUrl: string;
  quoteText: string;
  nickname: string;
  username: string;
  preset?: PresetName;
}

export async function renderQuoteCard(opts: QuoteCardOptions): Promise<Buffer> {
  const { W, H } = LAYOUT;
  const preset = GRADIENT_PRESETS[opts.preset ?? 'classic'];

  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Everything is rendered directly into the 1260x630 card. The canvas itself
  // clips anything outside the card, so the PFP can never create an external
  // circle/shadow/overflow beyond the quote-card bounds.
  drawBackground(ctx, preset);

  const avatarImg = await loadImage(opts.avatarUrl);
  const pfpWidth = H;

  // The PFP always owns exactly the left 50% of the card. Discord avatars are
  // normally square; object-fit: cover keeps that 630x630 footprint even if
  // an unexpected non-square source is returned.
  drawAvatar(ctx, avatarImg, pfpWidth);

  // The colour layer is full-card and sits ABOVE the PFP. Its left edge is a
  // single broad curve that cuts into the PFP near the top/bottom and reaches
  // the 50% boundary around the vertical centre. This is the actual visual
  // overlap requested by the quote-card design.
  drawColorCurveOverlay(ctx, preset);

  drawText(ctx, opts.quoteText, opts.nickname, opts.username, pfpWidth);

  return canvas.toBuffer('image/png');
}

function drawBackground(ctx: SKRSContext2D, preset: (typeof GRADIENT_PRESETS)[PresetName]) {
  const { W, H } = LAYOUT;
  if (preset.type === 'solid') {
    ctx.fillStyle = rgb(preset.colors[0]);
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), rgb(c)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function fillPreset(ctx: SKRSContext2D, preset: (typeof GRADIENT_PRESETS)[PresetName]) {
  const { W, H } = LAYOUT;
  if (preset.type === 'solid') {
    ctx.fillStyle = rgb(preset.colors[0]);
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), rgb(c)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function createCurveMask() {
  const {
    W,
    H,
    CURVE_TOP_X,
    CURVE_CENTER_SHIFT_X,
    CURVE_BOTTOM_X,
    CURVE_FADE_START_AFTER_PFP,
  } = LAYOUT;

  const mask = createCanvas(W, H);
  const pixels = mask.getContext('2d').createImageData(W, H);
  const data = pixels.data;

  // This is a transparency mask for the colour veil ABOVE the PFP.
  // The curve itself is never stroked or blurred. It only describes the
  // point where the colour veil has 0% opacity.
  //
  // Shape: top starts at ~80% of the PFP, the middle is pushed to the RIGHT
  // without becoming a full circle, and the bottom finishes at ~90% of the PFP.
  const boundaryX = (y: number) => {
    const t = Math.max(0, Math.min(1, y / H));

    // A single cubic interpolation between the two PFP-side endpoints.
    // The smooth middle bulge shifts the centre right without moving either
    // endpoint, so the lower/upper ends stay where they are independently.
    const cubic = t * t * t;
    const centreBulge = 4 * t * (1 - t);

    return CURVE_TOP_X
      + (CURVE_BOTTOM_X - CURVE_TOP_X) * cubic
      + CURVE_CENTER_SHIFT_X * centreBulge;
  };

  const pfpWidth = H;

  // The colour remains fully opaque on the text side until 30% of the PFP
  // width AFTER the PFP ends. From that point, opacity falls continuously
  // LEFTWARD all the way to the curved boundary.
  //
  // 630px PFP + (630 * 0.30) = 819px. This is deliberately NOT a short
  // feather. The entire region between the curve and 819px participates in
  // the fade, so the PFP blends naturally into the text panel.
  const fullyOpaqueX = pfpWidth * (1 + CURVE_FADE_START_AFTER_PFP);

  for (let y = 0; y < H; y++) {
    const edge = boundaryX(y);
    const fadeWidth = Math.max(1, fullyOpaqueX - edge);

    for (let x = 0; x < W; x++) {
      // 0 at the curve, 1 at the fully-opaque point. The same calculation is
      // used for every row, but each row has its own curved edge position.
      const u = Math.max(0, Math.min(1, (x - edge) / fadeWidth));

      // Smoothstep gives a genuinely soft continuous fade with no line at the
      // curve and no abrupt opacity jump anywhere in the transition.
      // Bias the fade slightly toward the colour side so the PFP does not
      // stay too dark while the transition is still continuous.
      const eased = Math.pow(u, 0.72);
      const smooth = eased * eased * (3 - 2 * eased);
      const alpha = Math.round(smooth * 255);

      const i = (y * W + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }

  mask.getContext('2d').putImageData(pixels, 0, 0);
  return mask;
}

function drawAvatar(mainCtx: SKRSContext2D, avatarImg: Image, pfpWidth: number) {
  const { H } = LAYOUT;

  // Cover exactly the 630x630 PFP area without stretching the source.
  const scale = Math.max(pfpWidth / avatarImg.width, H / avatarImg.height);
  const drawWidth = avatarImg.width * scale;
  const drawHeight = avatarImg.height * scale;
  const cropX = (drawWidth - pfpWidth) / 2;
  const cropY = (drawHeight - H) / 2;

  mainCtx.save();
  mainCtx.beginPath();
  mainCtx.rect(0, 0, pfpWidth, H);
  mainCtx.clip();
  mainCtx.drawImage(avatarImg, -cropX, -cropY, drawWidth, drawHeight);
  mainCtx.restore();
}

function drawColorCurveOverlay(
  mainCtx: SKRSContext2D,
  preset: (typeof GRADIENT_PRESETS)[PresetName],
) {
  const { W, H } = LAYOUT;
  const overlay = createCanvas(W, H);
  const octx = overlay.getContext('2d');
  const mask = createCurveMask();

  // Build the full 1260px colour layer first. It is deliberately ABOVE the
  // PFP; the mask only controls where this layer is allowed to cover it.
  if (preset.type === 'solid') {
    octx.fillStyle = rgb(preset.colors[0]);
  } else {
    const grad = octx.createLinearGradient(0, 0, W, 0);
    preset.colors.forEach((c, i) =>
      grad.addColorStop(i / (preset.colors.length - 1), rgb(c)),
    );
    octx.fillStyle = grad;
  }
  octx.fillRect(0, 0, W, H);

  // Keep only the area to the RIGHT of the curved boundary. The mask is
  // feathered, so its alpha falls gradually toward the PFP instead of making
  // a hard black edge. Because this overlay is drawn after the PFP, the
  // PFP naturally shows through more as the mask becomes transparent.
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(mask, 0, 0);

  mainCtx.drawImage(overlay, 0, 0);
}

function drawText(ctx: SKRSContext2D, quote: string, nickname: string, username: string, edgeX: number) {
  const { TEXT_X, MAX_FONT_SIZE, MAX_TEXT_BLOCK_WIDTH, H, W } = LAYOUT;
  const textX = Math.max(TEXT_X, edgeX + 70);
  const maxWidth = Math.min(MAX_TEXT_BLOCK_WIDTH, W - textX - 40);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';

  const fontSize = fitFontSize(ctx, quote, maxWidth, MAX_FONT_SIZE);
  ctx.font = `${fontSize}px ${FONT_FALLBACK}`;
  const lines = wrapText(ctx, quote, maxWidth);
  const lineHeight = fontSize * 1.25;
  const blockHeight = lines.length * lineHeight;
  let y = H / 2 - blockHeight / 2 - 20;
  for (const line of lines) {
    ctx.fillText(line, textX, y);
    y += lineHeight;
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(textX, y + 10);
  ctx.lineTo(textX + Math.min(maxWidth, 220), y + 10);
  ctx.stroke();

  ctx.font = `26px ${FONT_FALLBACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(nickname, textX, y + 42);

  ctx.font = `20px ${FONT_FALLBACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`@${username}`, textX, y + 72);
}

function fitFontSize(
  ctx: SKRSContext2D, text: string, maxWidth: number,
  maxSize: number, minSize = 28, maxLines = 4,
): number {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${size}px ${FONT_FALLBACK}`;
    const lines = wrapText(ctx, text, maxWidth);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (lines.length <= maxLines && widest <= maxWidth) return size;
  }
  return minSize;
}

function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  const flush = () => { if (current) { lines.push(current); current = ''; } };

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }
    flush();
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
    } else {
      const broken = breakLongWord(ctx, word, maxWidth);
      lines.push(...broken.slice(0, -1));
      current = broken[broken.length - 1] ?? '';
    }
  }
  flush();
  return lines;
}

function breakLongWord(ctx: SKRSContext2D, word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const ch of word) {
    const test = cur + ch;
    if (cur && ctx.measureText(test).width > maxWidth) {
      parts.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) parts.push(cur);
  return parts;
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`;
