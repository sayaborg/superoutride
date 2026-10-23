/**
 * SUPER MONACO GP's objects as boards ([SUPER MONACO GP road data](../../docs/super-monaco-gp-road-data.md#super-monaco-gps-objects)):
 * each picture an object shows, as it shows it (mirrored, flipped), becomes a course image of its frame table's largest
 * size in every palette it is shown in, on the texel grid by chosen lines. The pictures are the ROMs', provisional: the
 * product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { chosenLines, paletteName, PIXEL_ASPECT } from './pixel-grid.js';
import { largestPixels, readSpritePalette } from './super-monaco-gp-sprites.js';

/** An object's sprite flags: its palette, mirrored, flipped, and its base point at its picture's middle. */
export const FLAG = Object.freeze({ palette: 0xff, mirrored: 0x400, flipped: 0x800, middle: 0x2000 } as const);
/** Pixels 0 and 15 are transparent. */
const TRANSPARENT = 15;

/** The lateral units a largest-size pixel spans at size class `b1`: 8 / 2^b1, and 16 for 0xFF. */
export const pixelUnits = (b1: number) => (b1 === 0xff ? 16 : 8 / 2 ** b1);

/**
 * One way an object shows a picture: its frame table at a size class, mirrored, flipped, in a palette, and, folding
 * at the ground's row, how many texels above its bottom edge it folds.
 */
export interface BoardUse {
  readonly frames: number;
  readonly b1: number;
  readonly mirrored: boolean;
  readonly flipped: boolean;
  readonly palette: number;
  readonly fold?: number;
}

const hex = (value: number, digits: number) => value.toString(16).padStart(digits, '0');
/** A board's image name: `smgp-<frame table>-<size class>`, then whether mirrored and flipped. */
export const boardName = (use: Omit<BoardUse, 'palette' | 'fold'>) =>
  `smgp-${hex(use.frames, 4)}-${hex(use.b1, 2)}${use.mirrored ? '-mirrored' : ''}${use.flipped ? '-flipped' : ''}`;

/** A picture's indices turned as an object shows it: mirrored across, flipped upside down. */
function turned(indices: ArrayLike<number>, width: number, mirrored: boolean, flipped: boolean): number[] {
  const height = indices.length / width;
  return Array.from({ length: indices.length }, (_, i) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return indices[(flipped ? height - 1 - y : y) * width + (mirrored ? width - 1 - x : x)]!;
  });
}

/** The boards' images, at `unit` metres a lateral unit, and their sizes for the report. */
export function superMonacoGpBoards(main: Uint8Array, words: Uint32Array, boards: readonly BoardUse[], unit: number) {
  const colors = (p: number) => [0, ...readSpritePalette(main, p).rgb555, 0];
  const palettesOf = (palettes: ReadonlySet<number>) => {
    const sorted = [...palettes].sort((a, b) => a - b);
    return {
      defaultPalette: paletteName(sorted[0]!),
      palettes: Object.fromEntries(sorted.map((p) => [paletteName(p), { colors: colors(p) }])),
      base: colors(sorted[0]!),
    };
  };
  // A frame table's largest size by chosen lines at a size class, unturned, its pixel 15 transparent.
  const grids = new Map<string, ReturnType<typeof chosenLines>>();
  const grid = (frames: number, b1: number) => {
    const key = `${frames} ${b1}`;
    if (!grids.has(key)) {
      const { width, pixels } = largestPixels(main, words, frames);
      const across = pixelUnits(b1) * unit * SPRITE_SOURCE_TEXELS_PER_METER;
      grids.set(
        key,
        chosenLines(
          pixels.map((v) => (v === TRANSPARENT ? 0 : v)),
          width,
          across,
          across * PIXEL_ASPECT,
        ),
      );
    }
    return grids.get(key)!;
  };
  // A master: the grid turned as shown (the unturned grid's lines turned, so a turned picture keeps its lines), its
  // base point the middle of its bottom edge, or `fold` texels above it.
  const master = (
    name: string,
    frames: number,
    b1: number,
    mirrored: boolean,
    flipped: boolean,
    fold: number | undefined,
    colors: ReturnType<typeof palettesOf>,
  ): SpriteLodDocument => {
    const g = grid(frames, b1);
    return {
      format: 'superoutride.sprite-lod',
      version: 6,
      name,
      width: g.width,
      height: g.height,
      anchorX: g.width / 2 - 0.5,
      ...(fold === undefined ? {} : { anchorY: g.height - 0.5 - fold }),
      defaultPalette: colors.defaultPalette,
      palettes: colors.palettes,
      levels: [
        {
          paletteRgb555: colors.base,
          indices: turned(g.indices, g.width, mirrored, flipped),
          mixtures: spriteIdentityMixtures(),
        },
      ],
    };
  };
  const group = <Use extends { readonly palette: number }>(uses: readonly Use[], name: (use: Use) => string) => {
    const named = new Map<string, { use: Use; palettes: Set<number> }>();
    for (const use of uses) {
      const key = name(use);
      if (!named.has(key)) named.set(key, { use, palettes: new Set() });
      named.get(key)!.palettes.add(use.palette);
    }
    return [...named].sort(([a], [b]) => (a < b ? -1 : 1));
  };
  const images: { name: string; texels: number; image: { path: string; bytes: Uint8Array } }[] = [];
  for (const [name, { use, palettes }] of group(boards, boardName)) {
    if (boards.some((u) => boardName(u) === name && u.fold !== use.fold))
      throw new RangeError(`Board ${name} is shown folded and standing alike`);
    const board = master(name, use.frames, use.b1, use.mirrored, use.flipped, use.fold, palettesOf(palettes));
    images.push({ name, texels: board.width * board.height, image: courseImageFile(board) });
  }
  return images;
}
