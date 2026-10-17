import { rgb555ToRgba, rgbaToRgb555, rgba, unpackRgba } from '../../../src/image/rgb555.js';
import { createRaster, outlined, plot, sequence, type Color, type Raster } from './raster.js';
import { TEXELS_PER_METRE } from './kit.js';

/**
 * The tire puffs' pictures: clouds of overlapping lumps, outlined and lit from the upper left in three tones, as
 * OUTRUN TEST's scenery is drawn, each standing on the middle of its bottom row and as wide and as tall as the diameter
 * it shows. Every picture has four used slots: 1 the outline, 2 the shade, 3 the middle tone and 4 the light. The
 * clouds are colored by name: `smoke`, `dirt`, `sand`, `verge` and `grass`; spray's mist and drops by `spray`.
 */

/** A palette's four used colors, outline to light, as `0xRRGGBB`. */
type Tones = readonly [outline: Color, shade: Color, middle: Color, light: Color];

const CLOUD_TONES: Readonly<Record<string, Tones>> = {
  smoke: [0x707880, 0xa8b0b8, 0xd0d4d8, 0xf4f4f4],
  dirt: [0x4a3020, 0x7a5434, 0x9c7048, 0xc09468],
  sand: [0x7a6440, 0xc0a070, 0xdcc08c, 0xf0dcb0],
  verge: [0x5a4c3a, 0x8c7c64, 0xa89880, 0xc8bca4],
  grass: [0x3a4a24, 0x5a7a34, 0x9a7a4c, 0xb8ac78],
};
const SPRAY_TONES: Readonly<Record<string, Tones>> = { spray: [0x6c88a8, 0xa8c0d8, 0xd0e0ec, 0xf8fcff] };

/** A palette's colors in RGB555, the drawn colors' nearest; slot 0 and the unused slots 5-15 are 0. */
function rgb555Palette(tones: Tones): number[] {
  return [
    0,
    ...tones.map((tone) => rgbaToRgb555(rgba(tone >> 16, (tone >> 8) & 255, tone & 255))),
    ...Array(11).fill(0),
  ];
}

/** The color a palette's slot draws as `0xRRGGBB`: its RGB555 color expanded, so a source holds exactly its colors. */
function drawnColor(rgb555: number): Color {
  const { r, g, b } = unpackRgba(rgb555ToRgba(rgb555));
  return (r << 16) | (g << 8) | b;
}

/** The sizes' diameters in metres: 0.25 m to 4 m in steps of √2. */
export const PUFF_DIAMETERS = Array.from({ length: 9 }, (_, k) => 0.25 * Math.SQRT2 ** k);

/** One lump: a disc at (`x`, `y`) of `radius` texels. */
type Lump = readonly [x: number, y: number, radius: number];

/**
 * Lumps drawn back to front within the picture's disc, each pixel in three tones by how its lump's surface, a sphere's,
 * faces the light from the upper left and the front, the whole outlined, a pixel wide below 40 texels and two above.
 */
function drawLumps(width: number, lumps: readonly Lump[], palette: readonly number[]): Raster {
  const r = createRaster(width, width);
  const [outline, shade, middle, light] = [1, 2, 3, 4].map((slot) => drawnColor(palette[slot]!));
  outlined(
    r,
    outline!,
    (layer) => {
      for (const [x, y, radius] of lumps)
        for (let py = Math.floor(y - radius); py <= Math.ceil(y + radius); py++)
          for (let px = Math.floor(x - radius); px <= Math.ceil(x + radius); px++) {
            const nx = (px + 0.5 - x) / radius,
              ny = (py + 0.5 - y) / radius;
            const nn = nx * nx + ny * ny;
            if (nn > 1) continue;
            // The lump's surface as a sphere's, lit from the upper left and the front.
            const facing = -0.45 * nx - 0.55 * ny + 0.7 * Math.sqrt(1 - nn);
            plot(layer, px, py, facing > 0.8 ? light! : facing < 0.35 ? shade! : middle!);
          }
    },
    width < TEXELS_PER_METRE ? 1 : 2,
  );
  return r;
}

