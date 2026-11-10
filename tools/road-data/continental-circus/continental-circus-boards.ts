/**
 * CONTINENTAL CIRCUS's things' pictures as course images ([CONTINENTAL CIRCUS road
 * data](../../../docs/continental-circus-road-data.md#its-things)): each description's pieces at their full size
 * (`continental-circus-things`), the first over those after it as the sprite list is drawn from its first entry, each
 * in its palette line's colors as the main program loads them at its start, pen 0 transparent. A description is one
 * picture, its pieces drawn as one unit at one point; of the descriptions one station puts out, a floating one and those
 * it touches are one thing by [Things of several pieces](../../../docs/original-road-data.md#things-of-several-pieces).
 * Each is one picture, its colors that rule's (`joinedColors`), by chosen lines and the sprites' rules, with no shadow.
 */
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER } from '../../../src/image/sprite.js';
import { contractUnmet } from '../shared/conversion-errors.js';
import { bandBoards } from '../shared/band-boards.js';
import { croppedPieces, joinedColors, layPieces, touchingThings, type JoinPiece } from '../shared/joined-pictures.js';
import { namedBoardMaster, paletteName, texelsAPixel } from '../shared/pixel-grid.js';
import { floats, partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { BIG_SPRITE } from '../taito/z-sprites.js';
import { UP } from './continental-circus-road-picture.js';
import { continentalCircusSprite, spriteColors, type ContinentalCircusSprites } from './continental-circus-sprites.js';
import {
  continentalCircusThings,
  THING_TYPE,
  type ContinentalCircusPiece,
  type ContinentalCircusThing,
} from './continental-circus-things.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

const hex5 = (address: number) => address.toString(16).padStart(5, '0');

/**
 * A thing's image name: a description's `contcirc-<its address, five hex digits>`; descriptions joined
 * `contcirc-joined-<the address of the one drawn first>`, the last a station puts out, and `-<n>` from the second
 * thing so named, in their order (`continentalCircusBoards`).
 */
export const stemOf = (addresses: readonly number[]) =>
  addresses.length === 1 ? `contcirc-${hex5(addresses[0]!)}` : `contcirc-joined-${hex5(addresses.at(-1)!)}`;

/** A picture's colored columns, pixels from its left edge: its first holding a pen other than 0 and past its last. */
function coloredOf(width: number, pens: Uint8Array) {
  let [from, to] = [Infinity, -Infinity];
  pens.forEach((v, at) => {
    if (v) [from, to] = [Math.min(from, at % width), Math.max(to, (at % width) + 1)];
  });
  return [from, to] as const;
}

/**
 * What every picture is drawn from, a pixel `pixel` metres across and `UP` times that down: the descriptions, a piece's
 * pens as drawn, and the pieces of descriptions (`described`, in the order a station puts them out) laid at their full
 * size, laterals from the road's centre, the first over those after it.
 */
function drawing(sub: Uint8Array, sprites: ContinentalCircusSprites, pixel: number) {
  const things = continentalCircusThings(sub);
  const drawn = new Map<number, Uint8Array>();
  const pensOf = (p: ContinentalCircusPiece) => {
    if (!drawn.has(p.sprite)) drawn.set(p.sprite, continentalCircusSprite(sprites, p.sprite));
    const pens = drawn.get(p.sprite)!;
    return Uint8Array.from({ length: pens.length }, (_, at) => {
      const [x, y] = [at % BIG_SPRITE, Math.floor(at / BIG_SPRITE)];
      return pens[y * BIG_SPRITE + (p.flipX ? BIG_SPRITE - 1 - x : x)]!;
    });
  };
  const piecesOf = (described: readonly ContinentalCircusThing[]) =>
    described.flatMap((t) => t.pieces.map((p) => ({ lateral: t.lateral, p })));
  const laidOf = (unit: string, described: readonly ContinentalCircusThing[]) => {
    const pieces = piecesOf(described);
    return croppedPieces(
      layPieces(
        pieces.map(({ lateral, p }, k) => ({
          unit,
          s: 0,
          pixels: { width: BIG_SPRITE, height: BIG_SPRITE, pixels: pensOf(p) },
          pixel,
          aspect: UP,
          left: (lateral + p.x) * pixel,
          bottom: -(p.y + BIG_SPRITE) * pixel * UP,
          floats: false,
          joins: true,
          order: pieces.length - 1 - k,
        })),
      ),
    );
  };
  const of = (addresses: readonly number[]) => addresses.map(things);
  /**
   * The point of `described` laid as `laid`, metres from the road's centre: one description's lateral, or the middle
   * of their outer edges.
   */
  const pointOf = (described: readonly ContinentalCircusThing[], laid: { left: number; width: number }) =>
    described.length === 1 ? described[0]!.lateral * pixel : laid.left + (laid.width * pixel) / 2;
  /**
   * The body of `described` about its point `lateral` (metres from the road's centre), `across` metres on its image a
   * source column: each description that hits its own car a part, the range of the car's centre it hits within its
   * own colored columns; null where none.
   */
  const bodyOf = (described: readonly ContinentalCircusThing[], lateral: number, across: number) => {
    const body = described.flatMap((t) => {
      if (!t.hit || !t.pieces.length) return [];
      const alone = laidOf('alone', [t]);
      const [c0, c1] = coloredOf(alone.width, alone.pens).map((c) => alone.left / pixel + c);
      const [a, b] = [Math.max(t.lateral + t.hit.from, c0!), Math.min(t.lateral + t.hit.to, c1!)];
      return b > a ? [{ across: ((a + b) / 2 - lateral / pixel) * across, width: (b - a) * across }] : [];
    });
    return body.length ? body : null;
  };
  /** The point of `first` as the program holds it, from its point at its full size, metres across and up. */
  const shiftOf = (first: ContinentalCircusThing, lateralMetres: number) => ({
    lateral: first.units.lateral * lateralMetres - first.lateral * pixel,
    up: (first.height * pixel - first.units.height * lateralMetres) * UP,
  });
  return { things, piecesOf, laidOf, of, pointOf, bodyOf, shiftOf };
}

/**
 * A reader, a pixel `pixel` metres across, of what is one picture of the descriptions `addresses` one station puts out
 * (their records' order): each description that draws a piece and is no band (its type a ceiling's or a side face's) one,
 * those of them a floating one touches, through every touch, one (`touchingThings`, each description a piece laid at
 * its full size, floating where its lowest colored row lies a pixel or more above the ground). Each its descriptions'
 * addresses in the station's order.
 */
export function stationThings(sub: Uint8Array, sprites: ContinentalCircusSprites, pixel: number) {
  const d = drawing(sub, sprites, pixel);
  return (addresses: readonly number[]) => {
    const drawnHere = addresses.filter((a) => d.things(a).type > THING_TYPE.sideFace && d.things(a).pieces.length);
    const pieces = drawnHere.map((address, k): JoinPiece => {
      const laid = d.laidOf('station', d.of([address]));
      const bottom = laid.top - laid.height * pixel * UP;
      return {
        unit: 'station',
        s: 0,
        pixels: { width: laid.width, height: laid.height, pixels: laid.pens },
        pixel,
        aspect: UP,
        left: laid.left,
        bottom,
        floats: floats(Math.round(bottom / (pixel * UP)), 1),
        joins: true,
        order: drawnHere.length - 1 - k,
      };
    });
    const joined = touchingThings(pieces).map((thing) => [...thing.pieces].sort((a, b) => a - b));
    const alone = drawnHere.flatMap((_, k) => (joined.some((thing) => thing.includes(k)) ? [] : [[k]]));
    return [...joined, ...alone].sort((a, b) => a[0]! - b[0]!).map((thing) => thing.map((k) => drawnHere[k]!));
  };
}

/**
 * The things' pictures as boards, a pixel `pixel` metres across and `UP` times that down, from the main and the sub
 * programs and `sprites`: one each distinct thing of `things` (each a station's descriptions, `stationThings`),
 * standing on the ground where a piece reaches it, else floating at its lowest colored row's height (`groundOffset`,
 * metres); its base point a description's point, or the middle of its outer edges where several are joined, at
 * `lateral` metres from the road's centre, its first description's lateral and height as the program holds them, a
 * lateral unit `lateralMetres` and a unit up `UP` of it, the picture about them as laid at its full size. Its body
 * (`body`, null where none): each description that hits its own car a part, the range of the car's centre it hits at
 * most its own picture's colored columns, metres on its image right of its point ([Chosen
 * lines](../../../docs/original-road-data.md#chosen-lines), K, 2026-11-06). With its colored columns from its point
 * (metres on its image, right positive), its width, how many colors it drew and the share of its pixels whose color
 * another took.
 */
export function continentalCircusBoards(
  main: Uint8Array,
  sub: Uint8Array,
  sprites: ContinentalCircusSprites,
  things: readonly (readonly number[])[],
  pixel: number,
  lateralMetres: number,
) {
  const d = drawing(sub, sprites, pixel);
  const colors = spriteColors(main);
  const texels = texelsAPixel(pixel, UP);
  const distinct = new Map(things.map((addresses) => [addresses.map(hex5).join('+'), addresses]));
  const named = new Map<string, number>();
  return [...distinct]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, addresses]) => {
      const stem = stemOf(addresses);
      const n = (named.get(stem) ?? 0) + 1;
      named.set(stem, n);
      const name = n === 1 ? stem : `${stem}-${n}`;
      const described = d.of(addresses);
      const laid = d.laidOf(name, described);
      const joined = joinedColors(
        laid,
        d.piecesOf(described).map(({ p }) => [{ name: paletteName(p.line), colors: colors(p.line) }]),
      );
      const source = joined.picture;
      const ground = Math.round(laid.top / (pixel * UP)) - 1;
      const stands = ground < source.height;
      const parts = pictureParts(
        source,
        undefined,
        stands ? { base: ground, reason: "the thing's point on the ground" } : undefined,
      );
      const grid = partsOnGrid(source, parts, texels.across, texels.down);
      if (grid.width * grid.height > MASTER_TEXELS) throw contractUnmet(`${name} is larger than imageMasterTexels`);
      const lateral = d.pointOf(described, laid);
      const point = (lateral - laid.left) / pixel;
      const anchor = { x: (point * grid.width) / source.width - 0.5, y: grid.anchorY };
      const master = namedBoardMaster(name, grid, grid.indices, anchor, joined.palettes);
      const [from, to] = coloredOf(source.width, source.pixels);
      // A source column's metres on the image's grid.
      const across = grid.width / source.width / SPRITE_SOURCE_TEXELS_PER_METER;
      const body = d.bodyOf(described, lateral, across);
      const shift = d.shiftOf(described[0]!, lateralMetres);
      return {
        addresses,
        name,
        lateral: lateral + shift.lateral,
        pieces: laid.places.length,
        palette: joined.palettes[0]!.name,
        colored: [(from - point) * across, (to - point) * across] as const,
        body,
        groundOffset: stands ? 0 : (ground - source.height + 1) * pixel * UP + shift.up,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct: joined.distinct,
        replaced: joined.replaced,
        image: courseImageFile(master),
      };
    });
}

