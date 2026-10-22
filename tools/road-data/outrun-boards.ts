/**
 * OUTRUN's scenery as boards ([Original road data](../../docs/original-road-data.md#boards)): each sprite an object
 * shows, mirrored as it is shown, becomes a course image of its largest size's pixels in each palette it is shown in, on
 * the texel grid of the original's pixels at the road's scale, its base point the object's anchor, and its shadow the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { OBJECT_ROUTINES, objectAside, objectSize, shadowSizes, spritePalette, type Family } from './outrun-sprites.js';
import { anchorPoint, outline, spritePixels, type SpriteSize } from './sprite-pixels.js';
import { chosenLines, paletteName, texelsAPixel } from './pixel-grid.js';

/** One way an object shows a sprite: mirrored or not, by an anchor and routine, in a palette, shadowed or not. */
export interface SpriteUse {
  readonly sprite: number;
  readonly mirrored: boolean;
  readonly anchor: number;
  readonly routine: number;
  readonly palette: number;
  readonly shadow: boolean;
  /** A frame of an animation no sprite names: the address of its size (its `sprite` then unused). */
  readonly frame?: number;
}

/**
 * A board's image name: the sprite's number, a strip's or cloud's family's address, or a frame's, then whether mirrored
 * and shadowed.
 */
export function boardName(use: Pick<SpriteUse, 'sprite' | 'routine' | 'mirrored' | 'shadow' | 'frame'>) {
  const { family } = OBJECT_ROUTINES.get(use.routine)!;
  const shown =
    use.frame !== undefined
      ? `frame-${use.frame.toString(16)}`
      : family === undefined
        ? String(use.sprite).padStart(3, '0')
        : `strip-${family.address.toString(16)}`;
  return `outrun-${shown}${use.mirrored ? '-mirrored' : ''}${use.shadow ? '-shadowed' : ''}`;
}

/** The files of one board: its course image. */
export interface BoardFiles {
  readonly name: string;
  readonly image: { readonly path: string; readonly bytes: Uint8Array };
}

/** Whether an object of `use` stands by its edge: anchored by an edge, with no body (its routine never hits). */
export const standsByEdge = (use: Pick<SpriteUse, 'anchor' | 'routine'>) =>
  (use.anchor & 3) !== 0 && (use.anchor & 3) !== 3 && !OBJECT_ROUTINES.get(use.routine)!.hits;

/**
 * The boards `uses` need, those lying on the ground left out: each written as its course image (`boardMasters`).
 */
export function sceneryBoards(main: Uint8Array, words: Uint32Array, uses: readonly SpriteUse[]): BoardFiles[] {
  return boardMasters(main, words, uses)
    .filter((board) => !board.lies)
    .map(({ name, master }) => ({ name, image: courseImageFile(master) }));
}

