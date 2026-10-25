/**
 * ENDURO RACER's objects as boards ([ENDURO RACER road data](../../docs/enduro-racer-road-data.md#enduro-racers-objects)): each
 * picture an object shows, mirrored as shown, becomes a course image of its unscaled size's drawn rows in every palette
 * it is shown in, on the texel grid by chosen lines, its base point the middle of its bottom, its pixel 10 its shadow.
 * The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { chosenLines, footAnchorY, paletteName, PIXEL_ASPECT, SHADOW_PEN } from './pixel-grid.js';
import { readSpritePalette, sizeSetPixels } from './enduro-racer-sprites.js';

/** Lateral units an unscaled pixel spans: the hardware draws it at depth number 0x7F, where a unit is 125/128 pixels. */
export const PIXEL_UNITS = 128 / 125;
/** Pixel 10 is a shadow: scenery is drawn with shadows allowed, and it darkens what lies behind it. */
const SHADOW = SHADOW_PEN;

/** One way an object shows a picture: its size set, mirrored or not, in a palette, raised off the ground or not. */
export interface PictureUse {
  readonly sizes: number;
  readonly mirrored: boolean;
  readonly palette: number;
  readonly raised: boolean;
}
/** A picture's image name: `enduror-<size set, five hex digits>`, then whether mirrored. */
export const pictureName = (use: Pick<PictureUse, 'sizes' | 'mirrored'>) =>
  `enduror-${use.sizes.toString(16).padStart(5, '0')}${use.mirrored ? '-mirrored' : ''}`;

/** A picture's source, unmirrored: its pixels, `width` wide. */
interface Source {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

const mirror = (pixels: Uint8Array, width: number) =>
  pixels.map((_, i) => pixels[i - (i % width) + width - 1 - (i % width)]!);

/**
 * The colored pixels' width, metres at `unit` a lateral unit: from the leftmost to the rightmost column holding a pixel
 * other than the shadow's.
 */
function coloredWidth(source: Source, unit: number) {
  let [lo, hi] = [Infinity, -Infinity];
  source.pixels.forEach((v, i) => {
    if (v === 0 || v === SHADOW) return;
    const x = i % source.width;
    [lo, hi] = [Math.min(lo, x), Math.max(hi, x)];
  });
  return hi < lo ? 0 : (hi - lo + 1) * PIXEL_UNITS * unit;
}

/**
 * The boards the uses need, at `unit` metres a lateral unit, with each one's colored width in metres: one a name (`tag`
 * after a use's),
 * carrying every palette it is shown in (the lowest its default), its pixels (a size set's drawn rows, a mirrored
 * picture the unmirrored one's mirrored) by chosen lines onto its texel grid, a pixel `PIXEL_UNITS` across and
 * `PIXEL_ASPECT` times that down at 40 texels/m, chosen once with pixel 10 among the colors: the board its other
 * pixels, its shadow its pixel 10. Its base point is its middle on its bottom edge.
 */
export function enduroRacerBoards(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly PictureUse[],
  unit: number,
  tag = '',
) {
  const sources = new Map<string, { source: Source; palettes: Set<number>; ground: boolean; raised: boolean }>();
  const add = (name: string, source: () => Source, palette: number, raised: boolean) => {
    if (!sources.has(name)) sources.set(name, { source: source(), palettes: new Set(), ground: false, raised: false });
    const entry = sources.get(name)!;
    entry.palettes.add(palette);
    entry[raised ? 'raised' : 'ground'] = true;
  };
  for (const use of uses)
    add(
      pictureName(use) + tag,
      () => {
        const { width, height, pixels } = sizeSetPixels(main, words, use.sizes);
        return { width, height, pixels };
      },
      use.palette,
      use.raised,
    );
  const across = PIXEL_UNITS * unit * SPRITE_SOURCE_TEXELS_PER_METER;
  const boards = [...sources]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([name, { source, palettes, ground, raised }]) => {
      // A mirrored picture is the unmirrored one's lines mirrored.
      const mirrored = name.slice(0, name.length - tag.length).endsWith('-mirrored');
      const grid = chosenLines(source.pixels, source.width, across, across * PIXEL_ASPECT);
      const chosen = mirrored ? mirror(Uint8Array.from(grid.indices), grid.width) : grid.indices;
      const indices = Array.from(chosen, (v) => (v === SHADOW ? 0 : v));
      const shadow = Array.from(chosen, (v) => (v === SHADOW ? 1 : 0));
      const scale = { x: grid.width / source.width, y: grid.height / source.height };
      const anchorX = (source.width / 2) * scale.x - 0.5;
      const sorted = [...palettes].sort((a, b) => a - b);
      const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555.slice(1, 15), 0];
      const board = (named: string, anchorY: number | undefined): SpriteLodDocument => ({
        format: 'superoutride.sprite-lod',
        version: 7,
        name: named,
        width: grid.width,
        height: grid.height,
        anchorX,
        ...(anchorY === undefined ? {} : { anchorY }),
        defaultPalette: paletteName(sorted[0]!),
        palettes: Object.fromEntries(sorted.map((p) => [paletteName(p), { colors: colors(p) }])),
        levels: [{ paletteRgb555: colors(sorted[0]!), indices, mixtures: spriteIdentityMixtures() }],
        // The shadow on the picture's grid, anchored as the picture is.
        ...(shadow.some((v) => v)
          ? {
              shadow: {
                width: grid.width,
                height: grid.height,
                anchorX,
                anchorY: anchorY ?? grid.height - 0.5,
                levels: [{ indices: shadow }],
              },
            }
          : {}),
      });
      const entry = (master: SpriteLodDocument) => ({
        name: master.name,
        colored: coloredWidth(source, unit),
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        image: courseImageFile(master),
        split: false,
      });
      // On the ground a picture stands at its foot; raised off it, on its bottom edge (`-raised` where both are).
      const foot = ground ? footAnchorY(indices, grid.width, null) : undefined;
      if (foot === undefined) return [entry(board(name, undefined))];
      if (!raised) return [entry(board(name, foot))];
      return [{ ...entry(board(name, foot)), split: true }, entry(board(`${name}-raised`, undefined))];
    });
  return boards;
}

/**
 * Where the program draws a jump's picture across the road, and its color: its two halves, the left as it is and the
 * right mirrored, each's bottom middle at its x (`left`, `right`, lateral units from P), from the left half's left edge
 * to the right half's right edge, metres at `unit` a lateral unit; the average of their pixels' colors in the kind's
 * palette, the shadow's and the transparent ones aside (RGB555).
 */
export function jumpPicture(
  main: Uint8Array,
  words: Uint32Array,
  jump: { readonly left: number; readonly right: number; readonly sizes: number; readonly palette: number },
  unit: number,
) {
  const half = sizeSetPixels(main, words, jump.sizes);
  const palette = readSpritePalette(main, jump.palette).rgb555;
  const sums = [0, 0, 0];
  let count = 0;
  for (const v of half.pixels) {
    if (v === 0 || v === SHADOW || v === 15) continue;
    for (let c = 0; c < 3; c++) sums[c]! += (palette[v]! >> (5 * c)) & 31;
    count++;
  }
  if (!count) throw new RangeError(`The jump's picture 0x${jump.sizes.toString(16)} has no colored pixel`);
  const width = (half.width * PIXEL_UNITS) / 2;
  return {
    left: (Math.min(jump.left, jump.right) - width) * unit,
    right: (Math.max(jump.left, jump.right) + width) * unit,
    color: sums.reduce((rgb, sum, c) => rgb | (Math.round(sum / count) << (5 * c)), 0),
  };
}
