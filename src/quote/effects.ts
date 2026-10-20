import { loadImage, Image, SKRSContext2D } from '@napi-rs/canvas';
import { existsSync, readdirSync } from 'fs';
import { join, parse } from 'path';
import { cwd } from 'process';

/**
 * Effects sit ABOVE the avatar + gradient and BELOW all text.
 *
 * Two kinds:
 *  - built-in effects, drawn in code (grain, vignette, light leak, ...)
 *  - any .png / .webp / .jpg dropped into assets/effects/ is picked up
 *    automatically and shows up in the dropdown (name = file name).
 *    Black or transparent areas of the image are left alone (screen blend),
 *    so a smoke / dust / sparkle photo on black works as an overlay.
 */

const EFFECTS_DIR = join(cwd(), 'assets', 'effects');
const IMAGE_EXTS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

export type EffectName = string;

export interface EffectOption {
  label: string;
  description: string;
  /** Set for effects that come from a file in assets/effects. */
  file?: string;
}

const BUILT_IN: Record<string, EffectOption> = {
  none: { label: 'None', description: 'No effect' },
  grain: { label: 'Film Grain', description: 'Soft film noise' },
  vignette: { label: 'Vignette', description: 'Dark edges' },
  light_leak: { label: 'Light Leak', description: 'Warm glow from the corner' },
  bokeh: { label: 'Bokeh', description: 'Floating soft lights' },
  sparkle: { label: 'Sparkle', description: 'Tiny stars' },
  rain: { label: 'Rain', description: 'Falling streaks' },
  snow: { label: 'Snow', description: 'Falling flakes' },
  scanlines: { label: 'Scanlines', description: 'Old screen lines' },
  dust: { label: 'Dust', description: 'Floating dust specks' },
};

/** Built-ins plus whatever image files are in assets/effects (max 25 total). */
export function getEffectOptions(): Record<EffectName, EffectOption> {
  const out: Record<EffectName, EffectOption> = { ...BUILT_IN };
  try {
    if (existsSync(EFFECTS_DIR)) {
      for (const file of readdirSync(EFFECTS_DIR).sort()) {
        const { name, ext } = parse(file);
        if (!IMAGE_EXTS.has(ext.toLowerCase())) continue;
        const key = `file_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        const label = name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        out[key] = { label, description: 'Image effect', file };
      }
    }
  } catch (error) {
    console.error('[QuoteEffects] Could not read assets/effects:', error);
  }
  return Object.fromEntries(Object.entries(out).slice(0, 25));
}

// Small deterministic random generator: the same card always gets the same
// effect, so re-rendering after a theme or font change doesn't make it jump.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const imageCache = new Map<string, Image>();

/**
 * Paints one effect over the whole w x h area (logical pixels: the caller's
 * ctx is already scaled). `onLight` is true for the white theme, where
 * light effects would be invisible, so they are drawn dark instead.
 */
export async function drawEffect(
  ctx: SKRSContext2D,
  effect: EffectName | undefined,
  w: number,
  h: number,
  onLight: boolean,
): Promise<void> {
  if (!effect || effect === 'none') return;

  ctx.save();
  try {
    const rnd = mulberry32(0xb0b0 + effect.length * 977);
    const light = onLight ? '0,0,0' : '255,255,255';
    ctx.globalCompositeOperation = onLight ? 'multiply' : 'screen';

    switch (effect) {
      case 'grain': {
        const count = Math.floor((w * h) / 7);
        for (let i = 0; i < count; i++) {
          const a = 0.05 + rnd() * 0.16;
          ctx.fillStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.fillRect(rnd() * w, rnd() * h, 1.4, 1.4);
        }
        break;
      }
      case 'vignette': {
        ctx.globalCompositeOperation = 'source-over';
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.55);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.65)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'light_leak': {
        const tint = onLight ? ['255,150,60', '255,90,140'] : ['255,160,70', '255,80,150'];
        const g1 = ctx.createRadialGradient(w * 0.05, h * 0.05, 0, w * 0.05, h * 0.05, Math.max(w, h) * 0.7);
        g1.addColorStop(0, `rgba(${tint[0]},0.75)`);
        g1.addColorStop(1, `rgba(${tint[0]},0)`);
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, w, h);
        const g2 = ctx.createRadialGradient(w * 0.98, h * 0.95, 0, w * 0.98, h * 0.95, Math.max(w, h) * 0.55);
        g2.addColorStop(0, `rgba(${tint[1]},0.5)`);
        g2.addColorStop(1, `rgba(${tint[1]},0)`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'bokeh': {
        const n = 26;
        for (let i = 0; i < n; i++) {
          const r = Math.min(w, h) * (0.025 + rnd() * 0.07);
          const x = rnd() * w;
          const y = rnd() * h;
          const a = 0.08 + rnd() * 0.17;
          const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
          g.addColorStop(0, `rgba(${light},${a.toFixed(3)})`);
          g.addColorStop(0.85, `rgba(${light},${(a * 0.8).toFixed(3)})`);
          g.addColorStop(1, `rgba(${light},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'sparkle': {
        const n = Math.floor((w * h) / 9000);
        for (let i = 0; i < n; i++) {
          const x = rnd() * w;
          const y = rnd() * h;
          const s = 2 + rnd() * 7;
          const a = 0.35 + rnd() * 0.6;
          ctx.strokeStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x - s, y);
          ctx.lineTo(x + s, y);
          ctx.moveTo(x, y - s);
          ctx.lineTo(x, y + s);
          ctx.stroke();
          ctx.fillStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, s * 0.28, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'rain': {
        const n = Math.floor((w * h) / 2600);
        ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const x = rnd() * (w + 80);
          const y = rnd() * h;
          const len = 18 + rnd() * 34;
          const a = 0.1 + rnd() * 0.3;
          ctx.strokeStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.lineWidth = 1 + rnd() * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - len * 0.28, y + len);
          ctx.stroke();
        }
        break;
      }
      case 'snow': {
        const n = Math.floor((w * h) / 5200);
        for (let i = 0; i < n; i++) {
          const r = 1.2 + rnd() * 3.6;
          const x = rnd() * w;
          const y = rnd() * h;
          const a = 0.35 + rnd() * 0.55;
          ctx.fillStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'scanlines': {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.6);
        break;
      }
      case 'dust': {
        const n = Math.floor((w * h) / 1800);
        for (let i = 0; i < n; i++) {
          const r = 0.6 + rnd() * 1.8;
          const a = 0.1 + rnd() * 0.4;
          ctx.fillStyle = `rgba(${light},${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default: {
        // An image from assets/effects
        const option = getEffectOptions()[effect];
        if (!option?.file) break;
        const path = join(EFFECTS_DIR, option.file);
        let img = imageCache.get(path);
        if (!img) {
          img = await loadImage(path);
          imageCache.set(path, img);
        }
        // Cover the whole card without stretching
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        if (onLight) {
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.35;
        }
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    }
  } catch (error) {
    console.error(`[QuoteEffects] Failed to draw effect "${effect}":`, error);
  } finally {
    ctx.restore();
  }
}
