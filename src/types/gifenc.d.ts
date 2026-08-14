declare module 'gifenc' {
  export interface GIFEncoderOptions {
    palette?: number[][];
    delay?: number;
    dispose?: number;
    transparent?: number;
  }

  export interface QuantizeOptions {
    format?: 'rgb444' | 'rgba4444' | 'rgb565';
    onePass?: boolean;
    maxColors?: number;
  }

  export class GIFEncoder {
    constructor();
    writeFrame(index: Uint8Array, width: number, height: number, options?: GIFEncoderOptions): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function quantize(data: Uint8Array, maxColors: number, options?: QuantizeOptions): number[][];
  export function applyPalette(data: Uint8Array, palette: number[][], format: string): Uint8Array;
}