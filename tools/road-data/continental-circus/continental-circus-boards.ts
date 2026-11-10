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
import { croppedPieces, joinedColors, layPieces, touchingThings, type JoinPiece } from '../shared/joined-pictures.js';
import { namedBoardMaster, paletteName, texelsAPixel } from '../shared/pixel-grid.js';
import { floats, partsOnGrid, pictureParts } from '../shared/sprite-rules.js';
import { BIG_SPRITE } from '../taito/z-sprites.js';
import { UP } from './continental-circus-road-picture.js';
import { continentalCircusSprite, spriteColors, type ContinentalCircusSprites } from './continental-circus-sprites.js';
import { continentalCircusThings, THING_TYPE, type ContinentalCircusPiece } from './continental-circus-things.js';

/** The largest picture the course format admits (`imageMasterTexels`). */
const MASTER_TEXELS = 1024 * 1024;

const hex5 = (address: number) => address.toString(16).padStart(5, '0');

/**
 * A thing's image name: a description's `contcirc-<its address, five hex digits>`; descriptions joined
 * `contcirc-joined-<the address of the one drawn first>`, the last a station puts out, and `-<n>` from the second
 * thing so named, in their order (`continentalCircusBoards`).
 */
const stemOf = (addresses: readonly number[]) =>
  addresses.length === 1 ? `contcirc-${hex5(addresses[0]!)}` : `contcirc-joined-${hex5(addresses.at(-1)!)}`;

/**
 * What every picture is drawn from, a pixel `pixel` metres across and `UP` times that down: the descriptions, a piece's
 * pens as drawn, and the pieces of descriptions `addresses` (in the order a station puts them out) laid at their full
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
  const piecesOf = (addresses: readonly number[]) =>
    addresses.flatMap((address) => things(address).pieces.map((p) => ({ lateral: things(address).lateral, p })));
  const laidOf = (unit: string, addresses: readonly number[]) => {
    const pieces = piecesOf(addresses);
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
  return { things, piecesOf, laidOf };
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
      const laid = d.laidOf('station', [address]);
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
 * `lateral` metres from the road's centre. With its colored columns from its point (metres on its image, right
 * positive), its width, how many colors it drew and the share of its pixels whose color another took.
 */
export function continentalCircusBoards(
  main: Uint8Array,
  sub: Uint8Array,
  sprites: ContinentalCircusSprites,
  things: readonly (readonly number[])[],
  pixel: number,
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
      const laid = d.laidOf(name, addresses);
      const joined = joinedColors(
        laid,
        d.piecesOf(addresses).map(({ p }) => [{ name: paletteName(p.line), colors: colors(p.line) }]),
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
      const lateral =
        addresses.length === 1 ? d.things(addresses[0]!).lateral * pixel : laid.left + (source.width * pixel) / 2;
      const point = (lateral - laid.left) / pixel;
      const anchor = { x: (point * grid.width) / source.width - 0.5, y: grid.anchorY };
      const master = namedBoardMaster(name, grid, grid.indices, anchor, joined.palettes);
      let [from, to] = [Infinity, -Infinity];
      source.pixels.forEach((v, at) => {
        if (v) [from, to] = [Math.min(from, at % source.width), Math.max(to, (at % source.width) + 1)];
      });
      // A source column's metres on the image's grid.
      const across = grid.width / source.width / SPRITE_SOURCE_TEXELS_PER_METER;
      return {
        addresses,
        name,
        lateral,
        pieces: laid.places.length,
        palette: joined.palettes[0]!.name,
        colored: [(from - point) * across, (to - point) * across] as const,
        groundOffset: stands ? 0 : (ground - source.height + 1) * pixel * UP,
        width: grid.width / SPRITE_SOURCE_TEXELS_PER_METER,
        distinct: joined.distinct,
        replaced: joined.replaced,
        image: courseImageFile(master),
      };
    });
}
