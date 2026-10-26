/**
 * The sprites' rules ([Original road data](../../docs/original-road-data.md#pictures-from-the-extract)): one set for
 * every original, turning a picture of the extract (its pixels as the ROM holds them, pen 10 among them) into its body,
 * its shadow frame and its base, by the original's flags for a use and K's table (`sprite-table.json`).
 */
import { readFileSync } from 'node:fs';
import { requireInput } from '../course/authoring-io.js';
import { chosenGrid, SHADOW_PEN } from './pixel-grid.js';

/** A picture of the extract: its pixels (row-major palette indices, 0 transparent), unmirrored, `width` wide. */
export interface ExtractPicture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

/**
 * K's judgement of a picture's look, where the rules alone cannot tell, with its reason: pen 10 a colour, a painted
 * shadow, or both (a crowd, its gaps black and its shadow at its feet); a base row; or the whole lying.
 */
export interface TableEntry {
  readonly penIsColour?: true;
  readonly paintedShadow?: { readonly indices: readonly number[]; readonly fromRow: number };
  /** A row, or the original's ground line (`groundLine`), which its use's height gives. */
  readonly base?: number | 'groundLine';
  readonly lies?: true;
  readonly reason: string;
}

/** A picture's parts in its source pixels: its body, its shadow frame (1 where shadow) and its base row. */
export interface PictureParts {
  readonly body: Uint8Array;
  readonly shadow: Uint8Array;
  /** The row standing on the ground: its bottom edge is the base point's height; rows below lie on the nearer ground. */
  readonly base: number;
  readonly lies: boolean;
}

/**
 * The rules R1 to R6 for `picture` in a use drawn with shadows allowed (`shadows`) or not, by K's `entry`:
 *
 * - R1: with shadows allowed pen 10 is shadow, taken from the body into the shadow frame; else, or where K's table
 *   says so (`penIsColour`), it is a color.
 * - R2, R3: the ground's shadow is reached from seeds, those shadow pixels with only shadow or transparency below them
 *   in their column, through shadow pixels' eight neighbours; the shadow pixels are the shadow pen's and those of K's
 *   `paintedShadow` indices from its row down, the latter taken from the body only where reached.
 * - R4: in each row of the ground's shadow, the body's pixels between its leftmost and rightmost pixels are also
 *   shadow, staying in the body.
 * - R6: the base is the body's lowest row holding a pixel, or K's `base` (at the original's ground line its last row,
 *   the use placing the base point); a lying picture (`lies`) keeps its original's anchor.
 */
export function pictureParts(picture: ExtractPicture, shadows: boolean, entry?: TableEntry): PictureParts {
  const { width, height, pixels } = picture;
  const body = Uint8Array.from(pixels);
  const shadow = new Uint8Array(pixels.length);
  const pen = shadows && !entry?.penIsColour;
  const painted = entry?.paintedShadow;
  const isPen = (i: number) => pen && pixels[i] === SHADOW_PEN;
  const candidate = (i: number) =>
    isPen(i) || (painted !== undefined && i >= painted.fromRow * width && painted.indices.includes(pixels[i]!));
  for (let i = 0; i < pixels.length; i++) if (isPen(i)) [body[i], shadow[i]] = [0, 1];

  // The ground's shadow, from its seeds through eight neighbours.
  const ground = new Uint8Array(pixels.length);
  const stack: number[] = [];
  for (let x = 0; x < width; x++)
    for (let y = height - 1; y >= 0; y--) {
      const i = y * width + x;
      if (pixels[i] === 0) continue;
      if (!candidate(i)) break;
      ground[i] = 1;
      stack.push(i);
    }
  while (stack.length) {
    const i = stack.pop()!;
    const [x, y] = [i % width, Math.floor(i / width)];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const [u, v] = [x + dx, y + dy];
        if (u < 0 || u >= width || v < 0 || v >= height) continue;
        const j = v * width + u;
        if (ground[j] || !candidate(j)) continue;
        ground[j] = 1;
        stack.push(j);
      }
  }
  for (let i = 0; i < pixels.length; i++) if (ground[i]) [body[i], shadow[i]] = [0, 1];

  // Fill A: a row's body between its ground shadow's ends is shadow too.
  for (let y = 0; y < height; y++) {
    let [lo, hi] = [width, -1];
    for (let x = 0; x < width; x++) if (ground[y * width + x]) [lo, hi] = [Math.min(lo, x), Math.max(hi, x)];
    for (let x = lo + 1; x < hi; x++) if (body[y * width + x]) shadow[y * width + x] = 1;
  }

  let base = typeof entry?.base === 'number' ? entry.base : height - 1;
  if (entry?.base === undefined)
    while (base > 0 && !body.subarray(base * width, (base + 1) * width).some((v) => v)) base--;
  return { body, shadow, base, lies: entry?.lies === true };
}

