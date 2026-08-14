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
  private static readonly DEFAULT_FRAME_COUNT = 75; // Increased for smoother animation
  private static readonly OPTION_COUNT = 8; // Always exactly 8 options
  private static readonly SLICE_ANGLE = (Math.PI * 2) / this.OPTION_COUNT; // 45 degrees in radians
  private static readonly SLICE_CENTER_OFFSET = -Math.PI / 2; // Option 0 starts at top
  private static readonly SAFETY_MARGIN = 0.15; // 15% safety margin from slice boundaries
  
  // Wheel asset geometry (actual circular region within wheel.png)
  private static readonly WHEEL_SOURCE_X = 181;
  private static readonly WHEEL_SOURCE_Y = 0;
  private static readonly WHEEL_SOURCE_SIZE = 835;
  
  // Pointer asset geometry (hub center within pointer.png)
  private static readonly POINTER_HUB_CENTER_X = 448;
  private static readonly POINTER_HUB_CENTER_Y = 618;
  private static readonly POINTER_WIDTH = 924;
  private static readonly POINTER_HEIGHT = 1024;

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
    // Use 30ms delay for smooth animation (3 centiseconds)
    const frameDelay = 3;

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
   * The pointer points UP (at SLICE_CENTER_OFFSET)
   * Uses safety margin to ensure pointer never lands on slice boundary
   */
  private static calculateTargetRotation(selectedIndex: number): number {
    // Add random full rotations for natural spin (5-7 rotations)
    const fullSpins = 5 + Math.floor(Math.random() * 3);
    const baseRotations = fullSpins * Math.PI * 2;
    
    // Calculate the center angle of the winning slice
    const sliceCenterAngle = selectedIndex * this.SLICE_ANGLE + this.SLICE_ANGLE / 2;
    
    // Add safety margin from slice boundaries (15% of slice width)
    const safeMargin = this.SLICE_ANGLE * this.SAFETY_MARGIN;
    const maxOffset = (this.SLICE_ANGLE / 2) - safeMargin;
    
    // Add random offset within safe range for natural feel
    const randomOffset = (Math.random() * 2 - 1) * maxOffset;
    
    // The final target angle for the slice center
    const targetSliceAngle = sliceCenterAngle + randomOffset;
    
    // Calculate rotation needed: we want targetSliceAngle + rotation = SLICE_CENTER_OFFSET
    // So rotation = SLICE_CENTER_OFFSET - targetSliceAngle
    const targetAngle = this.SLICE_CENTER_OFFSET - targetSliceAngle;
    
    // Add base rotations
    const totalRotation = baseRotations + targetAngle;
    
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
    
    // Translate to center and rotate
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);

    // Draw wheel image (cropped to actual circular region)
    // Source: crop from 181,0 with size 835x835 (the actual circular wheel)
    // Destination: centered on wheel coordinate system
    const wheelSize = canvasSize * 0.9; // Wheel is 90% of canvas
    ctx.drawImage(
      wheelImage,
      this.WHEEL_SOURCE_X,
      this.WHEEL_SOURCE_Y,
      this.WHEEL_SOURCE_SIZE,
      this.WHEEL_SOURCE_SIZE,
      -wheelSize / 2,
      -wheelSize / 2,
      wheelSize,
      wheelSize
    );

    // Draw highlight if specified (in wheel-local coordinates)
    if (highlightIndex !== undefined) {
      this.drawSliceHighlight(ctx, wheelSize, highlightIndex);
    }

    // Draw option labels (in wheel-local coordinates, passing rotation for proper angle calculation)
    this.drawOptionLabels(ctx, options, wheelSize, rotation);

    // Restore context (undo rotation and translation)
    ctx.restore();

    // Draw fixed pointer/hub on top (doesn't rotate)
    // Scale pointer to be proportional to wheel
    const pointerScale = wheelSize / this.WHEEL_SOURCE_SIZE * 0.25; // Pointer is 25% of wheel size
    const pointerDrawWidth = this.POINTER_WIDTH * pointerScale;
    const pointerDrawHeight = this.POINTER_HEIGHT * pointerScale;
    
    // Position pointer so its hub center is exactly at wheel center
    const pointerDrawX = centerX - this.POINTER_HUB_CENTER_X * pointerScale;
    const pointerDrawY = centerY - this.POINTER_HUB_CENTER_Y * pointerScale;
    
    ctx.drawImage(
      pointerImage,
      pointerDrawX,
      pointerDrawY,
      pointerDrawWidth,
      pointerDrawHeight
    );
  }

  /**
   * Draw highlight around winning slice (in wheel-local coordinates)
   */
  private static drawSliceHighlight(
    ctx: SKRSContext2D,
    wheelSize: number,
    highlightIndex: number
  ): void {
    const radius = wheelSize / 2;
    const innerRadius = radius * 0.2; // Don't highlight center hub
    
    // Calculate angles for the highlighted slice using consistent coordinate system
    const startAngle = this.SLICE_CENTER_OFFSET + highlightIndex * this.SLICE_ANGLE;
    const endAngle = startAngle + this.SLICE_ANGLE;
    
    // Draw highlight arc (context is already at wheel center)
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
  }

  /**
   * Draw option labels rotating with the wheel (in wheel-local coordinates)
   */
  private static drawOptionLabels(
    ctx: SKRSContext2D,
    options: WheelOption[],
    wheelSize: number,
    wheelRotation: number
  ): void {
    const radius = wheelSize / 2;
    const textRadius = radius * 0.65; // Position text at 65% of radius for better slice centering
    const maxFontSize = 28;
    const minFontSize = 12;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      
      // Calculate slice center angle including wheel rotation
      // The wheel is already rotated by wheelRotation in the parent context
      // So we calculate the slice position in the rotated wheel's coordinate system
      const sliceStartAngle = i * this.SLICE_ANGLE;
      const sliceCenterAngle = sliceStartAngle + this.SLICE_ANGLE / 2;
      
      // Calculate text position in wheel-local coordinates (context is at wheel center)
      const textX = Math.cos(sliceCenterAngle) * textRadius;
      const textY = Math.sin(sliceCenterAngle) * textRadius;
      
      // Calculate text rotation to follow radial direction but never be upside down
      let textRotation = sliceCenterAngle;
      
      // Normalize to -PI to +PI range
      while (textRotation > Math.PI) {
        textRotation -= Math.PI * 2;
      }
      while (textRotation < -Math.PI) {
        textRotation += Math.PI * 2;
      }
      
      // Flip text 180 degrees if it would be upside down
      if (textRotation > Math.PI / 2 || textRotation < -Math.PI / 2) {
        textRotation += Math.PI;
      }
      
      // Normalize again after flip
      while (textRotation > Math.PI) {
        textRotation -= Math.PI * 2;
      }
      while (textRotation < -Math.PI) {
        textRotation += Math.PI * 2;
      }
      
      // Calculate available arc width for text (70% of slice arc width)
      const availableArcWidth = textRadius * this.SLICE_ANGLE * 0.70;
      
      // Save context for text rotation
      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(textRotation);
      
      // Fit text to available arc width
      const label = option.label;
      const fittedFontSize = this.fitTextToWidth(ctx, label, maxFontSize, minFontSize, availableArcWidth);
      
      ctx.font = `bold ${fittedFontSize}px Roboto`;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      // Check if text needs to be split
      if (ctx.measureText(label).width > availableArcWidth) {
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