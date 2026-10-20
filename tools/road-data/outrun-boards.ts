/**
 * OUTRUN's scenery as outline boards ([Original road data](../../docs/original-road-data.md#outline-boards)): each
 * sprite an object shows, mirrored as it is shown, becomes a course image whose only content is its largest size's
 * outline in one color a palette, on the texel grid of the original's pixels at the road's scale, its base point the
 * object's anchor, and its shadow the original's.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import {
  anchorPoint,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  outline,
  representative,
  shadowSizes,
  spritePalette,
  spritePixels,
} from './outrun-sprites.js';

/** One way an object shows a sprite: mirrored or not, by an anchor and routine, in a palette, shadowed or not. */
export interface SpriteUse {
  readonly sprite: number;
  readonly mirrored: boolean;
  readonly anchor: number;
  readonly routine: number;
  readonly palette: number;
  readonly shadow: boolean;
}

/** A board's image name: the sprite's number, or a strip's family's address, then whether mirrored and shadowed. */
export function boardName(use: Pick<SpriteUse, 'sprite' | 'routine' | 'mirrored' | 'shadow'>) {
  const { family } = OBJECT_ROUTINES.get(use.routine)!;
  const shown = family === undefined ? String(use.sprite).padStart(3, '0') : `strip-${family.toString(16)}`;
  return `outrun-${shown}${use.mirrored ? '-mirrored' : ''}${use.shadow ? '-shadowed' : ''}`;
}
/** A palette's name in a board. */
export const paletteName = (palette: number) => `p${String(palette).padStart(3, '0')}`;

/** Metres a road-width unit: K's 3.6 m lane over the original's lane spacing, 424/3 units (the road ROM's lines). */
export const UNIT_METRES = (3.6 * 3) / 424;
/** The original's pixels are 14 wide to 15 tall: 320 × 224 shown at 4:3. Its vertical amounts grow by this. */
export const PIXEL_ASPECT = 15 / 14;

/** The files of one board: its course image, and the original's picture in its place, which stays local. */
export interface BoardFiles {
  readonly name: string;
  readonly image: { readonly path: string; readonly bytes: Uint8Array };
  readonly original: { readonly path: string; readonly bytes: Uint8Array };
}

/**
 * The texel grid a size of `width` × `height` pixels, each `units` road units, takes at 40 texels/m: across
 * `units × UNIT_METRES` metres a pixel, down `PIXEL_ASPECT` times that.
 */
export function boardGrid(width: number, height: number, units: number) {
  const across = units * UNIT_METRES * SPRITE_SOURCE_TEXELS_PER_METER;
  return {
    width: Math.max(1, Math.round(width * across)),
    height: Math.max(1, Math.round(height * across * PIXEL_ASPECT)),
  };
}

/**
 * `pixels` (`width` wide, row-major palette indices, 0 transparent) on a grid of `w` × `h` texels: each texel takes the
 * index whose pixels cover most of its area, transparency counted as an index; of two as large, the index of the pixel
 * nearest its centre.
 */
export function areaMajority(pixels: Uint8Array, width: number, w: number, h: number): number[] {
  const height = pixels.length / width;
  const sx = width / w,
    sy = height / h;
  const out = new Array<number>(w * h);
  const area = new Map<number, number>();
  for (let ty = 0; ty < h; ty++)
    for (let tx = 0; tx < w; tx++) {
      const [x0, x1, y0, y1] = [tx * sx, (tx + 1) * sx, ty * sy, (ty + 1) * sy];
      area.clear();
      for (let y = Math.floor(y0); y < Math.min(height, Math.ceil(y1)); y++)
        for (let x = Math.floor(x0); x < Math.min(width, Math.ceil(x1)); x++) {
          const a = (Math.min(x1, x + 1) - Math.max(x0, x)) * (Math.min(y1, y + 1) - Math.max(y0, y));
          const v = pixels[y * width + x]!;
          area.set(v, (area.get(v) ?? 0) + a);
        }
      const most = Math.max(...area.values());
      const tied = [...area].filter(([, a]) => most - a < 1e-9).map(([v]) => v);
      if (tied.length === 1) out[ty * w + tx] = tied[0]!;
      else {
        // The tied index of the pixel nearest the texel's centre.
        const cx = (x0 + x1) / 2,
          cy = (y0 + y1) / 2;
        const x = Math.min(width - 1, Math.floor(cx)),
          y = Math.min(height - 1, Math.floor(cy));
        const centre = pixels[y * width + x]!;
        out[ty * w + tx] = tied.includes(centre) ? centre : Math.min(...tied);
      }
    }
  return out;
}

/** Whether an object of `use` stands by its edge: anchored by an edge, with no body (its routine never hits). */
export const standsByEdge = (use: Pick<SpriteUse, 'anchor' | 'routine'>) =>
  (use.anchor & 3) !== 0 && (use.anchor & 3) !== 3 && !OBJECT_ROUTINES.get(use.routine)!.hits;

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels straight onto its texel grid (`boardGrid`,
 * `areaMajority`): the published board its outline in one color a palette, the local original its pixels in the
 * palettes' own colors. Its base point is its anchor's bottom or middle, and across, an object standing by its edge
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
    const size = objectSize(main, first!);
    const raw = spritePixels(words, size);
    const pixels = first!.mirrored ? mirror(raw, size.width) : raw;
    const grid = boardGrid(size.width, size.height, routine.pixelUnits);
    const scale = { x: grid.width / size.width, y: grid.height / size.height };
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const colors = palettes.map((p) => representative(pixels, spritePalette(main, p)));
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
      (k) => [0, ...Array<number>(15).fill(colors[k]!)],
      areaMajority(outline(pixels, size.width), size.width, grid.width, grid.height),
    );
    const original = master(
      (k) => [0, ...spritePalette(main, palettes[k]!).slice(1)],
      areaMajority(pixels, size.width, grid.width, grid.height),
    );
    boards.push({ name, image: courseImageFile(board), original: courseImageFile(original) });
  }
  return boards;
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
