import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { type SpriteLodAsset, type SpriteLodDocument } from '../../src/image/sprite.js';
import { normalizeSpriteSource, spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { pictureScale } from './layers.js';
import { spriteLayers, type SpriteRaster } from '../graphics/sprite-layers.js';
import type { PublicPictureSettings } from './table.js';
import { boardShadow } from '../graphics/board-shadow.js';

/** The trial uses the existing body and palette; later saved AI inputs replace this source only. */
export function scalePublicPicture(asset: SpriteLodAsset, settings: PublicPictureSettings, restoredMirror = false) {
  const layers = spriteLayers(asset.levels[0]!, restoredMirror);
  const frame = {
    ...layers.body,
    ...(settings.anchor ? { anchorX: settings.anchor.x, anchorY: settings.anchor.y } : {}),
  };
  if (
    frame.anchorX < -0.5 ||
    frame.anchorX > frame.width - 0.5 ||
    frame.anchorY < -0.5 ||
    frame.anchorY > frame.height - 0.5
  )
    throw new RangeError('Public anchor must lie within the original picture');
  const requestedScale =
    settings.anchorHeight === null
      ? pictureScale(frame, settings.height)
      : (((settings.height ?? (frame.anchorY + 0.5) / 40) + settings.anchorHeight) * 40) / frame.height;
  const scale = Math.max(1, Math.round(frame.width * requestedScale)) / frame.width;
  const palette = asset.palettes[asset.defaultPalette]!.colors;
  const resized = scaleFrame(frame, palette, scale, settings.name);
  const anchorY =
    settings.anchorHeight === null
      ? (frame.anchorY + 0.5) * scale - 0.5
      : resized.height - 0.5 - settings.anchorHeight * 40;
  if (!(anchorY >= -0.5 && anchorY <= resized.height - 0.5))
    throw new RangeError('Public anchor height exceeds its frame');
  const master: SpriteLodDocument = {
    ...resized,
    anchorY,
    defaultPalette: asset.defaultPalette,
    palettes: asset.palettes,
    ...(asset.lies ? { lies: true } : {}),
    ...(asset.extend ? { extend: asset.extend } : {}),
  };
  const casts = settings.shadow ?? layers.shadow !== null;
  return { master: casts ? { ...master, shadow: boardShadow(master) } : master, scale };
}

function scaleFrame(frame: SpriteRaster, palette: readonly number[], scale: number, name: string): SpriteLodDocument {
  if (scale === 1)
    return {
      format: 'superoutride.sprite-lod',
      version: 7,
      name,
      width: frame.width,
      height: frame.height,
      anchorX: frame.anchorX,
      defaultPalette: 'original',
      palettes: { original: { colors: palette } },
      levels: [{ paletteRgb555: palette, indices: frame.indices, mixtures: spriteIdentityMixtures() }],
    };
  const pixels = Uint32Array.from(frame.indices, (slot) => (slot ? rgb555ToRgba(palette[slot]!) : 0));
  return normalizeSpriteSource(
    { width: frame.width, height: frame.height, pixels },
    {
      format: 'superoutride.sprite-source',
      version: 4,
      name,
      crop: { x: 0, y: 0, width: frame.width, height: frame.height },
      widthMeters: (frame.width * scale) / 40,
      anchor: { x: frame.anchorX },
      paletteRgb555: palette,
    },
  );
}
