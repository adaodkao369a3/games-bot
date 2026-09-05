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

export async function renderQuoteCard(opts: QuoteCardOptions): Promise<Buffer> {
  const { W, H } = LAYOUT;
  const preset = GRADIENT_PRESETS[opts.preset ?? 'classic'];

  const SCALE = 2;
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Everything is rendered directly into the 1575x630 card. The canvas itself
  // clips anything outside the card, so the PFP can never create an external
  // circle/shadow/overflow beyond the quote-card bounds.
  drawBackground(ctx, preset);

  const avatarImg = await loadImage(opts.avatarUrl);
  const pfpWidth = H;

  // The PFP always owns exactly the left 40% of the card. Discord avatars are
  // normally square; object-fit: cover keeps that 630x630 footprint even if
  // an unexpected non-square source is returned.
  drawAvatar(ctx, avatarImg, pfpWidth);

  // The colour layer is full-card and sits ABOVE the PFP. Its left edge is a
  // single broad curve that cuts into the PFP near the top/bottom and reaches
  // the 50% boundary around the vertical centre. This is the actual visual
  // overlap requested by the quote-card design.
  drawColorCurveOverlay(ctx, preset);

  await drawText(ctx, opts.quoteText, opts.nickname, opts.username, pfpWidth, opts.stickerUrl, opts.imageUrl);

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

function createCurveMask() {
  const {
    W,
    H,
    CURVE_TOP_FRACTION,
    CURVE_BOTTOM_FRACTION,
    CURVE_BASE_ALPHA,
  } = LAYOUT;

  const mask = createCanvas(W, H);
  const maskCtx = mask.getContext('2d');
  const pixels = maskCtx.createImageData(W, H);
  const data = pixels.data;

  const pfpWidth = H;

  // Calculate curve boundary using ease-out interpolation
  // Fast horizontal movement near top, flattening out near bottom
  const boundaryX = (y: number) => {
    const topX = pfpWidth * CURVE_TOP_FRACTION;
    const bottomX = pfpWidth * CURVE_BOTTOM_FRACTION;
    const t = Math.max(0, Math.min(1, y / H));
    const eased = 1 - Math.pow(1 - t, 3); // Ease-out cubic
    return topX + (bottomX - topX) * eased;
  };

  // Full opacity is reached exactly at the PFP edge (630px).
  // The fade now happens entirely within the PFP area, providing a smooth blend.
  const fullyOpaqueX = pfpWidth;

  for (let y = 0; y < H; y++) {
    const edge = boundaryX(y);
    const fadeWidth = Math.max(1, fullyOpaqueX - edge);

    for (let x = 0; x < W; x++) {
      // The curve starts with base alpha and strengthens moving right
      const u = Math.max(0, Math.min(1, (x - edge) / fadeWidth));

      // Apply bias for gradual strengthening, then smoothstep
      const biased = Math.pow(u, 1.5);
      const smooth = biased * biased * (3 - 2 * biased);
      const alpha = Math.round((CURVE_BASE_ALPHA + (1 - CURVE_BASE_ALPHA) * smooth) * 255);

      const i = (y * W + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
  }

  maskCtx.putImageData(pixels, 0, 0);

  // Sanity check: ensure mask alpha at PFP edge is sufficiently opaque
  // to prevent hard seams. Sample a few rows near the middle.
  for (let y = Math.floor(H * 0.3); y <= Math.floor(H * 0.7); y += Math.floor(H * 0.2)) {
    const i = (y * W + (pfpWidth - 1)) * 4 + 3; // Alpha channel at x = pfpWidth - 1
    const alphaAtEdge = data[i];
    if (alphaAtEdge < 242) { // Require at least ~95% opacity at edge
      console.warn(`[QuoteRenderer] Mask alpha at PFP edge (${y}, ${pfpWidth - 1}) is ${alphaAtEdge}/255, expected ≥242`);
    }
  }

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

async function drawText(
  ctx: SKRSContext2D,
  quote: string,
  nickname: string,
  username: string,
  edgeX: number,
  stickerUrl?: string,
  imageUrl?: string,
) {
  const {
    H,
    W,
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

  const rightColumnWidth = W - H; // 945px for 60% of card
  const pfpWidth = H; // 630px

  // Calculate quote safe area bounds
  const quoteLeft = pfpWidth + rightColumnWidth * QUOTE_SAFE_LEFT_INSET;
  const quoteRight = W - rightColumnWidth * QUOTE_SAFE_RIGHT_INSET;
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
  // Each kind has its own sizing constants so they can be tuned separately.
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

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';

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
  }

  // Nickname/username block positioned below quote safe area
  const nicknameLeft = pfpWidth + rightColumnWidth * NICKNAME_LEFT_FRACTION;
  const nicknameRight = pfpWidth + rightColumnWidth * NICKNAME_RIGHT_FRACTION;
  const nicknameY = quoteBottom + 20;
  const separatorWidth = nicknameRight - nicknameLeft;

  // Center separator line around the full quote area, unaffected by any
  // sticker split above it.
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.moveTo(fullAreaCenterX - separatorWidth / 2, nicknameY);
  ctx.lineTo(fullAreaCenterX + separatorWidth / 2, nicknameY);
  ctx.stroke();

  // Center nickname and username at fullAreaCenterX
  ctx.textAlign = 'center';
  ctx.font = `26px ${FONT_FALLBACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(nickname, fullAreaCenterX, nicknameY + 32);

  ctx.font = `20px ${FONT_FALLBACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`@${username}`, fullAreaCenterX, nicknameY + 62);
  ctx.textAlign = 'left'; // Reset to default

  // Watermark in bottom-right corner
  ctx.font = 'bold 14px ' + FONT_FALLBACK;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('BOMBO PRODUCTIONS', W - WATERMARK_RIGHT_MARGIN, H - WATERMARK_BOTTOM_MARGIN);
  ctx.textAlign = 'left'; // Reset to default
  ctx.textBaseline = 'middle'; // Reset to default
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