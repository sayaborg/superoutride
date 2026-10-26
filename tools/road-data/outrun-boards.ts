/**
 * OUTRUN's scenery as boards ([OUTRUN road data](../../docs/outrun-road-data.md#boards)): each sprite an object
 * shows, mirrored as it is shown, becomes a course image of its largest size's pixels in each palette it is shown in, on
 * the texel grid of the original's pixels at the road's scale, by the sprites' rules, and its shadow the original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../src/image/sprite.js';
import { cutBoard, type StripCut } from './extending-boards.js';
import { OBJECT_ROUTINES, objectAside, objectSize, shadowSizes, spritePalette } from './outrun-sprites.js';
import { anchorPoint, outline, spritePixels } from './sprite-pixels.js';
import { boardMaster, chosenLines, shadowFrame, texelsAPixel, turned, UNIT_METRES } from './pixel-grid.js';
import { floats, partsOnGrid, pictureParts, shadingNames, spriteTable, unionFrames } from './sprite-rules.js';

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
export function sceneryBoards(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]): BoardFiles[] {
  return boardMasters(main, words, uses).map(({ name, master }) => ({ name, image: courseImageFile(master) }));
}

/**
 * What the courses need of the boards `uses` show: each extending board's edge, which stands once where it does, and
 * each board's width in metres.
 */
export function boardShapes(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]) {
  const boards = boardMasters(main, words, uses);
  return {
    edges: new Map(boards.flatMap((b) => (b.edge ? [[b.name, b.edge.name] as const] : []))),
    widths: new Map(boards.map((b) => [b.name, b.master.width / SPRITE_SOURCE_TEXELS_PER_METER])),
  };
}

/** An extending board's edge's image name: its family's, `-edge` after it. */
const edgeName = (name: string) => name.replace(/^(outrun-strip-[0-9a-f]+)/, '$1-edge');

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels (a family's nearest size) on its texel grid by
 * chosen lines (`chosenLines`), a mirrored one the unmirrored output mirrored, in the palettes' own colors. Across, an
 * object standing by its edge (`standsByEdge`) stands at that edge, any other at the middle of its hit extents, where a
 * solid object's body stands. It stands on its base by the sprites' rules (`pictureParts`), drawn with shadows allowed
 * as its drawing allows them; what its original draws on the road (drawing 13) lies about its anchor (its middle). A
 * family extending sideways (`stripCut`) stands on its bottom edge or folds at its anchor, cut into its edge's shape,
 * a board of its own (`-edge`) standing once where it does, and the part that repeats, its transparent end columns and
 * its outer end's shape left out.
 */
function boardMasters(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]): Board[] {
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
      shadows.set(address, { width: size.width, pixels: outline(spritePixels(words, size), size.width) });
    }
    return shadows.get(address)!;
  };
  const boards: Board[] = [];
  const table = spriteTable();
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
    // A family extends away from the road (right, or left mirrored).
    const lies = routine.lies !== undefined;
    const extending = routine.family !== undefined;
    const size = { ...largest, pixels: spritePixels(words, largest) };
    const texels = texelsAPixel(routine.pixelUnits * UNIT_METRES);
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const colors = (p: number) => [0, ...spritePalette(main, p).slice(1)];
    const byEdge = standsByEdge(first!);
    const cast = shadowOf(routine.shadow?.sizes);
    const castScale = routine.shadow?.scale ?? 1;
    if (extending) {
      // The unmirrored picture by chosen lines; a mirrored board is its output mirrored.
      const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
      const point = anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, grid.height);
      // What rises stands on its bottom edge; what lies folds at its anchor.
      if (!lies) point.y = grid.height - 0.5;
      const whole = boardMaster(
        name,
        grid,
        turned(grid.indices, grid.width, first!.mirrored),
        point,
        palettes,
        colors,
        {
          extend: first!.mirrored ? ('left' as const) : ('right' as const),
        },
      );
      const { cut, edge, repeat } = cutBoard(whole, edgeName(name));
      boards.push({ name: edge.name, master: edge }, { name, master: repeat, edge: { name: edge.name, cut } });
      continue;
    }
    if (lies) {
      // What its original draws lying on the road lies, about its original's anchor (its middle), in its colors.
      const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
      const point = anchorPoint(first!.anchor & 12, grid.width, grid.height);
      const indices = turned(grid.indices, grid.width, first!.mirrored);
      boards.push({ name, master: boardMaster(name, grid, indices, point, palettes, colors, { lies: true }) });
      continue;
    }
    // The sprites' rules: shadows allowed as its drawing allows them, each of its uses alike.
    const shadows = first!.shadows;
    if (group.some((u) => u.shadows !== shadows))
      throw new RangeError(`Board ${name} is drawn with and without shadows`);
    const parts = pictureParts(size, shadows, table.get(name.replace(/(-mirrored)?(-shadowed)?(-unshaded)?$/, '')));
    const grid = partsOnGrid(size, parts, texels.across, texels.down);
    const scale = { x: grid.width / size.width, y: grid.gridHeight / size.height };
    const aside = byEdge ? 0 : (objectAside(main, first!) / routine.pixelUnits) * scale.x;
    const point = {
      x: anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, 0).x + aside,
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
          )
        : undefined,
    );
    const indices = turned(grid.indices, grid.width, first!.mirrored);
    boards.push({ name, master: boardMaster(name, grid, indices, point, palettes, colors, shadow ? { shadow } : {}) });
  }
  return boards;
}

/** A board: its master; for an extending one's repeating part, its edge's cut. */
interface Board {
  readonly name: string;
  readonly master: SpriteLodDocument;
  readonly edge?: { readonly name: string; readonly cut: StripCut };
}
