/**
 * OUTRUN's scenery as boards ([Original road data](../../docs/original-road-data.md#boards)): each sprite an object
 * shows, mirrored as it is shown, becomes a course image of its largest size's pixels in each palette it is shown in, on
 * the texel grid of the original's pixels at the road's scale, its base point the object's anchor, and its shadow the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import {
  familySizes,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  shadowSizes,
  spritePalette,
  type Family,
  type ObjectRoutine,
} from './outrun-sprites.js';
import { anchorPoint, outline, spritePixels } from './sprite-pixels.js';
import { areaMajority, boardGrid, paletteName } from './pixel-grid.js';

/** One way an object shows a sprite: mirrored or not, by an anchor and routine, in a palette, shadowed or not. */
export interface SpriteUse {
  readonly sprite: number;
  readonly mirrored: boolean;
  readonly anchor: number;
  readonly routine: number;
  readonly palette: number;
  readonly shadow: boolean;
}

/** A board's image name: the sprite's number, or a strip's or cloud's family's address, then whether mirrored and shadowed. */
export function boardName(use: Pick<SpriteUse, 'sprite' | 'routine' | 'mirrored' | 'shadow'>) {
  const { family } = OBJECT_ROUTINES.get(use.routine)!;
  const shown = family === undefined ? String(use.sprite).padStart(3, '0') : `strip-${family.address.toString(16)}`;
  return `outrun-${shown}${use.mirrored ? '-mirrored' : ''}${use.shadow ? '-shadowed' : ''}`;
}

/** The files of one board: its course image, and the same picture as the local original in its place. */
export interface BoardFiles {
  readonly name: string;
  readonly image: { readonly path: string; readonly bytes: Uint8Array };
  readonly original: { readonly path: string; readonly bytes: Uint8Array };
}

/** Whether an object of `use` stands by its edge: anchored by an edge, with no body (its routine never hits). */
export const standsByEdge = (use: Pick<SpriteUse, 'anchor' | 'routine'>) =>
  (use.anchor & 3) !== 0 && (use.anchor & 3) !== 3 && !OBJECT_ROUTINES.get(use.routine)!.hits;

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels (a strip's restored, `restoredStrip`) straight onto its texel grid (`boardGrid`,
 * `areaMajority`), in the palettes' own colors. Its base point is its anchor's bottom or middle, and across, an object standing by its edge
 * (`standsByEdge`) at that edge, any other at the middle of its hit extents, where a solid object's body stands.
 */
export function sceneryBoards(main: Uint8Array, words: Uint32Array, uses: readonly SpriteUse[]): BoardFiles[] {
  const groups = new Map<string, SpriteUse[]>();
  for (const use of uses) {
    const name = boardName(use);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  const shadow = shadowSizes(main)[0]!;
  const shadowPixels = outline(spritePixels(words, shadow), shadow.width);
  const boards: BoardFiles[] = [];
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
    const size =
      routine.family === undefined
        ? { ...largest, pixels: spritePixels(words, largest) }
        : restoredStrip(main, words, routine.family, boardsAcross(main, routine).count);
    const pixels = first!.mirrored ? mirror(size.pixels, size.width) : size.pixels;
    const grid = boardGrid(size.width, size.height, routine.pixelUnits);
    const scale = { x: grid.width / size.width, y: grid.height / size.height };
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const byEdge = standsByEdge(first!);
    const point = anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, grid.height);
    const aside = byEdge ? 0 : (objectAside(main, first!) / routine.pixelUnits) * scale.x;
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
      // The shadow: the original's, drawn at the object's scale and anchor.
      ...(first!.shadow
        ? {
            shadow: shadowFrame(shadowPixels, shadow.width, scale, first!.anchor & 12, -aside / scale.x),
          }
        : {}),
    });
    const board = master(
      (k) => [0, ...spritePalette(main, palettes[k]!).slice(1)],
      areaMajority(pixels, size.width, grid.width, grid.height),
    );
    boards.push({ name, image: courseImageFile(board), original: courseImageFile(board) });
  }
  return boards;
}

/**
 * The boards a family's reach is split into, side by side outward, and each one's width (road units): the fewest,
 * halving, whose board fits a course image's texels. A strip's or the trees' is one; the clouds', twice as large, four.
 */
export function boardsAcross(main: Uint8Array, routine: ObjectRoutine): { count: number; units: number } {
  const { family } = routine;
  if (!family) return { count: 1, units: 0 };
  const { width, height } = familySizes(main, family)[family.nearest]!;
  for (let count = 1; count <= family.reach; count *= 2) {
    const grid = boardGrid((family.reach / count) * width, height, routine.pixelUnits);
    if (grid.width * grid.height <= COURSE_DOCUMENT_LIMITS.imageMasterTexels) {
      if (count > 1 && family.shrink) throw new Error(`Family ${family.address} needs several boards`);
      return { count, units: (family.reach / count) * width * routine.pixelUnits };
    }
  }
  throw new Error(`Family ${family.address} does not fit a course image`);
}

/**
 * A strip's, cloud's or trees' picture restored from its family's sizes, its reach times its nearest size's width over
 * `boards` boards (one board's share) and as tall, its edge nearest the road on the left. Each column `d` nearest pixels
 * from that edge: where the far sizes are the nearest shrunk across with what lies beyond, size k (shrunk by s) covering
 * d where d·s is within the nearest's width, from the largest size that covers it, its column d·s and its rows its
 * height's share of the nearest's (a size without rows leaves it transparent); where they are not shrunk, the nearest
 * size's, repeating outward.
 */
function restoredStrip(main: Uint8Array, words: Uint32Array, family: Family, boards: number) {
  const sizes = familySizes(main, family);
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

const mirror = (pixels: Uint8Array, width: number) =>
  pixels.map((_, i) => pixels[i - (i % width) + width - 1 - (i % width)]!);

/**
 * The shadow's binary frame (`width` pixels wide) on the texel grid of `scale` texels a pixel, anchored as `anchor`, its
 * base point `aside` source pixels across from there (the frame then stands that far the other way).
 */
function shadowFrame(
  pixels: Uint8Array,
  width: number,
  scale: { readonly x: number; readonly y: number },
  anchor: number,
  aside: number,
) {
  const height = pixels.length / width;
  const w = Math.max(1, Math.round(width * scale.x)),
    h = Math.max(1, Math.round(height * scale.y));
  const indices = areaMajority(pixels, width, w, h);
  const point = anchorPoint(anchor, w, h);
  return { width: w, height: h, anchorX: point.x - aside * scale.x, anchorY: point.y, levels: [{ indices }] };
}
