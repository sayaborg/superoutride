import { PIXEL_EDGE_TOLERANCE } from './pixel-coverage.js';
import { SoftwareSurface } from './software-surface.js';
import { selectSpriteLevel, SPRITE_SOURCE_TEXELS_PER_METER, type SpriteAsset } from '../image/sprite.js';

// Palette index 0 is transparent in every sprite image.
const SPRITE_TRANSPARENT_INDEX = 0;

interface SpriteDrawStats {
  outputSamples: number;
  writtenPixels: number;
  clipped: boolean;
}

/**
 * Screen pixels per texel of an image's level `level` drawn at `pixelsPerMeter` at its base point: level `k` has
 * `40 / 2^k` texels per metre.
 */
export function levelScale(pixelsPerMeter: number, level: number): number {
  return (pixelsPerMeter * 2 ** level) / SPRITE_SOURCE_TEXELS_PER_METER;
}

/**
 * The edges of an image's picture drawn at `pixelsPerMeter` by drawScaledSprite, in pixels from its anchor: the level it
 * draws and that level's texels at its scale.
 */
export function scaledSpriteBounds(
  asset: SpriteAsset,
  pixelsPerMeter: number,
): { left: number; top: number; right: number; bottom: number } {
  const levelIndex = selectSpriteLevel(asset, pixelsPerMeter);
  const level = asset.levels[levelIndex]!;
  const scale = levelScale(pixelsPerMeter, levelIndex);
  const left = -scale * (level.anchorX + 0.5),
    top = -scale * (level.anchorY + 0.5);
  return { left, top, right: left + scale * level.width, bottom: top + scale * level.height };
}

/**
 * Draw an image's picture with its anchor at (`xAnchor`, `yAnchor`) and `pixelsPerMeter` at its base point: the
 * nearest-octave level, each pixel taking the texel under its centre; every row is drawn, those below the anchor too.
 */
export function drawScaledSprite(
  target: SoftwareSurface,
  asset: SpriteAsset,
  xAnchor: number,
  yAnchor: number,
  pixelsPerMeter: number,
): SpriteDrawStats {
  const levelIndex = selectSpriteLevel(asset, pixelsPerMeter);
  const level = asset.levels[levelIndex]!;
  const scale = levelScale(pixelsPerMeter, levelIndex);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return { outputSamples: 0, writtenPixels: 0, clipped: true };
  }

  const leftBoundary = xAnchor - scale * (level.anchorX + 0.5);
  const topBoundary = yAnchor - scale * (level.anchorY + 0.5);
  const rightBoundary = leftBoundary + scale * level.width;
  const bottomBoundary = topBoundary + scale * level.height;

  const unclippedX0 = Math.ceil(leftBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedX1 = Math.floor(rightBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedY0 = Math.ceil(topBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);
  const unclippedY1 = Math.floor(bottomBoundary - 0.5 - PIXEL_EDGE_TOLERANCE);

  const x0 = Math.max(0, unclippedX0);
  const x1 = Math.min(target.width - 1, unclippedX1);
  const y0 = Math.max(0, unclippedY0);
  const y1 = Math.min(target.height - 1, unclippedY1);

  if (x1 < x0 || y1 < y0) {
    return { outputSamples: 0, writtenPixels: 0, clipped: true };
  }

  const invScale = 1 / scale;
  let outputSamples = 0;
  let writtenPixels = 0;

  for (let y = y0; y <= y1; y += 1) {
    const sy = Math.floor((y + 0.5 - topBoundary) * invScale);
    if (sy < 0 || sy >= level.height) continue;
    const targetRow = y * target.width;
    const patternRow = sy * level.width;

    for (let x = x0; x <= x1; x += 1) {
      const sx = Math.floor((x + 0.5 - leftBoundary) * invScale);
      if (sx < 0 || sx >= level.width) continue;
      outputSamples += 1;
      const index = level.pattern.indexAt(patternRow + sx);
      if (index === SPRITE_TRANSPARENT_INDEX) continue;
      target.pixels[targetRow + x] = level.paletteRgb555[index]!;
      writtenPixels += 1;
    }
  }

  return {
    outputSamples,
    writtenPixels,
    clipped: x0 !== unclippedX0 || x1 !== unclippedX1 || y0 !== unclippedY0 || y1 !== unclippedY1,
  };
}