/** A band fixed on the screen to lay: its image's name, its descriptions in the order a station puts them out, its sides. */
export interface BandOf {
  readonly name: string;
  readonly described: readonly ContinentalCircusThing[];
  /** Where its bands lie: beyond both its edges, the left the right's mirror, or beyond its one outer edge. */
  readonly sides: 'both' | 'left' | 'right';
}

/**
 * Bands fixed on the screen as boards ([Strips](../../../docs/original-road-data.md#strips), [Its
 * bands](../../../docs/continental-circus-road-data.md#its-bands)), a pixel `pixel` metres across and `UP` times that
 * down, from the main and the sub programs and `sprites`: each of `bands` its descriptions' pieces drawn once at their
 * full size, as a thing's are, and beyond its edges (`sides`) its band, the piece the original repeats, its outermost
 * 128 columns, a board extending outward, all cut from one grid (`bandBoards`); its base point and body as a thing's
 * (`continentalCircusBoards`), the body on the picture; standing on the ground where its lowest colored row meets it,
 * else at that row's height as the program holds it (`groundOffset`, metres; below the ground where it reaches there,
 * standing at its depth), the bands `rise` metres higher where their last row lies
 * above it; the band's names the picture's and `-band`, and `-band-mirrored` on both sides. With its face, its pieces'
 * colored pixels, its point `x` pixels from its left and the ground `base` rows above its bottom edge, for a passage.
 */
