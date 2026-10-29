import { PNG } from 'pngjs';
import { IndexedPattern } from '../../src/image/indexed-image.js';
import { expandRgb555Pixels, halveRgb555 } from '../../src/image/rgb555.js';
import type { SpriteLodAsset, SpriteFrame } from '../../src/image/sprite.js';
import { SoftwareSurface } from '../../src/view/software-surface.js';
import { drawScaledSprite } from '../../src/view/sprite.js';
import { placeShadow, shadowRowSpans, type PlacedShadow } from '../../src/view/sprite-shadow.js';
import { spriteRaster } from '../graphics/sprite-layers.js';

/** Display the mirror-only originals in the same canonical direction as the public input. */
export function canonicalReviewAsset(asset: SpriteLodAsset, mirrored: boolean): SpriteLodAsset {
  if (!mirrored) return asset;
  const flip = (frame: SpriteFrame) => {
    const f = spriteRaster(frame, true);
    return { ...frame, anchorX: f.anchorX, pattern: new IndexedPattern(f.width, f.height, f.indices) };
  };
  return {
    ...asset,
    levels: asset.levels.map((level) => ({
      ...level,
      ...flip(level),
      shadow: level.shadow ? flip(level.shadow) : null,
    })),
  };
}

export function rgb555Png(width: number, height: number, pixels: Uint16Array): Uint8Array<ArrayBuffer> {
  const rgba = new Uint32Array(pixels.length);
  expandRgb555Pixels(pixels, rgba);
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba.buffer);
  return new Uint8Array(PNG.sync.write(png));
}

/** Size 0–3 on a flat review road, using the product's sprite and shadow drawing rules. */
export function roadPicturePreview(asset: SpriteLodAsset, size: number) {
  const target = new SoftwareSurface(320, 240),
    depth = 6 * 2 ** size,
    ppm = 240 / depth,
    anchorY = 120 + 480 / depth;
  target.pixels.fill(0x294c);
  const terrain = Array.from({ length: 120 }, (_, i) => ({ y: 120 + i, d: 480 / (i + 0.5), away: false }));
  const placed: PlacedShadow = { d: 0, row: 0, dNear: 0, dFar: 0, frame: asset.levels[0]!, left: 0, top: 0, scale: 1 };
  const casts = placeShadow(asset, 160, anchorY, ppm, depth, terrain, placed),
    spans: number[] = [];
  for (const row of terrain) {
    const half = (240 * 3.8) / row.d;
    for (let x = 0; x < 320; x++) target.pixels[row.y * 320 + x] = Math.abs(x + 0.5 - 160) < half ? 0x49a6 : 0x2524;
    if (casts) {
      shadowRowSpans(row, [placed], 320, spans);
      for (let j = 0; j < spans.length; j += 2)
        for (let x = spans[j]!; x < spans[j + 1]!; x++)
          target.pixels[row.y * 320 + x] = halveRgb555(target.pixels[row.y * 320 + x]!);
    }
  }
  drawScaledSprite(target, asset, 160, anchorY, ppm);
  return rgb555Png(320, 240, target.pixels);
}
