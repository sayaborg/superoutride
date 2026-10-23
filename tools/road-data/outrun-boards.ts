/**
 * OUTRUN's scenery as boards ([Original road data](../../docs/original-road-data.md#boards)): each sprite an object
 * shows, mirrored as it is shown, becomes a course image of its largest size's pixels in each palette it is shown in, on
 * the texel grid of the original's pixels at the road's scale, its base point the object's anchor, and its shadow the
 * original's. The pictures are the ROMs', provisional: the product draws its own.
 */
import { courseImageFile } from '../graphics/sprite-import.js';
import { spriteIdentityMixtures } from '../graphics/sprite-source-compiler.js';
import type { SpriteLodDocument } from '../../src/image/sprite.js';
import type { LyingPicture } from './ground-materials.js';
import { cutBoard, type StripCut } from './extending-boards.js';
import { OBJECT_ROUTINES, objectAside, objectSize, shadowSizes, spritePalette } from './outrun-sprites.js';
import { anchorPoint, outline, spritePixels } from './sprite-pixels.js';
import { chosenLines, footAnchorY, mirror, paletteName, SHADOW_PEN, shadowFrame, texelsAPixel } from './pixel-grid.js';

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
 * A sprite's use as a board needs it: whether it is drawn with shadows allowed (its pixel 10 shading) and whether it is
 * raised off the ground.
 */
export interface BoardUse extends SpriteUse {
  readonly shadows: boolean;
  readonly raised: boolean;
}

/** The boards `uses` need, each written as its course image (`boardMasters`). */
export function sceneryBoards(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]): BoardFiles[] {
  return boardMasters(main, words, uses).map(({ name, master }) => ({ name, image: courseImageFile(master) }));
}

/**
 * What the courses need of the boards `uses` show: the pictures of what lies on the ground, by image name, whose
 * materials lie beneath them; each extending board's edge, which stands once where it does; and the pictures standing
 * at their foot that are shown raised too, by their `-raised` image.
 */
export function boardShapes(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]) {
  const boards = boardMasters(main, words, uses);
  return {
    lying: new Map(boards.flatMap((b) => (b.lying ? [[b.name, b.lying] as const] : []))),
    edges: new Map(boards.flatMap((b) => (b.edge ? [[b.name, b.edge.name] as const] : []))),
    split: new Set(boards.filter((b) => b.split).map((b) => b.name)),
  };
}

/** An extending board's edge's image name: its family's, `-edge` after it. */
const edgeName = (name: string) => name.replace(/^(outrun-strip-[0-9a-f]+)/, '$1-edge');

/**
 * The boards `uses` need: one a sprite, mirroring and shadow, carrying every palette it is shown in (the first, by
 * number, its default). Each is made from the largest size's pixels (a family's nearest size) on its texel grid by
 * chosen lines (`chosenLines`), a mirrored one the unmirrored output mirrored, in the palettes' own colors. Across, an
 * object standing by its edge (`standsByEdge`) stands at that edge, any other at the middle of its hit extents, where a
 * solid object's body stands. It stands on its bottom edge, but what lies on the ground at its anchor's (its middle),
 * and a picture drawn with shadows allowed on the ground at its foot (`footAnchorY`), shown raised by its `-raised`
 * image on its bottom edge. A family extending sideways (`stripCut`) is cut into its edge's shape, a board of its own
 * (`-edge`) standing once where it does, and the part that repeats, its transparent end columns and its outer end's
 * shape left out.
 */
function boardMasters(main: Uint8Array, words: Uint32Array, uses: readonly BoardUse[]): Board[] {
  const groups = new Map<string, BoardUse[]>();
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
  const boards: Board[] = [];
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
    // The unmirrored picture by chosen lines; a mirrored board is its output mirrored.
    const texels = texelsAPixel(routine.pixelUnits);
    const grid = chosenLines(size.pixels, size.width, texels.across, texels.down);
    const indices = first!.mirrored ? mirror(grid.indices, grid.width) : grid.indices;
    const scale = { x: grid.width / size.width, y: grid.height / size.height };
    const palettes = [...new Set(group.map((u) => u.palette))].sort((a, b) => a - b);
    const byEdge = standsByEdge(first!);
    const point = anchorPoint(byEdge ? first!.anchor : first!.anchor & 12, grid.width, grid.height);
    // What rises stands on its bottom edge, or at its foot where it is drawn on the ground with shadows allowed; what
    // lies folds at its anchor.
    const foot =
      !lies && group.some((u) => u.shadows && !u.raised) ? footAnchorY(indices, grid.width, SHADOW_PEN) : undefined;
    if (!lies) point.y = foot ?? grid.height - 0.5;
    const aside = byEdge ? 0 : (objectAside(main, first!) / routine.pixelUnits) * scale.x;
    const cast = shadowOf(routine.shadow?.sizes);
    const castScale = routine.shadow?.scale ?? 1;
    const colors = (k: number) => [0, ...spritePalette(main, palettes[k]!).slice(1)];
    const whole: SpriteLodDocument = {
      format: 'superoutride.sprite-lod',
      version: 6,
      name,
      width: grid.width,
      height: grid.height,
      anchorX: point.x + aside,
      ...(point.y !== grid.height - 0.5 ? { anchorY: point.y } : {}),
      defaultPalette: paletteName(palettes[0]!),
      palettes: Object.fromEntries(palettes.map((p, k) => [paletteName(p), { colors: colors(k) }])),
      levels: [{ paletteRgb555: colors(0), indices, mixtures: spriteIdentityMixtures() }],
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
    };
    // What lies keeps its whole picture, its material's footprint.
    const lying = routine.lies ? { lying: { master: whole, anchorY: point.y, material: routine.lies.material } } : {};
    const split = foot !== undefined && group.some((u) => u.raised);
    if (split && extending) throw new RangeError(`Strip ${name} stands at its foot and raised`);
    if (!extending) {
      const { anchorY: _, ...bottom } = whole;
      boards.push(
        { name, master: whole, ...lying, split },
        ...(split ? [{ name: `${name}-raised`, master: { ...bottom, name: `${name}-raised` } }] : []),
      );
      continue;
    }
    const { cut, edge, repeat } = cutBoard(whole, edgeName(name));
    boards.push({ name: edge.name, master: edge }, { name, master: repeat, ...lying, edge: { name: edge.name, cut } });
  }
  return boards;
}

/** What lies on the ground: its whole picture and the material beneath it, or null for none. */
export interface LyingBoard extends LyingPicture {
  readonly material: string | null;
}

/** A board: its master; for what lies, its whole picture; for an extending one's repeating part, its edge's cut. */
interface Board {
  readonly name: string;
  readonly master: SpriteLodDocument;
  readonly lying?: LyingBoard;
  readonly edge?: { readonly name: string; readonly cut: StripCut };
  /** Whether it stands at its foot and is shown raised too, by its `-raised` image. */
  readonly split?: boolean;
}
