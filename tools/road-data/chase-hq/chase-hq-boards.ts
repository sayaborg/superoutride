/**
 * CHASE H.Q.'s things' pictures as course images ([CHASE H.Q. road data](../../../docs/chase-hq-road-data.md#chase-hqs-objects)):
 * each kind's pieces at their full size (`chase-hq-things`), the first over those after it as the sprite list is drawn
 * from its last entry, each in its palette line's colors as the program fades them in (M 0x1484), pen 0 transparent;
 * one picture, its colors as [Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces)'
 * (`joinedColors`), by chosen lines and the sprites' rules, with no shadow, its base point the thing's point on the
 * ground; a gate's middle that picture and its band across the road ([Strips](../../../docs/original-road-data.md#strips)),
 * and a tunnel's mouth, larger than a picture may be, its pieces each a picture of its own.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { instruction, word } from '../cpu/program-words.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { bandBoards } from '../shared/band-boards.js';
import { croppedPieces, joinedColors, layPieces, type Laid } from '../shared/joined-pictures.js';
import { boardColors, namedBoardMaster, paletteName, texelsAPixel, TRANSPARENT_PENS } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { rgb555Of } from '../taito/palette.js';
import { BIG_SPRITE, zBigSprite } from '../taito/z-sprites.js';
import { PIXEL_ASPECT } from '../taito/z-system-display.js';
import { chaseHqThings, type ChaseHqPiece } from './chase-hq-things.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;
/** A palette line's pens. */
const PENS = 16;

const hex3 = (n: number) => n.toString(16).padStart(3, '0');
/** A kind's image name: `chasehq-<its kind, three hex digits>`. */
export const thingName = (kind: number) => `chasehq-${hex3(kind)}`;
/** A kept piece's image name: `chasehq-sprite-<its sprite, three hex digits>`, then as it is drawn. */
const pieceName = (p: ChaseHqPiece) =>
  `chasehq-sprite-${hex3(p.sprite)}${p.flipX ? '-mirrored' : ''}${p.flipY ? '-flipped' : ''}`;

/** The palette's colors as the main program fades them in (M 0x1484: entry e at its table's 2e), by line and pen. */
function startColors(main: Uint8Array) {
  const [high, low] = instruction(
    main,
    0x1484,
    [0x207c, null, null, 0x3200, 0xd241, 0xd0c1],
    "the palette's colors (movea.l, move.w, add.w, adda.w)",
  );
  const table = high * 0x10000 + low;
  return (line: number) =>
    Array.from({ length: PENS }, (_, pen) => rgb555Of(word(main, table + 2 * (line * PENS + pen))));
}

/** The sprites (OBJ A and the spritemap, `assembleChaseHqSprites`). */
type Sprites = { readonly gfx: Uint8Array; readonly map: Uint8Array };

/**
 * What every picture of a kind is drawn from, a pixel `pixel` metres across and `PIXEL_ASPECT` times that down: its
 * pieces, a piece's pens as drawn, its pieces laid on one grid at their full size, and their colors.
 */
function drawing(main: Uint8Array, sprites: Sprites, pixel: number) {
  const things = chaseHqThings(main);
  const colors = startColors(main);
  const drawn = new Map<number, Uint8Array>();
  const pensOf = (p: ChaseHqPiece) => {
    if (!drawn.has(p.sprite)) drawn.set(p.sprite, zBigSprite(sprites.gfx, sprites.map, p.sprite));
    const pens = drawn.get(p.sprite)!;
    return Uint8Array.from({ length: pens.length }, (_, at) => {
      const [x, y] = [at % BIG_SPRITE, Math.floor(at / BIG_SPRITE)];
      return pens[(p.flipY ? BIG_SPRITE - 1 - y : y) * BIG_SPRITE + (p.flipX ? BIG_SPRITE - 1 - x : x)]!;
    });
  };
  const laidOf = (name: string, pieces: readonly ChaseHqPiece[]) =>
    croppedPieces(
      layPieces(
        pieces.map((p, k) => ({
          unit: name,
          s: 0,
          pixels: { width: BIG_SPRITE, height: BIG_SPRITE, pixels: pensOf(p) },
          pixel,
          aspect: PIXEL_ASPECT,
          left: p.x * pixel,
          bottom: -(p.y + BIG_SPRITE) * pixel * PIXEL_ASPECT,
          floats: false,
          joins: true,
          order: pieces.length - 1 - k,
        })),
      ),
    );
  const colorsOf = (laid: Laid | Omit<Laid, 'places'>, pieces: readonly ChaseHqPiece[]) =>
    joinedColors(
      laid,
      pieces.map((p) => [{ name: paletteName(p.line), colors: colors(p.line) }]),
    );
  /** The row whose bottom edge is the ground, rows from the laid grid's top. */
  const groundRow = (laid: Laid) => Math.round(laid.top / (pixel * PIXEL_ASPECT)) - 1;
  return { things, colors, pensOf, laidOf, colorsOf, groundRow, texels: texelsAPixel(pixel, PIXEL_ASPECT) };
}

