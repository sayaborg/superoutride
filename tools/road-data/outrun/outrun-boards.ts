/**
 * OUTRUN's scenery as boards ([OUTRUN road data](../../../docs/outrun-road-data.md#boards)): each sprite an object
 * shows, mirrored as it is shown, becomes a course image of its largest size's pixels in each palette it is shown in, on
 * the texel grid of the original's pixels at the road's scale, by the sprites' rules, and its shadow the original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { contractUnmet } from '../shared/conversion-errors.js';
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../../src/image/sprite.js';
import { stripBoard, stripExtent } from '../out-run-hardware/strips.js';
import {
  familySizes,
  OBJECT_ROUTINES,
  objectAside,
  objectSize,
  routineHits,
  shadowSizes,
  spritePalette,
} from './outrun-sprites.js';
import { anchorPoint, outline, OUTRUN_SPRITES, shadowFrame, spritePixels } from '../sega-16/sprite-pixels.js';
import { boardMaster, chosenLines, coloredColumns, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { floats, partsOnGrid, pictureParts, shadingNames, spriteTable, unionFrames } from '../shared/sprite-rules.js';
import { PIXEL_ASPECT, SHADOW_PEN } from '../sega-16/display.js';
import { UNIT_METRES } from '../out-run-hardware/constants.js';

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
export const standsByEdge = (main: Uint8Array, use: Pick<SpriteUse, 'anchor' | 'routine'>) =>
  (use.anchor & 3) !== 0 && (use.anchor & 3) !== 3 && !routineHits(main, use.routine);

/** A sprite's use as a board needs it: whether it is drawn with shadows allowed (its pixel 10 shading). */
export interface BoardUse extends SpriteUse {
  readonly shadows: boolean;
}

/**
 * `use` as drawn `lift` road units up: with shadows allowed only where it also stands, lifted less than a pixel of its
 * routine (`floats`).
 */
export const liftedUse = <U extends BoardUse>(use: U, lift: number): U => ({
  ...use,
  shadows: use.shadows && !floats(lift, OBJECT_ROUTINES.get(use.routine)!.pixelUnits),
});

/**
 * The image name of a use of board `shown` drawn with shadows allowed or not, of all the boards' `uses`
 * (`shadingNames`): a board drawn both ways is two images, the latter's `-unshaded`.
 */
export const boardNames = (uses: readonly BoardUse[]) => shadingNames(uses, boardName, (use) => use.shadows);

/** The boards `uses` need, each written as its course image (`boardMasters`). */
export function sceneryBoards(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly BoardUse[],
  reach: number,
): BoardFiles[] {
  return boardMasters(main, words, uses, reach).map(({ name, master }) => ({ name, image: courseImageFile(master!) }));
}

/**
 * What the courses need of the boards `uses` show: each board's colored columns' width (`coloredColumns`), metres, a
 * body's most, and where it reaches across on the ground (`extent`), for the scenery's reach.
 */