export function continentalCircusBands(
  main: Uint8Array,
  sub: Uint8Array,
  sprites: ContinentalCircusSprites,
  bands: readonly BandOf[],
  pixel: number,
  lateralMetres: number,
) {
  const d = drawing(sub, sprites, pixel);
  const colors = spriteColors(main);
  const texels = texelsAPixel(pixel, UP);
  return [...new Map(bands.map((b) => [b.name, b])).values()]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map(({ name, described, sides }) => {
      const laid = d.laidOf(name, described);
      // The laid grid and its outermost columns beyond its edges: on the right copied, on the left mirrored on both
      // sides and copied on the left alone.
      const [w, h] = [laid.width, laid.height];
      const [before, after] = [sides === 'right' ? 0 : BIG_SPRITE, sides === 'left' ? 0 : BIG_SPRITE];
      const width = before + w + after;
      const pens = new Uint8Array(width * h);
      const owner = new Int16Array(width * h).fill(-1);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < width; x++) {
          const u =
            x < before ? (sides === 'both' ? w - 1 - x : x) : x < before + w ? x - before : x - before - BIG_SPRITE;
          [pens[y * width + x], owner[y * width + x]] = [laid.pens[y * w + u]!, laid.owner[y * w + u]!];
        }
      const joined = joinedColors(
        { ...laid, width, pens, owner },
        d.piecesOf(described).map(({ p }) => [{ name: paletteName(p.line), colors: colors(p.line) }]),
      );
      const lateral = d.pointOf(described, laid);
      const point = (lateral - laid.left) / pixel;
      const {
        picture,
        bands: beyond,
        rise,
      } = bandBoards(
        { picture: name, band: `${name}-band`, ...(sides === 'both' ? { mirrored: `${name}-band-mirrored` } : {}) },
        joined.picture,
        pictureParts(joined.picture, undefined),
        [before, before + w],
        before + point,
        texels,
        joined.palettes,
        sides,
      );
      if (picture.width * picture.height > MASTER_TEXELS)
        throw contractUnmet(`${name} is larger than imageMasterTexels`);
      // Its lowest colored row, and the ground's row, rows from the laid grid's top.
      let bottom = h - 1;
      while (bottom > 0 && !laid.pens.subarray(bottom * w, (bottom + 1) * w).some((v) => v)) bottom--;
      const ground = Math.round(laid.top / (pixel * UP)) - 1;
      const shift = d.shiftOf(described[0]!, lateralMetres);
      return {
        name,
        names: [picture.name, ...beyond.map((b) => b.name)],
        palette: joined.palettes[0]!.name,
        lateral: lateral + shift.lateral,
        body: d.bodyOf(described, lateral, picture.width / w / SPRITE_SOURCE_TEXELS_PER_METER),
        groundOffset: bottom === ground ? 0 : (ground - bottom) * pixel * UP + shift.up,
        rise,
        face: {
          picture: { width: w, height: h, pixels: laid.pens.map((v) => (v ? 1 : 0)) },
          x: point,
          base: h - 1 - ground,
        },
        images: [picture, ...beyond].map((master) => courseImageFile(master)),
      };
    });
}
