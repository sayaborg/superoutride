/**
 * RACING HERO's objects as boards ([Original road data](../../docs/original-road-data.md#racing-heros-objects)): each
 * picture a sprite shows, as it shows it (mirrored or not), becomes a course image of its largest size's parts drawn
 * together, in every palette it is shown in, on the texel grid by chosen lines. The pictures are the ROMs', provisional:
 * the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { chosenLines, paletteName, PIXEL_ASPECT } from './pixel-grid.js';
import { paletteRgb555 } from './road-tables.js';
import { spritePixels } from './sprite-pixels.js';
import { COUNTRY_PALETTES, pictureSize, readSpritePalette } from './racing-hero-sprites.js';
import { spotBox, type Spot } from './racing-hero-objects.js';

/** The signal's palette and its lamp's color, drawn lit (the program lights it while the race runs). */
const SIGNAL_PALETTE = 0x2b;
const SIGNAL_LAMP = 12;
const SIGNAL_LIT = 0x6ff0;
/** Pixels 0 and 15 are transparent. */
const TRANSPARENT = 15;
/** The routines of the strips, drawn 1:1 across from the object's point outward: boards extending sideways. */
const STRIP_ROUTINES = Object.freeze(new Set([0x20, 0x30]));

const hex = (value: number, digits: number) => value.toString(16).padStart(digits, '0');

/**
 * A sprite's image name: a standing part of a surface type by its picture record, `rachero-<picture>`, any other by
 * its type, `rachero-<type>`; then whether it shows mirrored.
 */
export function boardName(spot: Spot): string {
  const base = spot.what === 'standing' ? hex(spot.parts[0]!.picture, 5) : hex(spot.type, 3);
  return `rachero-${base}${spotMirrored(spot) ? '-mirrored' : ''}`;
}

/** Whether a sprite shows its picture mirrored: a standing part as it is drawn, any other as its object is. */
const spotMirrored = (spot: Spot) => (spot.what === 'standing' ? spot.parts[0]!.mirrored : spot.mirrored);

/**
 * A palette's name in an image: its number, the country's set B's 0x80–0xFF (the evening's) 256 more, as they are
 * other colors.
 */
export const boardPalette = (palette: number, set: 'A' | 'B') =>
  paletteName(set === 'B' && palette >= COUNTRY_PALETTES ? palette + 256 : palette);

/** One sprite's use of a board: its spot, the palette it is drawn in and the country's set. */
export interface BoardUse {
  readonly spot: Spot;
  readonly set: 'A' | 'B';
}

/**
 * The boards' images, at `unit` metres a lateral unit: each name's picture unmirrored (its parts drawn together, the
 * first on top, pixels 0 and 15 transparent) on the texel grid by chosen lines, mirrored as its name says, in each
 * palette its uses draw it in; a strip's extends sideways the way its picture lies from its point.
 */
export function racingHeroBoards(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[], unit: number) {
  const named = new Map<string, { spot: Spot; palettes: Map<string, number[]> }>();
  for (const { spot, set } of uses) {
    const name = boardName(spot);
    if (!named.has(name)) named.set(name, { spot, palettes: new Map() });
    const palettes = new Set(spot.parts.map((p) => p.palette));
    if (palettes.size !== 1) throw new RangeError(`${name} is drawn in more than one palette`);
    const [palette] = palettes;
    named.get(name)!.palettes.set(boardPalette(palette!, set), colorsOf(main, palette!, set));
  }
  const images: { name: string; texels: number; image: { path: string; bytes: Uint8Array } }[] = [];
  for (const [name, { spot, palettes }] of [...named].sort(([a], [b]) => (a < b ? -1 : 1))) {
    // The picture as the unmirrored object draws it: each part mirrored by its own flag alone.
    const mirrored = spotMirrored(spot);
    const parts = spot.parts.map((p) => (mirrored ? { ...p, mirrored: !p.mirrored, x: -(p.x + p.width) } : p));
    const box = spotBox({ ...spot, parts });
    const width = box.right - box.left,
      height = box.bottom - box.top;
    const indices = new Uint8Array(width * height);
    for (const part of [...parts].reverse()) {
      const pixels = spritePixels(words, pictureSize(main, part.picture));
      for (let y = 0; y < part.height; y++)
        for (let x = 0; x < part.width; x++) {
          const v = pixels[y * part.width + (part.mirrored ? part.width - 1 - x : x)]!;
          if (v && v !== TRANSPARENT) indices[(part.y - box.top + y) * width + part.x - box.left + x] = v;
        }
    }
    const across = spot.pixel * unit * SPRITE_SOURCE_TEXELS_PER_METER;
    const grid = chosenLines(indices, width, across, across * PIXEL_ASPECT);
    const shown = mirrored ? mirrorRows(grid.indices, grid.width) : grid.indices;
    const sorted = [...palettes].sort(([a], [b]) => (a < b ? -1 : 1));
    // A strip lying left of its point (by its middle) extends left, from the road outward; one lying right, right.
    const extend = STRIP_ROUTINES.has(spot.routine)
      ? box.left + box.right < 0 !== mirrored
        ? ('left' as const)
        : ('right' as const)
      : null;
    const master: SpriteLodDocument = {
      format: 'superoutride.sprite-lod',
      version: 5,
      name,
      width: grid.width,
      height: grid.height,
      anchorX: grid.width / 2 - 0.5,
      defaultPalette: sorted[0]![0],
      palettes: Object.fromEntries(sorted.map(([p, colors]) => [p, { colors }])),
      levels: [{ paletteRgb555: sorted[0]![1], indices: shown, mixtures: spriteIdentityMixtures() }],
      ...(extend ? { extend } : {}),
    };
    images.push({ name, texels: grid.width * grid.height, image: courseImageFile(master) });
  }
  return images;
}

/** A palette's 16 colors, pixels 0 and 15 transparent, the signal's lamp lit. */
function colorsOf(main: Uint8Array, palette: number, set: 'A' | 'B'): number[] {
  const words = readSpritePalette(main, palette, set).words.map((w, k) =>
    palette === SIGNAL_PALETTE && k === SIGNAL_LAMP ? SIGNAL_LIT : w,
  );
  return words.map((w, k) => (k === 0 || k === TRANSPARENT ? 0 : paletteRgb555(w)));
}

/** Row-major indices mirrored across. */
function mirrorRows(indices: readonly number[], width: number): number[] {
  return indices.map((_, i) => indices[i - (i % width) + width - 1 - (i % width)]!);
}
