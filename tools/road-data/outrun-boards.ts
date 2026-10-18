/**
 * OUTRUN's scenery as outline boards ([Original road data](../../docs/original-road-data.md#outline-boards)): each
 * sprite an object shows, mirrored as it is shown, becomes a course image whose only content is its largest size's
 * outline in one color a palette, at the road's scale, its base point the object's anchor, and its shadow the original's.
 */
import type { PNG as PngCodec } from 'pngjs';
import {
  courseImageFile,
  importSprite,
  SPRITE_RECIPE_FORMAT,
  SPRITE_RECIPE_VERSION,
  type SpriteRecipe,
} from '../graphics/sprite-import.js';
import { decodeSpritePng } from '../graphics/sprite-png.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import {
  anchorPoint,
  hitMiddle,
  OBJECT_ROUTINES,
  outline,
  representative,
  shadowSizes,
  spritePalette,
  spritePixels,
  spriteSizes,
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

/** A board's image name: the sprite's number, then whether mirrored and shadowed. */
export const boardName = (use: Pick<SpriteUse, 'sprite' | 'mirrored' | 'shadow'>) =>
  `outrun-${String(use.sprite).padStart(3, '0')}${use.mirrored ? '-mirrored' : ''}${use.shadow ? '-shadowed' : ''}`;
/** A palette's name in a board. */
export const paletteName = (palette: number) => `p${String(palette).padStart(3, '0')}`;

/**
 * The files of one board: its source picture and recipe, its course image, and the original's picture in its place (the
 * same name, size, base point, palette names and shadow; the sprite's own pixels and palettes), which stays local.
 */
export interface BoardFiles {
  readonly name: string;
  readonly source: Uint8Array;
  readonly recipe: string;
  readonly image: { readonly path: string; readonly bytes: Uint8Array };
  readonly original: { readonly path: string; readonly bytes: Uint8Array };
}

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). A pixel spans the road units its routine gives, `metresPerUnit` each.
 */
export async function outlineBoards(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly SpriteUse[],
  metresPerUnit: number,
  PNG: typeof PngCodec,
): Promise<BoardFiles[]> {
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
    if (
      group.some(
        (u) =>
          (u.anchor & 12) !== (first!.anchor & 12) || OBJECT_ROUTINES.get(u.routine)!.pixelUnits !== routine.pixelUnits,
      )
    )
      throw new RangeError(`Board ${name} is shown by different anchors or scales`);
    const size = spriteSizes(main, first!.sprite)[0]!;
    const raw = spritePixels(words, size);
    const pixels = first!.mirrored ? mirror(raw, size.width) : raw;
    const shape = outline(pixels, size.width);
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const colors = palettes.map((p) => representative(pixels, spritePalette(main, p)));
    // The source: the outline in the default palette's color, transparent elsewhere.
    const png = new PNG({ width: size.width, height: size.height });
    const [r, g, b] = [(colors[0]! >> 10) & 31, (colors[0]! >> 5) & 31, colors[0]! & 31].map((c) =>
      Math.round((c * 255) / 31),
    );
    shape.forEach((v, i) => png.data.set(v ? [r!, g!, b!, 255] : [0, 0, 0, 0], 4 * i));
    const source = new Uint8Array(PNG.sync.write(png));
    // Its base point at its bottom or middle, across at its hit extents' middle, where a solid object's body stands: an
    // object anchored by an edge stands half its width aside, and one hit off its middle that far.
    const middle = anchorPoint(first!.anchor & 12, size.width, size.height);
    const aside = hitMiddle(main, first!.sprite, first!.mirrored) / routine.pixelUnits;
    const anchor = { x: middle.x + aside, y: middle.y };
    const recipe: SpriteRecipe = {
      format: SPRITE_RECIPE_FORMAT,
      version: SPRITE_RECIPE_VERSION,
      crop: { x: 0, y: 0, width: size.width, height: size.height },
      widthMeters: size.width * routine.pixelUnits * metresPerUnit,
      anchor,
      mask: [],
      palettes: Object.fromEntries(palettes.map((p, k) => [paletteName(p), [0, ...Array(15).fill(colors[k])]])),
    };
    const master = importSprite(await decodeSpritePng(source, PNG), recipe, name);
    // The shadow: the original's, drawn at the object's scale and anchor.
    const withShadow = first!.shadow
      ? {
          ...master,
          shadow: scaledFrame(
            shadowPixels,
            shadow.width,
            shadow.height,
            master.width / size.width,
            first!.anchor & 12,
            -aside,
          ),
        }
      : master;
    // The original's picture: each texel the sprite's pixel nearest its centre, in each palette's own colors.
    const romPalettes = palettes.map((p) => [paletteName(p), [0, ...spritePalette(main, p).slice(1)]] as const);
    const indices = Array.from({ length: master.width * master.height }, (_, t) => {
      const x = Math.min(size.width - 1, Math.floor((((t % master.width) + 0.5) * size.width) / master.width));
      const y = Math.floor(((Math.floor(t / master.width) + 0.5) * size.width) / master.width);
      return y < size.height ? pixels[y * size.width + x]! : 0;
    });
    const original = {
      ...withShadow,
      palettes: Object.fromEntries(romPalettes.map(([palette, colors]) => [palette, { colors }])),
      levels: [{ paletteRgb555: romPalettes[0]![1], indices, mixtures: spriteIdentityMixtures() }],
    };
    boards.push({
      name,
      source,
      recipe: formatSavedJson(recipe),
      image: courseImageFile(withShadow),
      original: courseImageFile(original),
    });
  }
  return boards;
}

const mirror = (pixels: Uint8Array, width: number) =>
  pixels.map((_, i) => pixels[i - (i % width) + width - 1 - (i % width)]!);

/**
 * A binary frame scaled by `scale`, a texel opaque where its centre lies on an opaque pixel, anchored as `anchor`, its
 * base point `aside` source pixels across from there (the frame then stands that far the other way).
 */
function scaledFrame(pixels: Uint8Array, width: number, height: number, scale: number, anchor: number, aside: number) {
  const w = Math.max(1, Math.round(width * scale)),
    h = Math.max(1, Math.round(height * scale));
  const indices = Array.from({ length: w * h }, (_, i) => {
    const x = Math.min(width - 1, Math.floor(((i % w) + 0.5) / scale)),
      y = Math.min(height - 1, Math.floor((Math.floor(i / w) + 0.5) / scale));
    return pixels[y * width + x] ? 1 : 0;
  });
  const point = anchorPoint(anchor, w, h);
  return { width: w, height: h, anchorX: point.x - aside * scale, anchorY: point.y, levels: [{ indices }] };
}
