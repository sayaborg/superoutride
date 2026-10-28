import { linearToRgb555, rgb555LinearChannel } from '../../src/image/image-filter.js';
import { readSpriteLodAsset, type SpriteLodAsset, type SpriteLodDocument } from '../../src/image/sprite.js';
import { spriteIdentityMixtures, type SourceImage } from '../graphics/sprite-source-compiler.js';
import { pictureLayers, reviewFrame } from './layers.js';
import { optimizePublicPalette, quantizePublicPicture } from './quantize.js';
import { registerPublicSource } from './register.js';
import { scalePublicPicture } from './scaled-picture.js';
import { publicPictureShadow } from './shadow.js';
import { DITHERS, type PublicPictureSettings } from './table.js';

/** Saved AI pixels in; deterministic registered, clipped, quantized master and review diagnostics out. */
export function importPublicPicture(
  asset: SpriteLodAsset,
  settings: PublicPictureSettings,
  image: SourceImage,
  restoredMirror: boolean,
  defaultDither: (typeof DITHERS)[number],
) {
  const { master: reference, scale } = scalePublicPicture(asset, settings, restoredMirror);
  const frame = reviewFrame(readSpriteLodAsset(reference).levels[0]!);
  const { samples, transform, diagnostics } = registerPublicSource(image, frame);
  const optimization = optimizePublicPalette(samples, frame.width, frame.height);
  const variants = Object.fromEntries(
    DITHERS.map((mode) => [mode, quantizePublicPicture(samples, frame.width, optimization.palette, mode)]),
  ) as Record<(typeof DITHERS)[number], number[]>;
  const indices = variants[settings.dither ?? defaultDither];
  const original = pictureLayers(asset.levels[0]!, restoredMirror).body;
  const counts = Array.from({ length: 16 }, () => Array<number>(16).fill(0));
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const slot = indices[y * frame.width + x]!,
        sx = Math.floor((x + 0.5) / scale),
        sy = Math.floor((y + 0.5) / scale);
      const old = sx < original.width && sy < original.height ? original.indices[sy * original.width + sx]! : 0;
      if (slot && old) counts[slot]![old] = counts[slot]![old]! + 1;
    }
  const correspondence = counts.map((row) => {
    let slot = 1;
    for (let i = 2; i < 16; i++) if (row[i]! > row[slot]!) slot = i;
    return slot;
  });
  const base = asset.palettes[asset.defaultPalette]!.colors;
  const palettes = Object.fromEntries(
    Object.entries(asset.palettes).map(([name, palette]) => [
      name,
      {
        colors:
          name === asset.defaultPalette
            ? optimization.palette
            : optimization.palette.map((code, slot) => {
                if (!slot) return 0;
                const old = correspondence[slot]!,
                  from = base[old]!,
                  to = palette.colors[old]!;
                const channels = [10, 5, 0].map((shift) => {
                  const denominator = rgb555LinearChannel((from >> shift) & 31),
                    alternate = rgb555LinearChannel((to >> shift) & 31);
                  return denominator < 1e-6
                    ? alternate
                    : Math.min(1, (rgb555LinearChannel((code >> shift) & 31) * alternate) / denominator);
                });
                return linearToRgb555(channels[0]!, channels[1]!, channels[2]!);
              }),
      },
    ]),
  );
  const master: SpriteLodDocument = {
    ...reference,
    palettes,
    levels: [{ paletteRgb555: optimization.palette, indices, mixtures: spriteIdentityMixtures() }],
  };
  const completed = reference.shadow ? { ...master, shadow: publicPictureShadow(master) } : master;
  return { master: completed, scale, diagnostics, transform, optimization, correspondence, variants };
}