/**
 * A picture's parts on the texel grid of `across` and `down` texels a pixel, the lines chosen from the extract's
 * pixels (`chosenGrid`): the body's indices to its base's row, its base point's height that row's bottom edge (where the
 * body has rows below it, K's `base`, they stay below it), and the shadow frame's on the whole grid (undefined where it
 * has none).
 */
export function partsOnGrid(picture: ExtractPicture, parts: PictureParts, across: number, down: number) {
  const { columns, rows } = chosenGrid(picture.pixels, picture.width, across, down);
  const drawn = (y: number) => parts.body.subarray(y * picture.width, (y + 1) * picture.width).some((v) => v);
  const last = (keep: (y: number) => boolean) => rows.reduce((found, y, t) => (keep(y) ? t : found), 0);
  const baseRow = last((y) => y <= parts.base);
  const kept = rows.slice(0, last((y) => y <= parts.base || drawn(y)) + 1);
  const lay = (source: Uint8Array, lines: readonly number[]) =>
    lines.flatMap((y) => columns.map((x) => source[y * picture.width + x]!));
  const shadow = lay(parts.shadow, rows);
  return {
    width: columns.length,
    height: kept.length,
    /** The whole grid's height, the picture's rows below its base and its bottom edge's included. */
    gridHeight: rows.length,
    indices: lay(parts.body, kept),
    anchorY: baseRow + 0.5,
    shadow: shadow.some((v) => v) ? shadow : undefined,
  };
}

/** A shadow frame: binary, anchored at its picture's base point. */
export interface ShadowFrame {
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly levels: readonly { readonly indices: readonly number[] }[];
}

/**
 * One shadow frame of a picture's two: its own (`painted`, the shadow pen's and its ground's) and the shadow picture its
 * original draws apart (`cast`), on one grid at the picture's scale, the latter placed by its anchor to the nearest
 * texel.
 */
export function unionFrames(painted: ShadowFrame | undefined, cast: ShadowFrame | undefined): ShadowFrame | undefined {
  if (!painted || !cast) return painted ?? cast;
  const dx = Math.round(painted.anchorX - cast.anchorX);
  const dy = Math.round(painted.anchorY - cast.anchorY);
  const [left, top] = [Math.min(0, dx), Math.min(0, dy)];
  const width = Math.max(painted.width, dx + cast.width) - left;
  const height = Math.max(painted.height, dy + cast.height) - top;
  const indices = new Array<number>(width * height).fill(0);
  const lay = (frame: ShadowFrame, x0: number, y0: number) =>
    frame.levels[0]!.indices.forEach((v, i) => {
      if (v) indices[(y0 + Math.floor(i / frame.width)) * width + x0 + (i % frame.width)] = 1;
    });
  lay(painted, -left, -top);
  lay(cast, dx - left, dy - top);
  return { width, height, anchorX: painted.anchorX - left, anchorY: painted.anchorY - top, levels: [{ indices }] };
}

let table: ReadonlyMap<string, TableEntry> | undefined;

/** K's table (`sprite-table.json`), admitted once: an entry an extract picture's id, each one judgement and its reason. */
export function spriteTable(): ReadonlyMap<string, TableEntry> {
  if (table) return table;
  const file = '/tools/road-data/sprite-table.json';
  const document: unknown = JSON.parse(readFileSync(new URL('sprite-table.json', import.meta.url), 'utf8'));
  requireInput(isRecord(document) && isRecord(document.pictures), file, 'Its shape');
  const entries = new Map<string, TableEntry>();
  for (const [id, entry] of Object.entries(document.pictures)) {
    const path = `${file}/pictures/${id}`;
    requireInput(isRecord(entry) && typeof entry.reason === 'string' && entry.reason !== '', path, 'A reason');
    const kinds = ['penIsColour', 'paintedShadow', 'base', 'lies'].filter((k) => k in entry);
    const colourAndPainted = kinds.length === 2 && 'penIsColour' in entry && 'paintedShadow' in entry;
    requireInput(
      kinds.length === 1 || colourAndPainted,
      path,
      'One judgement, or pen 10 a colour and a painted shadow',
    );
    for (const flag of ['penIsColour', 'lies'])
      if (flag in entry) requireInput(entry[flag] === true, `${path}/${flag}`, 'A flag is true');
    if ('base' in entry)
      requireInput(isRow(entry.base) || entry.base === 'groundLine', `${path}/base`, 'A row or the ground line');
    if ('paintedShadow' in entry) {
      const painted = entry.paintedShadow;
      requireInput(
        isRecord(painted) &&
          isRow(painted.fromRow) &&
          Array.isArray(painted.indices) &&
          painted.indices.length > 0 &&
          painted.indices.every((k) => Number.isInteger(k) && k > 0 && k < 16),
        `${path}/paintedShadow`,
        'Indices 1 to 15 and a row',
      );
    }
    entries.set(id, Object.freeze(entry as unknown as TableEntry));
  }
  return (table = entries);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isRow = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
