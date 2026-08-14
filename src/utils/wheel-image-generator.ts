import { createCanvas, GlobalFonts, loadImage, SKRSContext2D } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cwd } from 'process';
import { existsSync } from 'fs';
import pkg from 'gifenc';

const { GIFEncoder, quantize, applyPalette } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = cwd();

// Font loading using GlobalFonts (same approach as Wordle)
const fontPath = join(PROJECT_ROOT, 'assets', 'fonts', 'Roboto-Bold.ttf');
let fontLoaded = false;

try {
  if (existsSync(fontPath)) {
    const success = GlobalFonts.registerFromPath(fontPath, 'Roboto');
    if (success) {
      fontLoaded = true;
      console.log('[WheelImageGenerator] Font loaded: assets/fonts/Roboto-Bold.ttf');
    } else {
      console.error('[WheelImageGenerator] Font registration failed');
    }
  } else {
    console.error('[WheelImageGenerator] Font file not found: assets/fonts/Roboto-Bold.ttf');
  }
} catch (error) {
  console.error('[WheelImageGenerator] Failed to load font:', error);
}

// Asset paths - check both project root and dist directory
const wheelPath = existsSync(join(PROJECT_ROOT, 'wheel.png')) 
  ? join(PROJECT_ROOT, 'wheel.png') 
  : join(PROJECT_ROOT, 'dist', 'wheel.png');
const pointerPath = existsSync(join(PROJECT_ROOT, 'pointer.png')) 
  ? join(PROJECT_ROOT, 'pointer.png') 
  : join(PROJECT_ROOT, 'dist', 'pointer.png');

export interface WheelOption {
  label: string;
  description: string;
  duration?: number;
  type?: string;
}

export interface WheelAnimationConfig {
  options: WheelOption[];
  selectedIndex: number;
  canvasSize?: number;
  duration?: number; // in seconds
  frameCount?: number;
}

export interface WheelResultConfig {
  options: WheelOption[];
  selectedIndex: number;
  finalRotation: number;
  canvasSize?: number;
}

/**
 * Wheel image generator with Canvas and bundled Roboto fonts
 */
export class WheelImageGenerator {
  private static readonly DEFAULT_CANVAS_SIZE = 800;
  private static readonly DEFAULT_DURATION = 5; // seconds
  private static readonly DEFAULT_FRAME_COUNT = 40;
  private static readonly OPTION_COUNT = 8; // Always exactly 8 options
  private static readonly SLICE_ANGLE = (Math.PI * 2) / this.OPTION_COUNT; // 45 degrees in radians

  /**
   * Generate animated GIF of wheel spinning
   */
  static async generateSpinningGIF(config: WheelAnimationConfig): Promise<Buffer> {
    const { options, selectedIndex, canvasSize = this.DEFAULT_CANVAS_SIZE, duration = this.DEFAULT_DURATION, frameCount = this.DEFAULT_FRAME_COUNT } = config;

    if (!fontLoaded) {
      throw new Error('[WheelImageGenerator] Font not loaded - cannot render wheel');
    }

    // Check assets exist
    if (!existsSync(wheelPath)) {
      throw new Error(`Wheel asset missing: ${wheelPath}`);
    }
    if (!existsSync(pointerPath)) {
      throw new Error(`Pointer asset missing: ${pointerPath}`);
    }

    console.log('[WheelImageGenerator] Generating spinning GIF with', frameCount, 'frames');

    // Calculate target rotation
    const targetRotation = this.calculateTargetRotation(selectedIndex);

    // Load wheel and pointer images
    const wheelImage = await loadImage(wheelPath);
    const pointerImage = await loadImage(pointerPath);

    // Create GIF encoder
    const gif = new GIFEncoder();

    // Calculate frame delay in centiseconds (gifenc uses centiseconds)
    const frameDelay = Math.round((duration * 1000) / frameCount / 10);

    // Generate frames with easing
    for (let i = 0; i < frameCount; i++) {
      const progress = i / (frameCount - 1);
      const easedProgress = this.easeOutCubic(progress);
      const currentRotation = targetRotation * easedProgress;

      // Create canvas for this frame
      const canvas = createCanvas(canvasSize, canvasSize);
      const ctx = canvas.getContext('2d');

      // Draw wheel frame
      await this.drawWheelFrame(ctx, wheelImage, pointerImage, options, currentRotation, canvasSize);

      // Get RGBA data
      const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
      const rgbaData = new Uint8Array(imageData.data.buffer);

      // Quantize colors to create palette
      const palette = quantize(rgbaData, 256, { format: 'rgb444' });

      // Apply palette to get indexed bitmap
      const index = applyPalette(rgbaData, palette, 'rgb444');

      // Write frame to GIF
      gif.writeFrame(index, canvasSize, canvasSize, { 
        palette,
        delay: frameDelay,
      });
    }

    // Finish encoding
    gif.finish();

    // Get bytes and convert to Buffer
    const bytes = gif.bytes();
    const buffer = Buffer.from(bytes);
    
    console.log('[WheelImageGenerator] Generated GIF buffer size:', buffer.length);

    return buffer;
  }

