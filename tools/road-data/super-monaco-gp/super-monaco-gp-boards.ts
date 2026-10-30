/**
 * SUPER MONACO GP's objects as boards ([SUPER MONACO GP road data](../../../docs/super-monaco-gp-road-data.md#super-monaco-gps-objects)):
 * each picture an object shows, as it shows it (mirrored, flipped), becomes a course image of its frame table's largest
 * size in every palette it is shown in, on the texel grid by chosen lines. The pictures are the ROMs', provisional: the
 * product draws its own.
 */
import { contractUnmet, romDiffers } from '../shared/conversion-errors.js';
import { courseImageFile } from '../../graphics/sprite-import.js';
import { SPRITE_SOURCE_TEXELS_PER_METER, type SpriteLodDocument } from '../../../src/image/sprite.js';
import { CAMERA_DEFINITION } from '../../../src/view/camera-definition.js';
import { boardMaster, texelsAPixel, turned } from '../shared/pixel-grid.js';
import { partsOnGrid, pictureParts, spriteTable } from '../shared/sprite-rules.js';
import { largestPixels, readSpritePalette } from './super-monaco-gp-sprites.js';

/** An object's sprite flags: its palette, mirrored, flipped, and its base point at its picture's middle. */
export const FLAG = Object.freeze({ palette: 0xff, mirrored: 0x400, flipped: 0x800, middle: 0x2000 } as const);

/** The lateral units a largest-size pixel spans at size class `b1`: 8 / 2^b1, and 16 for 0xFF. */
export const pixelUnits = (b1: number) => (b1 === 0xff ? 16 : 8 / 2 ** b1);

/**
 * One way an object shows a picture: its frame table at a size class, mirrored, flipped, in a palette, and, folding
 * at the ground's row, how many texels above its bottom edge it folds.
 */
export interface BoardUse {
  readonly frames: number;
  readonly b1: number;
  readonly mirrored: boolean;
  readonly flipped: boolean;
  readonly palette: number;
  readonly fold?: number;
  readonly frame?: FramePlace;
}

/**
 * Where a picture of the tunnel's frame stands in its frame, as the original places it: `x` metres right of P, its
 * bottom edge `bottom` metres up; one of the walls' pictures or of the ceiling's.
 */
export interface FramePlace {
  readonly x: number;
  readonly bottom: number;
  readonly part: 'wall' | 'ceiling';
}

/** The tunnel's frame, metres: out to ±`half` and up to `top`, but its opening, within ±`inner` and below `ceiling`. */
export interface FrameShape {
  readonly half: number;
  readonly top: number;
  readonly inner: number;
  readonly ceiling: number;
}

const hex = (value: number, digits: number) => value.toString(16).padStart(digits, '0');
/** A picture of the extract's id: `smgp-<frame table>-<size class>`. */
export const pictureId = (use: Pick<BoardUse, 'frames' | 'b1'>) => `smgp-${hex(use.frames, 4)}-${hex(use.b1, 2)}`;
/** A board's image name: its picture's id, then whether mirrored and flipped. */
export const boardName = (use: Omit<BoardUse, 'palette' | 'fold'>) =>
  `${pictureId(use)}${use.mirrored ? '-mirrored' : ''}${use.flipped ? '-flipped' : ''}${use.frame ? '-frame' : ''}`;

/**
 * The boards' images, at `unit` metres a lateral unit, and their sizes for the report; the pictures of the tunnel's frame
 * each its frame, painted `dark` (RGB555) but its opening, its pieces at most `gap` metres apart.
 */