/**
 * The kinds' pictures as boards, a pixel `pixel` metres across and `PIXEL_ASPECT` times that down, by `sprites`: one a
 * kind, standing on the ground at the thing's point where a piece reaches it, else floating at its lowest colored row's
 * height (`groundOffset`, metres). With its colored columns from its point (metres on its image, right positive), its
 * width, how many colors it drew and the share of its pixels whose color another took.
 */
export function chaseHqBoards(main: Uint8Array, sprites: Sprites, kinds: readonly number[], pixel: number) {
  const d = drawing(main, sprites, pixel);
  return [...new Set(kinds)]
    .sort((a, b) => a - b)
    .map((kind) => {
      const name = thingName(kind);
      const pieces = d.things(kind);
      const laid = d.laidOf(name, pieces);
      const joined = d.colorsOf(laid, pieces);
      const source = joined.picture;
      const ground = d.groundRow(laid);
      const stands = ground < source.height;
      const parts = pictureParts(
        source,
        undefined,
        stands ? { base: ground, reason: "the thing's point on the ground" } : undefined,
      );
      const grid = partsOnGrid(source, parts, d.texels.across, d.texels.down);
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${name} is larger than imageMasterTexels`);
      const point = -laid.left / pixel;
      const anchor = { x: (point * grid.width) / source.width - 0.5, y: grid.anchorY };
      const master = namedBoardMaster(name, grid, grid.indices, anchor, joined.palettes);
      let [from, to] = [Infinity, -Infinity];
      source.pixels.forEach((v, at) => {
        if (v) [from, to] = [Math.min(from, at % source.width), Math.max(to, (at % source.width) + 1)];
      });
      // A source column's metres on the image's grid.
      const across = grid.width / source.width / SPRITE_SOURCE_TEXELS_PER_METER;
      return {
        kind,
        name,
        palette: joined.palettes[0]!.name,
        colored: [(from - point) * across, (to - point) * across] as const,
        groundOffset: stands ? 0 : (ground - source.height + 1) * pixel * PIXEL_ASPECT,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct: joined.distinct,
        replaced: joined.replaced,
        image: courseImageFile(master),
      };
    });
}

/**
 * Gates' middles as bands across the road ([Strips](../../../docs/original-road-data.md#strips)), by `sprites`, a pixel
 * `pixel` metres across: each kind its picture drawn once, its point the thing's, and beyond its edges its band, the
 * columns of its outermost piece (the last 128 of the picture's), a board extending right and its mirror left, all cut
 * from one grid (`bandBoards`), floating at its lowest colored row's height (`groundOffset`, metres), the bands `rise`
 * metres higher where their last row lies above it; the band's names the picture's and `-band`, `-band-mirrored`.
 */
export function chaseHqBands(main: Uint8Array, sprites: Sprites, kinds: readonly number[], pixel: number) {
  const d = drawing(main, sprites, pixel);
  return [...new Set(kinds)]
    .sort((a, b) => a - b)
    .map((kind) => {
      const name = thingName(kind);
      const pieces = d.things(kind);
      const laid = d.laidOf(name, pieces);
      // The laid grid with its last columns beyond its right edge and their mirror beyond its left.
      const [w, h] = [laid.width, laid.height];
      const width = w + 2 * BIG_SPRITE;
      const pens = new Uint8Array(width * h);
      const owner = new Int16Array(width * h).fill(-1);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < width; x++) {
          const u = x < BIG_SPRITE ? w - 1 - x : x < BIG_SPRITE + w ? x - BIG_SPRITE : x - BIG_SPRITE - BIG_SPRITE;
          [pens[y * width + x], owner[y * width + x]] = [laid.pens[y * w + u]!, laid.owner[y * w + u]!];
        }
      const joined = d.colorsOf({ ...laid, width, pens, owner }, pieces);
      const ground = d.groundRow(laid);
      if (ground < h) throw contractUnmet(`${name}, a gate's middle, reaches the ground`);
      const { picture, bands, rise } = bandBoards(
        { picture: name, band: `${name}-band`, mirrored: `${name}-band-mirrored` },
        joined.picture,
        pictureParts(joined.picture, undefined),
        [BIG_SPRITE, BIG_SPRITE + w],
        BIG_SPRITE - laid.left / pixel,
        d.texels,
        joined.palettes,
      );
      return {
        kind,
        names: [picture.name, ...bands.map((b) => b.name)],
        palette: joined.palettes[0]!.name,
        groundOffset: (ground - h + 1) * pixel * PIXEL_ASPECT,
        rise,
        images: [picture, ...bands].map((master) => courseImageFile(master)),
      };
    });
}

