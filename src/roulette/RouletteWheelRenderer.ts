import { createCanvas, Canvas, CanvasRenderingContext2D } from '@napi-rs/canvas';

interface RenderOptions {
  rotation: number;
  size?: number;
  centerNumber?: number | null;
  highlightNumber?: number | null;
}

// Cache for the static wheel
let cachedWheelCanvas: Canvas | null = null;
let cachedWheelSize = 0;

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const STEP = (2 * Math.PI) / 37;

function getNumberColor(n: number): string {
  if (n === 0) return '#008000';
  return RED_NUMBERS.has(n) ? '#DC143C' : '#1a1a1a';
}

function createStaticWheel(size: number): Canvas {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 10;

  // Draw outer rim
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI);
  ctx.fillStyle = '#C0A060';
  ctx.fill();
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Draw inner rim
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#2a2a2a';
  ctx.fill();

  // Draw wedges
  for (let i = 0; i < 37; i++) {
    const startAngle = i * STEP - Math.PI / 2;
    const endAngle = (i + 1) * STEP - Math.PI / 2;
    const number = WHEEL_ORDER[i];
    const color = getNumberColor(number);

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw number label
    const labelRadius = radius * 0.82;
    const labelAngle = startAngle + STEP / 2;
    const labelX = centerX + Math.cos(labelAngle) * labelRadius;
    const labelY = centerY + Math.sin(labelAngle) * labelRadius;

    ctx.save();
    ctx.translate(labelX, labelY);
    ctx.rotate(labelAngle + Math.PI / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(size / 25)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), 0, 0);
    ctx.restore();
  }

  // Draw center hub
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.15, 0, 2 * Math.PI);
  ctx.fillStyle = '#C0A060';
  ctx.fill();
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 3;
  ctx.stroke();

  return canvas;
}

export async function renderWheel(options: RenderOptions): Promise<Buffer> {
  const size = options.size || 420;

  // Create or reuse cached wheel
  if (!cachedWheelCanvas || cachedWheelSize !== size) {
    cachedWheelCanvas = createStaticWheel(size);
    cachedWheelSize = size;
  }

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const centerX = size / 2;
  const centerY = size / 2;

  // Draw rotated wheel
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(options.rotation);
  ctx.translate(-centerX, -centerY);
  ctx.drawImage(cachedWheelCanvas, 0, 0);
  ctx.restore();

  // Draw pointer at top (fixed)
  const pointerSize = size * 0.08;
  ctx.beginPath();
  ctx.moveTo(centerX, 10);
  ctx.lineTo(centerX - pointerSize, 0);
  ctx.lineTo(centerX + pointerSize, 0);
  ctx.closePath();
  ctx.fillStyle = '#FFD700';
  ctx.fill();
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw center circle with number
  const centerRadius = size * 0.15;
  if (options.centerNumber !== null) {
    const number = options.centerNumber;
    const color = getNumberColor(number);

    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(size / 12)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number.toString(), centerX, centerY);
  } else {
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#C0A060';
    ctx.fill();
    ctx.strokeStyle = '#8B7355';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

export function pocketIndexFromAngle(angle: number): number {
  const normalizedAngle = ((-angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const index = Math.round(normalizedAngle / STEP) % 37;
  return index;
}

export function angleForPocket(index: number, startAngle: number, turns: number = 5): number {
  const targetAngle = -(index * STEP);
  const fullRotations = turns * 2 * Math.PI;
  const delta = (targetAngle - startAngle % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  return startAngle + fullRotations + delta;
}
