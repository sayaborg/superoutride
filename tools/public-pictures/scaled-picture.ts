import { rgb555ToRgba } from '../../src/image/rgb555.js';
import { type SpriteLodAsset, type SpriteLodDocument, type SpriteShadowDocument } from '../../src/image/sprite.js';
import { normalizeSpriteSource, spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { pictureLayers, pictureScale, type ReviewFrame } from './layers.js';
import type { PublicPictureSettings } from './table.js';

/** PS-2 uses the existing picture and palette; later saved AI inputs replace this source only. */
export function scalePublicPicture(asset: SpriteLodAsset, settings: PublicPictureSettings, restoredMirror = false) {
  const layers = pictureLayers(asset.levels[0]!, restoredMirror);
  const frame = {
    ...layers.master,
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
  let shadow: SpriteShadowDocument | undefined;
  if ((settings.shadow ?? layers.shadow !== null) && layers.shadow) {
    const source = layers.shadow;
    const binaryPalette = [0, ...Array<number>(15).fill(32767)];
    const resizedShadow = scaleFrame(
      { ...source, indices: source.indices.map((v) => (v ? 1 : 0)) },
      binaryPalette,
      scale,
      settings.name,
    );
    shadow = {
      width: resizedShadow.width,
      height: resizedShadow.height,
      anchorX: (source.anchorX - layers.master.anchorX) * scale + resized.anchorX,
      anchorY: (source.anchorY - layers.master.anchorY) * scale + anchorY,
      levels: [{ indices: resizedShadow.levels[0]!.indices }],
    };
  } else if (settings.shadow === true && !layers.shadow) {
    throw new RangeError('Adding a shadow requires the PS-3 procedural shadow compiler');
  }
  const master: SpriteLodDocument = {
    ...resized,
    anchorY,
    defaultPalette: asset.defaultPalette,
    palettes: asset.palettes,
    ...(shadow ? { shadow } : {}),
    ...(asset.lies ? { lies: true } : {}),
    ...(asset.extend ? { extend: asset.extend } : {}),
  };
  return { master, scale };
}

function scaleFrame(frame: ReviewFrame, palette: readonly number[], scale: number, name: string): SpriteLodDocument {
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
      version: 3,
      name,
      crop: { x: 0, y: 0, width: frame.width, height: frame.height },
      widthMeters: (frame.width * scale) / 40,
      anchor: { x: frame.anchorX },
      paletteRgb555: palette,
    },
  );
}

/** Reflect the completed master and shadow together; the light is not recast. */
export function mirrorPublicPicture(master: SpriteLodDocument): SpriteLodDocument {
  const mirror = (indices: readonly number[], width: number) =>
    indices.map((_, i) => indices[Math.floor(i / width) * width + width - 1 - (i % width)]!);
  return {
    ...master,
    name: `${master.name}-mirrored`,
    anchorX: master.width - 1 - master.anchorX,
    levels: master.levels.map((level) => ({ ...level, indices: mirror(level.indices, master.width) })),
    ...(master.shadow
      ? {
          shadow: {
            ...master.shadow,
            anchorX: master.shadow.width - 1 - master.shadow.anchorX,
            levels: master.shadow.levels.map((level) => ({ indices: mirror(level.indices, master.shadow!.width) })),
          },
        }
      : {}),
  };
}