/**
 * Tunnels' mouths, larger than a picture may be, as their pieces ([Things of several
 * pieces](../../../docs/original-road-data.md#things-of-several-pieces)), by `sprites`, a pixel `pixel` metres across:
 * each kind's pieces in the order they are drawn, each its sprite's picture as drawn (`chasehq-sprite-<sprite>`, its
 * pens its line's colors, a palette a line), its middle `across` metres right of the thing's point and its base row's
 * bottom `groundOffset` metres up, with its colored columns from its middle; and each sprite's image once.
 */
export function chaseHqKeptPieces(main: Uint8Array, sprites: Sprites, kinds: readonly number[], pixel: number) {
  const d = drawing(main, sprites, pixel);
  const lines = new Map<string, { piece: ChaseHqPiece; lines: Set<number> }>();
  const placed = new Map(
    [...new Set(kinds)].map((kind) => {
      const pieces = d.things(kind);
      for (const p of pieces) {
        const entry = lines.get(pieceName(p)) ?? { piece: p, lines: new Set<number>() };
        lines.set(pieceName(p), entry.lines.add(p.line) && entry);
      }
      return [kind, [...pieces].reverse()] as const;
    }),
  );
  const images = new Map(
    [...lines].map(([name, { piece, lines: used }]) => {
      const source = { width: BIG_SPRITE, height: BIG_SPRITE, pixels: d.pensOf(piece) };
      const parts = pictureParts(source, undefined);
      const grid = partsOnGrid(source, parts, d.texels.across, d.texels.down);
      const palettes = [...used]
        .sort((a, b) => a - b)
        .map((line) => ({
          name: paletteName(line),
          colors: boardColors(d.colors(line).slice(1), TRANSPARENT_PENS.taito),
        }));
      const master = namedBoardMaster(name, grid, grid.indices, { x: grid.width / 2 - 0.5, y: grid.anchorY }, palettes);
      let [from, to] = [Infinity, -Infinity];
      source.pixels.forEach((v, at) => {
        if (v) [from, to] = [Math.min(from, at % BIG_SPRITE), Math.max(to, (at % BIG_SPRITE) + 1)];
      });
      const across = grid.width / BIG_SPRITE / SPRITE_SOURCE_TEXELS_PER_METER;
      const half = BIG_SPRITE / 2;
      return [
        name,
        {
          base: parts.base,
          colored: [(from - half) * across, (to - half) * across] as const,
          image: courseImageFile(master),
        },
      ] as const;
    }),
  );
  return {
    images: [...images.values()].map((i) => i.image),
    kinds: new Map(
      [...placed].map(([kind, pieces]) => [
        kind,
        pieces.map((p) => {
          const image = images.get(pieceName(p))!;
          return {
            name: pieceName(p),
            palette: paletteName(p.line),
            across: (p.x + BIG_SPRITE / 2) * pixel,
            groundOffset: -(p.y + image.base + 1) * pixel * PIXEL_ASPECT,
            colored: image.colored,
          };
        }),
      ]),
    ),
  };
}