/** The picture's width in texels for a diameter, at least 3. */
const texels = (diameter: number) => Math.max(3, Math.round(diameter * TEXELS_PER_METRE));

/** A billowing cloud `diameter` metres across: a broad lump low and smaller ones heaped above it. */
function cloud(diameter: number, seed: number, palette: readonly number[]): Raster {
  const width = texels(diameter);
  const edge = Math.max(1, width / 20);
  const next = sequence(seed);
  const lumps: Lump[] = [];
  for (let i = 0; i < 9; i++) {
    const radius = width * (0.14 + 0.08 * next());
    const angle = next() * 2 * Math.PI,
      reach = (width / 2 - edge - radius) * Math.sqrt(next());
    lumps.push([width / 2 + Math.cos(angle) * reach, width / 2 + Math.sin(angle) * reach, radius]);
  }
  // The lowest lumps first, so the upper ones heap in front of them.
  lumps.sort((a, b) => b[1] - a[1]);
  lumps.unshift([width / 2, width - edge - width * 0.22, width * 0.22]);
  return drawLumps(width, lumps, palette);
}

/** Water drops thrown from a tire: scattered small drops within the picture's disc. */
function drops(diameter: number, seed: number, palette: readonly number[]): Raster {
  const width = texels(diameter);
  const next = sequence(seed);
  const radius = Math.max(1, width * 0.07);
  const lumps: Lump[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = next() * 2 * Math.PI,
      reach = (width / 2 - radius - 1) * Math.sqrt(next());
    lumps.push([
      width / 2 + Math.cos(angle) * reach,
      width / 2 + Math.sin(angle) * reach,
      radius * (0.7 + 0.6 * next()),
    ]);
  }
  return drawLumps(width, lumps, palette);
}

/** A flat mist of spray: low wide lumps. */
function mist(diameter: number, seed: number, palette: readonly number[]): Raster {
  const width = texels(diameter);
  const next = sequence(seed);
  const lumps: Lump[] = [];
  for (let i = 0; i < 5; i++) {
    const radius = width * (0.16 + 0.06 * next());
    lumps.push([radius + 1 + next() * (width - 2 * radius - 2), width - radius - 1 - next() * width * 0.3, radius]);
  }
  lumps.sort((a, b) => b[1] - a[1]);
  return drawLumps(width, lumps, palette);
}

/** A drawn puff picture: its name, its raster and its named palettes (the first the default). */
export interface PuffPicture {
  readonly name: string;
  readonly raster: Raster;
  readonly palettes: Readonly<Record<string, readonly number[]>>;
}

const palettesOf = (tones: Readonly<Record<string, Tones>>) =>
  Object.fromEntries(Object.entries(tones).map(([name, colors]) => [name, rgb555Palette(colors)]));

/**
 * Every puff picture: per size `k` (0 the smallest), two cloud shapes `puff-cloud-<k>-a` and `-b` in the cloud palettes,
 * and spray's two shapes, the mist `puff-mist-<k>` and the drops `puff-drops-<k>`, in the spray palette.
 */
export function drawPuffPictures(): PuffPicture[] {
  const clouds = palettesOf(CLOUD_TONES),
    spray = palettesOf(SPRAY_TONES);
  const smoke = clouds.smoke!,
    water = spray.spray!;
  return PUFF_DIAMETERS.flatMap((diameter, k) => [
    { name: `puff-cloud-${k}-a`, raster: cloud(diameter, 11 + k, smoke), palettes: clouds },
    { name: `puff-cloud-${k}-b`, raster: cloud(diameter, 31 + k, smoke), palettes: clouds },
    { name: `puff-mist-${k}`, raster: mist(diameter, 51 + k, water), palettes: spray },
    { name: `puff-drops-${k}`, raster: drops(diameter, 71 + k, water), palettes: spray },
  ]);
}
