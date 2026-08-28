import { createCanvas, loadImage, Image, SKRSContext2D, GlobalFonts } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import { LAYOUT, GRADIENT_PRESETS, PresetName, FONT_FALLBACK } from './config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts — same pattern as src/wordle/wordleRenderer.ts.
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Butler-Free-Bd.otf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Butler');
    if (success) {
      fontLoaded = true;
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
  nickname: string;   // server nickname (or username fallback) — primary author line
  username: string;   // "@handle" line
  preset?: PresetName;
}

export async function renderQuoteCard(opts: QuoteCardOptions): Promise<Buffer> {
  const { W, H } = LAYOUT;
  const preset = GRADIENT_PRESETS[opts.preset ?? 'classic'];

  // Render at 2x internally for crisper text/edges, downscale on export.
  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  drawBackground(ctx, preset);

  const avatarImg = await loadImage(opts.avatarUrl);

  // Compute the avatar's real right edge once (contain-scaled to full card
  // height, zero crop) and thread it through both the mask geometry and the
  // text positioning, instead of each function reading a fixed BOUNDARY_X.
  const edgeX = H * (avatarImg.width / avatarImg.height);

  await drawMaskedAvatar(ctx, avatarImg, edgeX);
  drawText(ctx, opts.quoteText, opts.nickname, opts.username, edgeX);

  return canvas.toBuffer('image/png');
}

function drawBackground(ctx: SKRSContext2D, preset: (typeof GRADIENT_PRESETS)[PresetName]) {
  const { W, H } = LAYOUT;
  if (preset.type === 'solid') {
    ctx.fillStyle = rgb(preset.colors[0]);
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // Reverted back to the original left→right direction — the flipped
  // version from the previous round didn't actually match the desired
  // look; this is the direction that renders correctly.
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  preset.colors.forEach((c, i) => grad.addColorStop(i / (preset.colors.length - 1), rgb(c)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function buildFadeMask(ctx: SKRSContext2D, edgeX: number) {
  const { FADE_SOFTEN, FADE_SWEEP, CIRCLE_R, H, STOPS } = LAYOUT;

  // Circle center sits off-canvas to the LEFT (in the avatar's own region),
  // so the visible arc near the avatar's edge sweeps to the RIGHT — a
  // closing-parenthesis shape (`pfp ) quote`) that bulges away from the
  // avatar and into the text zone, per the user's diagram.
  const centerX = edgeX - CIRCLE_R;
  const centerY = H / 2;
  const r0 = CIRCLE_R - FADE_SOFTEN; // closer to center → still inside the avatar zone
  const r1 = CIRCLE_R + FADE_SWEEP;  // farther from center → out into the text zone

  const grad = ctx.createRadialGradient(centerX, centerY, r0, centerX, centerY, r1);
  // With the center now on the avatar's side, the near-center stop (r0) is
  // the opaque/avatar side, and the far stop (r1) is the transparent/text
  // side — the reverse polarity of the old center-right setup.
  for (let i = 0; i <= STOPS; i++) {
    const t = i / STOPS;
    const eased = t * t * (3 - 2 * t); // smoothstep
    const alpha = 1 - eased;
    grad.addColorStop(t, `rgba(255,255,255,${alpha})`);
  }
  return grad;
}

async function drawMaskedAvatar(mainCtx: SKRSContext2D, avatarImg: Image, edgeX: number) {
  const { W, H } = LAYOUT;
  const off = createCanvas(W, H);
  const octx = off.getContext('2d');
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';

  // "Contain" scale the avatar to the full card height with zero crop —
  // flush against the left corner — instead of cover-cropping it into a
  // fixed box. edgeX (== the drawn width) is where the avatar's real right
  // edge lands.
  octx.drawImage(avatarImg, 0, 0, edgeX, H);

  octx.globalCompositeOperation = 'destination-in';
  octx.fillStyle = buildFadeMask(octx, edgeX);
  octx.fillRect(0, 0, W, H);

  mainCtx.drawImage(off, 0, 0);
}

function drawText(ctx: SKRSContext2D, quote: string, nickname: string, username: string, edgeX: number) {
  const { FADE_SOFTEN, FADE_SWEEP, MAX_FONT_SIZE, MAX_TEXT_BLOCK_WIDTH, H, W } = LAYOUT;
  // Text starts overlapping the tail of the curve (not flush after it),
  // and shifts right along with the curve's new, dynamic position.
  const textX = edgeX + FADE_SOFTEN + FADE_SWEEP * 0.35;
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

  // Nickname (primary line) and @username (smaller, muted line) rendered
  // separately, instead of a single combined "authorLabel" string.
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
      // word alone is wider than the column — hard-break by character
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
