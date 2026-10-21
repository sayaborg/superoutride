/**
 * SUPER MONACO GP's objects as boards ([Original road data](../../docs/original-road-data.md#super-monaco-gps-objects)):
 * each picture an object shows, as it shows it (mirrored, flipped), becomes a course image of its frame table's largest
 * size in every palette it is shown in, on the texel grid by chosen lines; each view table an object turns through, at
 * its size class and mirrored or not, becomes a view set of those pictures. The pictures are the ROMs', provisional:
 * the product draws its own.
 */
import { courseImageFile, courseViewsFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { SPRITE_VIEW_COUNT } from '../../src/image/sprite-views.js';
import { chosenLines, paletteName, PIXEL_ASPECT } from './pixel-grid.js';
import { largestPixels, readSpritePalette, readViewTable } from './super-monaco-gp-sprites.js';

/** An object's sprite flags: its palette, mirrored, flipped, and its base point at its picture's middle. */
export const FLAG = Object.freeze({ palette: 0xff, mirrored: 0x400, flipped: 0x800, middle: 0x2000 } as const);
/** Pixels 0 and 15 are transparent. */
const TRANSPARENT = 15;

/** The lateral units a largest-size pixel spans at size class `b1`: 8 / 2^b1, and 16 for 0xFF. */
export const pixelUnits = (b1: number) => (b1 === 0xff ? 16 : 8 / 2 ** b1);

/** One way an object shows a picture: its frame table at a size class, mirrored, flipped, about its bottom or middle. */
export interface BoardUse {
  readonly frames: number;
  readonly b1: number;
  readonly mirrored: boolean;
  readonly flipped: boolean;
  readonly middle: boolean;
  readonly palette: number;
}
/** One way an object turns through a view table: at a size class, every view mirrored or not, about its bottom or middle. */
export interface ViewsUse {
  readonly table: number;
  readonly b1: number;
  readonly mirrored: boolean;
  readonly middle: boolean;
  readonly palette: number;
}

const hex = (value: number, digits: number) => value.toString(16).padStart(digits, '0');
/** A board's image name: `smgp-<frame table>-<size class>`, then whether mirrored and flipped. */
export const boardName = (use: Omit<BoardUse, 'middle' | 'palette'>) =>
  `smgp-${hex(use.frames, 4)}-${hex(use.b1, 2)}${use.mirrored ? '-mirrored' : ''}${use.flipped ? '-flipped' : ''}`;
/** A view set's image name: `smgp-views-<view table>-<size class>`, then whether every view is mirrored. */
export const viewsName = (use: Omit<ViewsUse, 'middle' | 'palette'>) =>
  `smgp-views-${hex(use.table, 4)}-${hex(use.b1, 2)}${use.mirrored ? '-mirrored' : ''}`;

/** A picture's indices turned as an object shows it: mirrored across, flipped upside down. */
function turned(indices: ArrayLike<number>, width: number, mirrored: boolean, flipped: boolean): number[] {
  const height = indices.length / width;
  return Array.from({ length: indices.length }, (_, i) => {
    const [x, y] = [i % width, Math.floor(i / width)];
    return indices[(flipped ? height - 1 - y : y) * width + (mirrored ? width - 1 - x : x)]!;
  });
}

/** The boards' and view sets' images, at `unit` metres a lateral unit, and their sizes for the report. */
export function superMonacoGpBoards(
  main: Uint8Array,
  sub: Uint8Array,
  words: Uint32Array,
  boards: readonly BoardUse[],
  views: readonly ViewsUse[],
  unit: number,
) {
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
  // base point the middle of its bottom edge, or of the picture.
  const master = (
    name: string,
    frames: number,
    b1: number,
    mirrored: boolean,
    flipped: boolean,
    middle: boolean,
    colors: ReturnType<typeof palettesOf>,
  ): SpriteLodDocument => {
    const g = grid(frames, b1);
    return {
      format: 'superoutride.sprite-lod',
      version: 4,
      name,
      width: g.width,
      height: g.height,
      anchorX: g.width / 2 - 0.5,
      anchorY: (middle ? g.height / 2 : g.height) - 0.5,
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
    const board = master(name, use.frames, use.b1, use.mirrored, use.flipped, use.middle, palettesOf(palettes));
    images.push({ name, texels: board.width * board.height, image: courseImageFile(board) });
  }
  for (const [name, { use, palettes }] of group(views, viewsName)) {
    if (views.some((u) => viewsName(u) === name && u.middle !== use.middle))
      throw new RangeError(`The objects of view set ${name} stand by different base points`);
    // View i shows its frame table mirrored from view 16 on, or every view mirrored when the object is.
    const table = readViewTable(sub, use.table);
    const shown = table.map((frames, i) => ({ frames, mirrored: use.mirrored || i >= SPRITE_VIEW_COUNT / 2 }));
    const distinct = [...new Map(shown.map((s) => [`${s.frames} ${s.mirrored}`, s])).values()];
    const colors = palettesOf(palettes);
    const masters = distinct.map((s) => master(name, s.frames, use.b1, s.mirrored, false, use.middle, colors));
    images.push({
      name,
      texels: masters.reduce((sum, m) => sum + m.width * m.height, 0),
      image: courseViewsFile(
        name,
        masters,
        shown.map((s) => distinct.findIndex((d) => d.frames === s.frames && d.mirrored === s.mirrored)),
      ),
    });
  }
  return images;
}
