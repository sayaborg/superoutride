import { PIXEL_EDGE_TOLERANCE } from '../core/tolerances.js';
import { SoftwareSurface } from './software-surface.js';
import { selectSpriteLevel, type SpriteAsset } from '../image/sprite.js';

const SPRITE_TRANSPARENT = 0;

interface SpriteDrawStats {
  outputSamples: number;
  writtenPixels: number;
  clipped: boolean;
}

export type SpriteScanlineObserver = (screenY: number, outputSamples: number, writtenPixels: number) => void;

export function drawScaledSprite(
  target: SoftwareSurface,
  asset: SpriteAsset,
  xAnchor: number,
  yAnchor: number,
  pixelsPerMeter: number,
  scanlineObserver?: SpriteScanlineObserver,
): SpriteDrawStats {
  const scale = pixelsPerMeter * (asset.worldWidthMeters / asset.width);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return { outputSamples: 0, writtenPixels: 0, clipped: true };
  }
  const levelIndex = selectSpriteLevel(asset, pixelsPerMeter);
  const level = asset.levels[levelIndex]!;
  const masterStep = 2 ** levelIndex;

  const leftBoundary = xAnchor - scale * (asset.anchorX + 0.5);
  const topBoundary = yAnchor - scale * (asset.anchorY + 0.5);
  const rightBoundary = leftBoundary + scale * asset.width;
  const bottomBoundary = topBoundary + scale * asset.height;

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
    const masterY = asset.anchorY + (y + 0.5 - yAnchor) * invScale;
    const sy = Math.floor((masterY + 0.5) / masterStep);
    if (sy < 0 || sy >= level.height) continue;
    const targetRow = y * target.width;
    const patternRow = sy * level.width;
    let rowOutputSamples = 0;
    let rowWrittenPixels = 0;

    for (let x = x0; x <= x1; x += 1) {
      const masterX = asset.anchorX + (x + 0.5 - xAnchor) * invScale;
      const sx = Math.floor((masterX + 0.5) / masterStep);
      if (sx < 0 || sx >= level.width) continue;
      outputSamples += 1;
      rowOutputSamples += 1;
      const color = level.paletteRgba[level.pattern.indexAt(patternRow + sx)]!;
      if (color === SPRITE_TRANSPARENT) continue;
      target.pixels[targetRow + x] = color;
      writtenPixels += 1;
      rowWrittenPixels += 1;
    }

    if (scanlineObserver && (rowOutputSamples > 0 || rowWrittenPixels > 0)) {
      scanlineObserver(y, rowOutputSamples, rowWrittenPixels);
    }
  }

  return {
    outputSamples,
    writtenPixels,
    clipped: x0 !== unclippedX0 || x1 !== unclippedX1 || y0 !== unclippedY0 || y1 !== unclippedY1,
  };
}