/** The pictures of what `uses` show lying on the ground, by image name: the masters the course's Strips are baked from. */
export function lyingPictures(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly SpriteUse[],
): Map<string, SpriteLodDocument> {
  return new Map(
    boardMasters(main, words, uses)
      .filter((board) => board.lies)
      .map(({ name, master }) => [name, master]),
  );
}

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels (a family's nearest size) on its texel grid by
 * chosen lines (`chosenLines`), a mirrored one the unmirrored output mirrored, in the palettes' own colors. Its base
 * point is its anchor's bottom or middle (a family rising from the ground, extending sideways, its bottom), and across,
 * an object standing by its edge (`standsByEdge`) at that edge, any other at the middle of its hit extents, where a
 * solid object's body stands. What lies on the ground is marked: it is baked, never a board.
 */
function boardMasters(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly SpriteUse[],
): { name: string; master: SpriteLodDocument; lies: boolean }[] {
  const groups = new Map<string, SpriteUse[]>();
  for (const use of uses) {
    const name = boardName(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  // The shadows, by their size list's address: the scenery's (0xFF56), or a routine's own.
  const shadows = new Map<number | undefined, { width: number; pixels: Uint8Array }>();
  const shadowOf = (address: number | undefined) => {
    if (!shadows.has(address)) {
      const size = shadowSizes(main, address)[0]!;
      shadows.set(address, { width: size.width, pixels: outline(spritePixels(words, size), size.width) });
    }
    return shadows.get(address)!;
  };
  const boards: { name: string; master: SpriteLodDocument; lies: boolean }[] = [];
  for (const [name, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [first] = group;
    const routine = OBJECT_ROUTINES.get(first!.routine)!;
    // One base point and scale for every use: the same anchor down, and by its edge alike (then the same edge).
    const base = (u: SpriteUse) => (standsByEdge(u) ? u.anchor : u.anchor & 12);
    if (
      group.some((u) => base(u) !== base(first!) || OBJECT_ROUTINES.get(u.routine)!.pixelUnits !== routine.pixelUnits)
    )
      throw new RangeError(`Board ${name} is shown by different anchors or scales`);
    const largest = objectSize(main, first!);
    // A family rising from the ground extends away from the road (right, or left mirrored).
    const lies = routine.lies === true;
    const extending = routine.family !== undefined && !lies;
    const size = { ...largest, pixels: spritePixels(words, largest) };
    // The unmirrored picture by chosen lines; a mirrored board is its output mirrored.
    const texels = texelsAPixel(routine.pixelUnits);
    const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
    const indices = first!.mirrored ? mirror(grid.indices, grid.width) : grid.indices;
    const scale = { x: grid.width / size.width, y: grid.height / size.height };
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const byEdge = standsByEdge(first!);
    const point = anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, grid.height);
    // A board extending sideways stands on its bottom edge.
    if (extending) point.y = grid.height - 0.5;
    const aside = byEdge ? 0 : (objectAside(main, first!) / routine.pixelUnits) * scale.x;
    const cast = shadowOf(routine.shadow?.sizes);
    const castScale = routine.shadow?.scale ?? 1;
    const master = (palette: (k: number) => number[], indices: number[]): SpriteLodDocument => ({
      format: 'superoutride.sprite-lod',
      version: 4,
      name,
      width: grid.width,
      height: grid.height,
      anchorX: point.x + aside,
      anchorY: point.y,
      defaultPalette: paletteName(palettes[0]!),
      palettes: Object.fromEntries(palettes.map((p, k) => [paletteName(p), { colors: palette(k) }])),
      levels: [{ paletteRgb555: palette(0), indices, mixtures: spriteIdentityMixtures() }],
      ...(extending ? { extend: first!.mirrored ? ('left' as const) : ('right' as const) } : {}),
      // The shadow: the original's, drawn at its scale against the object's and at the object's anchor.
      ...(first!.shadow
        ? {
            shadow: shadowFrame(
              cast.pixels,
              cast.width,
              { x: scale.x * castScale, y: scale.y * castScale },
              first!.anchor & 12,
              -aside / scale.x / castScale,
            ),
          }
        : {}),
    });
    const board = master((k) => [0, ...spritePalette(main, palettes[k]!).slice(1)], indices);
    boards.push({ name, master: board, lies });
  }
  return boards;
}

/**
 * A strip's, cloud's or trees' picture restored from its family's `sizes`, its reach times its nearest size's width over
 * `boards` boards (one board's share) and as tall, its edge nearest the road on the left. Each column `d` nearest pixels
 * from that edge: where the far sizes are the nearest shrunk across with what lies beyond, size k (shrunk by s) covering
 * d where d·s is within the nearest's width, from the largest size that covers it, its column d·s and its rows its
 * height's share of the nearest's (a size without rows leaves it transparent); where they are not shrunk, the nearest
 * size's, repeating outward.
 */
export function restoredStrip(
  words: Uint32Array,
  sizes: readonly SpriteSize[],
  family: Pick<Family, 'nearest' | 'reach' | 'shrink'>,
  boards: number,
) {
  const sized = sizes.map((size) => spritePixels(words, size));
  const { width, height } = sizes[family.nearest]!;
  const reach = (family.reach / boards) * width;
  const { shrink } = family;
  const pixels = new Uint8Array(reach * height);
  for (let d = 0; d < reach; d++) {
    // The largest size that covers d: the one shrunk least that still holds it.
    let k = family.nearest;
    if (shrink) {
      k = -1;
      for (let j = 0; j < sizes.length; j++) if (d * shrink(j) < width && (k < 0 || shrink(j) > shrink(k))) k = j;
    }
    const size = sizes[k]!;
    const column = shrink ? Math.floor(d * shrink(k)) : d % width;
    for (let y = 0; y < height; y++) {
      const row = Math.floor((y * size.height) / height);
      if (row < size.height) pixels[y * reach + d] = sized[k]![row * size.width + column]!;
    }
  }
  return { pixels, width: reach, height };
}

/** `pixels`, `width` wide, mirrored left to right. */
export const mirror = <T>(pixels: readonly T[], width: number) =>
  pixels.map((_, i) => pixels[i - (i % width) + width - 1 - (i % width)]!);

/**
 * The shadow's binary frame (`width` pixels wide) on the texel grid of `scale` texels a pixel, anchored as `anchor`, its
 * base point `aside` source pixels across from there (the frame then stands that far the other way).
 */
export function shadowFrame(
  pixels: Uint8Array,
  width: number,
  scale: { readonly x: number; readonly y: number },
  anchor: number,
  aside: number,
) {
  const grid = chosenLines(pixels, width, scale.x, scale.y);
  const point = anchorPoint(anchor, grid.width, grid.height);
  return {
    width: grid.width,
    height: grid.height,
    anchorX: point.x - aside * scale.x,
    anchorY: point.y,
    levels: [{ indices: grid.indices }],
  };
}