export function superMonacoGpBoards(
  main: Uint8Array,
  words: Uint32Array,
  boards: readonly BoardUse[],
  unit: number,
  tunnel: { readonly dark: number; readonly gap: number },
) {
  // A picture's colors: pen 0 and pen 15, the shadow's, transparent; in a frame pen 15 is the tunnel's dark.
  const colors = (p: number, last = 0) => [0, ...readSpritePalette(main, p).rgb555, last];
  const table = spriteTable();
  // A picture on the texel grid by the sprites' rules, drawn with no shadow (the sprites' reading gives pixel 15 as 0),
  // turned as shown (the unturned grid's lines turned, so a turned picture keeps its lines).
  const grid = (use: BoardUse) => {
    const { width, pixels } = largestPixels(main, words, use.frames);
    const picture = { width, height: pixels.length / width, pixels };
    const texels = texelsAPixel(pixelUnits(use.b1) * unit);
    const g = partsOnGrid(picture, pictureParts(picture, false, table.get(pictureId(use))), texels.across, texels.down);
    return { ...g, indices: turned(g.indices, g.width, use.mirrored, use.flipped) };
  };
  const shape = frameShape(
    boards.filter((use) => use.frame).map((use) => ({ place: use.frame!, grid: grid(use) })),
    tunnel.gap,
  );
  // A master: its base point the middle of its base, or `fold` texels above its bottom edge where it folds at the
  // original's ground line; a frame's the middle of its bottom edge, at P on the ground.
  const master = (name: string, use: BoardUse, palettes: ReadonlySet<number>): SpriteLodDocument => {
    const g = grid(use);
    const sorted = [...palettes].sort((a, b) => a - b);
    if (use.frame) {
      const f = framed(g, use.frame, shape!);
      return boardMaster(name, f, f.indices, { x: f.width / 2 - 0.5 }, sorted, (p) => colors(p, tunnel.dark));
    }
    const anchor = { x: g.width / 2 - 0.5, y: use.fold === undefined ? g.anchorY : g.gridHeight - 0.5 - use.fold };
    return boardMaster(name, g, g.indices, anchor, sorted, colors);
  };
  const group = <Use extends { readonly palette: number }>(uses: readonly Use[], name: (use: Use) => string) => {
    const named = new Map<string, { use: Use; palettes: Set<number> }>();
    for (const use of uses) {
      const key = name(use);
      if (!named.has(key)) named.set(key, { use, palettes: new Set() });
      named.get(key)!.palettes.add(use.palette);
    }
    return [...named].sort(([a], [b]) => (a < b ? -1 : 1));
  };
  const images: { name: string; texels: number; image: { path: string; bytes: Uint8Array } }[] = [];
  for (const [name, { use, palettes }] of group(boards, boardName)) {
    if (boards.some((u) => boardName(u) === name && u.fold !== use.fold))
      throw contractUnmet(`Board ${name} is shown folded and standing alike`);
    if (boards.some((u) => boardName(u) === name && JSON.stringify(u.frame) !== JSON.stringify(use.frame)))
      throw contractUnmet(`Board ${name} stands at two places in the tunnel's frame`);
    const board = master(name, use, palettes);
    images.push({ name, texels: board.width * board.height, image: courseImageFile(board) });
  }
  return { images, frame: shape };
}

/** A grid's texels a metre. */
const TEXELS = SPRITE_SOURCE_TEXELS_PER_METER;

/**
 * The tunnel's frame from its pictures as the original places them: its opening within the walls' pictures' inner edges
 * (the nearest P) and below the ceiling's pictures' tops (the highest), and the dark around it out as far as the camera
 * sees through the widest gap between two pieces, `gap` metres: out by `gap` × the screen's half width over the focal
 * length, up by `gap` × the rows above the horizon over it.
 */
function frameShape(
  pieces: readonly { place: FramePlace; grid: { width: number; height: number; indices: readonly number[] } }[],
  gap: number,
): FrameShape | null {
  if (pieces.length === 0) return null;
  const columns = (g: { width: number; height: number; indices: readonly number[] }) => {
    const drawn = Array.from({ length: g.width }, (_, x) =>
      Array.from({ length: g.height }, (_, y) => g.indices[y * g.width + x]).some((v) => v),
    );
    return { first: drawn.indexOf(true), last: drawn.lastIndexOf(true) };
  };
  const firstRow = (g: { width: number; height: number; indices: readonly number[] }) =>
    Array.from({ length: g.height }, (_, y) => g.indices.slice(y * g.width, (y + 1) * g.width).some((v) => v)).indexOf(
      true,
    );
  const walls = pieces.filter((p) => p.place.part === 'wall');
  const ceilings = pieces.filter((p) => p.place.part === 'ceiling');
  if (walls.length === 0 || ceilings.length === 0) throw romDiffers('The tunnel has no walls or no ceiling');
  const inner = Math.min(
    ...walls.map(({ place, grid }) => {
      const { first, last } = columns(grid);
      const edge = place.x < 0 ? last + 1 : first;
      return Math.abs(place.x + (edge - grid.width / 2) / TEXELS);
    }),
  );
  const ceiling = Math.max(
    ...ceilings.map(({ place, grid }) => place.bottom + (grid.height - firstRow(grid)) / TEXELS),
  );
  const { centerX, horizonRow, focalLength } = CAMERA_DEFINITION;
  return {
    inner,
    ceiling,
    half: inner + (gap * centerX) / focalLength,
    top: ceiling + (gap * horizonRow) / focalLength,
  };
}

/**
 * A picture in its frame: the frame's texels pen 15, the tunnel's dark, but its opening's transparent, and the picture's
 * drawn texels over them where the original places it (to the nearest texel).
 */
function framed(
  g: { width: number; height: number; indices: readonly number[] },
  place: FramePlace,
  shape: FrameShape,
) {
  const width = 2 * Math.round(shape.half * TEXELS);
  const height = Math.round(shape.top * TEXELS);
  const indices = Array.from({ length: width * height }, (_, i): number => {
    const [x, y] = [((i % width) + 0.5 - width / 2) / TEXELS, (height - Math.floor(i / width) - 0.5) / TEXELS];
    return Math.abs(x) < shape.inner && y < shape.ceiling ? 0 : 15;
  });
  const left = Math.round(width / 2 + place.x * TEXELS - g.width / 2);
  const top = height - Math.round(place.bottom * TEXELS) - g.height;
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const v = g.indices[y * g.width + x]!;
      const [fx, fy] = [left + x, top + y];
      if (v && fx >= 0 && fx < width && fy >= 0 && fy < height) indices[fy * width + fx] = v;
    }
  return { width, height, indices };
}