export function boardShapes(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]) {
  const boards = boardMasters(main, words, uses, undefined);
  return {
    colored: new Map(boards.map((b) => [b.name, b.colored])),
    extents: new Map(boards.map((b) => [b.name, b.extent])),
  };
}

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels (a family's nearest size) on its texel grid by
 * chosen lines (`chosenLines`), a mirrored one the unmirrored output mirrored, in the palettes' own colors. Across, an
 * object standing by its edge (`standsByEdge`) stands at that edge, any other at the middle of its hit extents, where a
 * solid object's body stands. It stands on its base by the sprites' rules (`pictureParts`), drawn with shadows allowed
 * as its drawing allows them; what its original draws on the road (drawing 13) lies about its anchor (its middle). A
 * family is a strip (`stripBoard`): a looping one its nearest size's colored columns repeated, any other one wide
 * picture of its sizes to the scenery's `reach` (without it, its board is not made).
 */
function boardMasters(
  main: Uint8Array,
  words: Uint32Array,
  uses: readonly BoardUse[],
  reach: number | undefined,
): Board[] {
  const nameOf = boardNames(uses);
  const groups = new Map<string, BoardUse[]>();
  for (const use of uses) {
    const name = nameOf(boardName(use), use.shadows);
    groups.set(name, [...(groups.get(name) ?? []), use]);
  }
  // The shadows, by their size list's address: the scenery's (0xFF56), or a routine's own.
  const shadows = new Map<number | undefined, { width: number; pixels: Uint8Array }>();
  const shadowOf = (address: number | undefined) => {
    if (!shadows.has(address)) {
      const size = shadowSizes(main, address)[0]!;
      shadows.set(address, {
        width: size.width,
        pixels: outline(spritePixels(words, size, OUTRUN_SPRITES), size.width),
      });
    }
    return shadows.get(address)!;
  };
  const boards: Board[] = [];
  const table = spriteTable();
  for (const [name, group] of [...groups].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [first] = group;
    const routine = OBJECT_ROUTINES.get(first!.routine)!;
    // One base point and scale for every use: the same anchor down, and by its edge alike (then the same edge).
    const base = (u: SpriteUse) => (standsByEdge(main, u) ? u.anchor : u.anchor & 12);
    if (
      group.some((u) => base(u) !== base(first!) || OBJECT_ROUTINES.get(u.routine)!.pixelUnits !== routine.pixelUnits)
    )
      throw contractUnmet(`Board ${name} is shown by different anchors or scales`);
    const largest = objectSize(main, first!);
    const lies = routine.lies !== undefined;
    const size = { ...largest, pixels: spritePixels(words, largest, OUTRUN_SPRITES) };
    const colored = coloredColumns(size.pixels, size.width, SHADOW_PEN) * routine.pixelUnits * UNIT_METRES;
    const texels = texelsAPixel(routine.pixelUnits * UNIT_METRES, PIXEL_ASPECT);
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const colors = (p: number) => [0, ...spritePalette(main, p).slice(1)];
    const byEdge = standsByEdge(main, first!);
    const cast = shadowOf(routine.shadow?.sizes);
    const castScale = routine.shadow?.scale ?? 1;
    const id = name.replace(/(-mirrored)?(-shadowed)?(-unshaded)?$/, '');
    const family = routine.family;
    if (family) {
      // A strip, from its family's sizes, its nearest the largest; one that does not loop only with the scenery's reach.
      const pixel = routine.pixelUnits * UNIT_METRES;
      const extent = stripExtent(size, pixel, first!);
      if (!family.loops && reach === undefined) {
        boards.push({ name, colored, extent });
        continue;
      }
      const sizes = family.loops
        ? [{ picture: size, fraction: 1 }]
        : familySizes(main, family).map((s, k) => ({
            picture: { width: s.width, height: s.height, pixels: spritePixels(words, s, OUTRUN_SPRITES) },
            fraction: family.fractions![k]!,
          }));
      const shown = {
        loops: family.loops === true,
        reach: reach ?? 0,
        pixel,
        texels,
        use: first!,
        shadows: first!.shadows,
        entry: table.get(id),
      };
      boards.push({ name, master: stripBoard(name, sizes, shown, palettes, colors), colored, extent });
      continue;
    }
    if (lies) {
      // What its original draws lying on the road lies, about its original's anchor (its middle), in its colors.
      const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
      const point = anchorPoint(first!.anchor & 12, grid.width, grid.height, OUTRUN_SPRITES);
      const indices = turned(grid.indices, grid.width, first!.mirrored);
      const master = boardMaster(name, grid, indices, point, palettes, colors, { lies: true });
      boards.push({ name, master, colored, extent: widthExtent(master) });
      continue;
    }
    // The sprites' rules: shadows allowed as its drawing allows them, each of its uses alike.
    const shadows = first!.shadows;
    if (group.some((u) => u.shadows !== shadows))
      throw contractUnmet(`Board ${name} is drawn with and without shadows`);
    const parts = pictureParts(size, shadows ? SHADOW_PEN : undefined, table.get(id));
    const grid = partsOnGrid(size, parts, texels.across, texels.down);
    const scale = { x: grid.width / size.width, y: grid.gridHeight / size.height };
    const aside = byEdge ? 0 : (objectAside(main, first!) / routine.pixelUnits) * scale.x;
    const point = {
      x: anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, 0, OUTRUN_SPRITES).x + aside,
      y: grid.anchorY,
    };
    const shadow = unionFrames(
      grid.shadow && {
        width: grid.width,
        height: grid.gridHeight,
        anchorX: point.x,
        anchorY: point.y,
        levels: [{ indices: turned(grid.shadow, grid.width, first!.mirrored) }],
      },
      // The shadow its original draws apart: at its scale against the object's and at the object's anchor.
      first!.shadow
        ? shadowFrame(
            cast.pixels,
            cast.width,
            { x: scale.x * castScale, y: scale.y * castScale },
            first!.anchor & 12,
            -aside / scale.x / castScale,
            OUTRUN_SPRITES,
          )
        : undefined,
    );
    const indices = turned(grid.indices, grid.width, first!.mirrored);
    const master = boardMaster(name, grid, indices, point, palettes, colors, shadow ? { shadow } : {});
    boards.push({ name, master, colored, extent: widthExtent(master) });
  }
  return boards;
}

/** Where a board reaches across from its base point, metres: half its width either side. */
const widthExtent = (master: SpriteLodDocument): readonly [number, number] => {
  const half = master.width / SPRITE_SOURCE_TEXELS_PER_METER / 2;
  return [-half, half];
};

/** A board: its master, but a strip's that does not loop without the scenery's reach. */
interface Board {
  readonly name: string;
  readonly master?: SpriteLodDocument;
  /** Its picture's colored columns' width, metres. */
  readonly colored: number;
  /** Where it reaches across from its base point on the ground, metres (`stripExtent` for a strip). */
  readonly extent: readonly [number, number];
}