  /**
   * Generate final static PNG with highlighted winning slice
   */
  static async generateResultPNG(config: WheelResultConfig): Promise<Buffer> {
    const { options, selectedIndex, finalRotation, canvasSize = this.DEFAULT_CANVAS_SIZE } = config;

    if (!fontLoaded) {
      throw new Error('[WheelImageGenerator] Font not loaded - cannot render wheel');
    }

    // Check assets exist
    if (!existsSync(wheelPath)) {
      throw new Error(`Wheel asset missing: ${wheelPath}`);
    }
    if (!existsSync(pointerPath)) {
      throw new Error(`Pointer asset missing: ${pointerPath}`);
    }

    console.log('[WheelImageGenerator] Generating result PNG for option', selectedIndex);

    // Load wheel and pointer images
    const wheelImage = await loadImage(wheelPath);
    const pointerImage = await loadImage(pointerPath);

    // Create canvas
    const canvas = createCanvas(canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');

    // Draw wheel with final rotation and highlight
    await this.drawWheelFrame(ctx, wheelImage, pointerImage, options, finalRotation, canvasSize, selectedIndex);

    // Convert to buffer
    const buffer = canvas.toBuffer('image/png');
    console.log('[WheelImageGenerator] Generated PNG buffer size:', buffer.length);

    return buffer;
  }

  /**
   * Calculate target rotation to land on selected option
   * The pointer points UP (270 degrees or -90 degrees in canvas coordinates)
   */
  private static calculateTargetRotation(selectedIndex: number): number {
    // Add multiple full rotations for visual effect (5 rotations)
    const baseRotations = 5 * Math.PI * 2;
    
    // Calculate angle needed to put selected option under the pointer
    // Pointer is at top (270 degrees / -90 degrees / 3π/2 radians)
    const pointerAngle = (3 * Math.PI) / 2;
    
    // Each option occupies SLICE_ANGLE radians
    // The center of the selected option should align with pointerAngle
    const optionCenterAngle = selectedIndex * this.SLICE_ANGLE + this.SLICE_ANGLE / 2;
    
    // Calculate rotation needed: we want optionCenterAngle + rotation = pointerAngle
    // So rotation = pointerAngle - optionCenterAngle
    const targetAngle = pointerAngle - optionCenterAngle;
    
    // Add base rotations and normalize to positive
    const totalRotation = baseRotations + targetAngle;
    
    // Normalize to 0-2π range for the final position
    const normalizedRotation = totalRotation % (Math.PI * 2);
    
    return totalRotation; // Return full rotation including spins
  }

  /**
   * Draw a single wheel frame
   */
  private static async drawWheelFrame(
    ctx: SKRSContext2D,
    wheelImage: any,
    pointerImage: any,
    options: WheelOption[],
    rotation: number,
    canvasSize: number,
    highlightIndex?: number
  ): Promise<void> {
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;

    // Clear canvas
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Save context for wheel rotation
    ctx.save();
    
    // Translate to center, rotate, translate back
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.translate(-centerX, -centerY);

    // Draw wheel image
    const wheelSize = canvasSize * 0.9; // Wheel is 90% of canvas
    const wheelX = (canvasSize - wheelSize) / 2;
    const wheelY = (canvasSize - wheelSize) / 2;
    ctx.drawImage(wheelImage, wheelX, wheelY, wheelSize, wheelSize);

    // Draw highlight if specified
    if (highlightIndex !== undefined) {
      this.drawSliceHighlight(ctx, centerX, centerY, wheelSize, highlightIndex);
    }

    // Draw option labels
    this.drawOptionLabels(ctx, options, centerX, centerY, wheelSize);

    // Restore context (undo rotation)
    ctx.restore();

    // Draw fixed pointer on top (doesn't rotate)
    const pointerSize = canvasSize * 0.15; // Pointer is 15% of canvas
    const pointerX = centerX - pointerSize / 2;
    const pointerY = 20; // Position at top with some padding
    ctx.drawImage(pointerImage, pointerX, pointerY, pointerSize, pointerSize);
  }

  /**
   * Draw highlight around winning slice
   */
  private static drawSliceHighlight(
    ctx: SKRSContext2D,
    centerX: number,
    centerY: number,
    wheelSize: number,
    highlightIndex: number
  ): void {
    const radius = wheelSize / 2;
    const innerRadius = radius * 0.2; // Don't highlight center hub
    
    // Calculate angles for the highlighted slice
    const startAngle = highlightIndex * this.SLICE_ANGLE;
    const endAngle = startAngle + this.SLICE_ANGLE;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Draw highlight arc
    ctx.beginPath();
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.arc(0, 0, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    
    // Bright gold/white border
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // Subtle glow overlay
    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
    ctx.fill();
    
    ctx.restore();
  }

  /**
   * Draw option labels rotating with the wheel
   */
  private static drawOptionLabels(
    ctx: SKRSContext2D,
    options: WheelOption[],
    centerX: number,
    centerY: number,
    wheelSize: number
  ): void {
    const radius = wheelSize / 2;
    const textRadius = radius * 0.65; // Position text at 65% of radius
    const maxFontSize = 28;
    const minFontSize = 16;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      
      // Calculate angle for this option's center
      const textAngle = i * this.SLICE_ANGLE + this.SLICE_ANGLE / 2;
      
      // Calculate text position
      const textX = centerX + Math.cos(textAngle) * textRadius;
      const textY = centerY + Math.sin(textAngle) * textRadius;
      
      // Save context for text rotation
      ctx.save();
      ctx.translate(textX, textY);
      
      // Rotate text to align with slice (readable from outside in)
      ctx.rotate(textAngle + Math.PI / 2);
      
      // Fit text to slice width
      const label = option.label;
      const fittedFontSize = this.fitTextToWidth(ctx, label, maxFontSize, minFontSize, this.SLICE_ANGLE * textRadius * 0.8);
      
      ctx.font = `bold ${fittedFontSize}px Roboto`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      // Check if text needs to be split
      if (ctx.measureText(label).width > this.SLICE_ANGLE * textRadius * 0.8) {
        // Split into two lines
        const words = label.split(' ');
        if (words.length >= 2) {
          const mid = Math.ceil(words.length / 2);
          const line1 = words.slice(0, mid).join(' ');
          const line2 = words.slice(mid).join(' ');
          
          ctx.fillText(line1, 0, -fittedFontSize / 2);
          ctx.fillText(line2, 0, fittedFontSize / 2);
        } else {
          ctx.fillText(label, 0, 0);
        }
      } else {
        ctx.fillText(label, 0, 0);
      }
      
      // Reset shadow
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      
      ctx.restore();
    }
  }

  /**
   * Fit text to maximum width by adjusting font size
   */
  private static fitTextToWidth(
    ctx: SKRSContext2D,
    text: string,
    maxFontSize: number,
    minFontSize: number,
    maxWidth: number
  ): number {
    let fontSize = maxFontSize;
    
    while (fontSize > minFontSize) {
      ctx.font = `bold ${fontSize}px Roboto`;
      const metrics = ctx.measureText(text);
      if (metrics.width <= maxWidth) {
        break;
      }
      fontSize -= 2;
    }
    
    return fontSize;
  }

  /**
   * Ease-out cubic function for natural deceleration
   */
  private static easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Get final rotation angle (normalized to 0-2π)
   */
  static getFinalRotation(selectedIndex: number): number {
    const totalRotation = this.calculateTargetRotation(selectedIndex);
    return totalRotation % (Math.PI * 2);
  }
}