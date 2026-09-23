import type { PNG } from 'pngjs';
import type { normalizeSpriteSource } from '../../src/image/sprite-source-compiler.js';

export const SPRITE_PNG_BYTE_LIMIT: number;
export function decodeSpritePng(
  bytes: Uint8Array,
  decoder: typeof PNG,
  pixelLimit?: number,
  axisLimit?: number,
): Promise<Parameters<typeof normalizeSpriteSource>[0]>;
