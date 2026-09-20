import { contentDigest } from '../core/content-digest.js';
import { rgb555ToRgba } from '../graphics/rgb555.js';

/** Fixed completed-color storage, independent of course topology and physical support. */
export const GROUND_RECIPE = Object.freeze({
  id: 'superoutride.resident-rgb555',
  version: 1,
  sourceDensity: 40,
  tileCells: 64,
  nearTexels: 1168,
  colorSpace: 'encoded-srgb',
  filter: 'source-cell-area',
});
const rgbaColors = Uint32Array.from({ length: 32768 }, (_, value) => rgb555ToRgba(value));

export const GROUND_LIMITS = Object.freeze({ residentBytes: 64 * 1024 * 1024, loadBytes: 128 * 1024 * 1024 });
interface GroundGrid {
  readonly length: number;
  readonly left: number;
  readonly right: number;
  readonly originCell: number;
  readonly columns: number;
  readonly rows: number;
}
export interface GroundManifest {
  readonly recipe: typeof GROUND_RECIPE;
  readonly identity: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly uniqueTiles: number;
  readonly kMax: number;
  readonly grids: readonly GroundGrid[];
}
export class GroundDataError extends Error {
  readonly diagnostic;
  constructor(code: 'capacity' | 'invalid_ground', message: string) {
    super(message);
    this.diagnostic = Object.freeze({ kind: 'ground', code, message });
  }
}
export function groundGrid(length: number, left: number, right: number): GroundGrid {
  const originCell = Math.floor((-left * 40) / 64) * 64;
  return Object.freeze({
    length,
    left: -left,
    right,
    originCell,
    columns: Math.ceil((right * 40 - originCell) / 64),
    rows: Math.ceil((length * 40) / 64),
  });
}
export function coarseShape(grid: GroundGrid, k: number) {
  return {
    width: Math.ceil((grid.right * 40 - grid.originCell) / 2 ** k),
    height: Math.ceil((grid.length * 40) / (4 * 4 ** k)),
  };
}
export function groundMaxLevel(grids: readonly GroundGrid[]) {
  let level = 3;
  while (
    grids.some((grid) => {
      const shape = coarseShape(grid, level);
      return shape.width > 1 || shape.height > 1;
    })
  )
    level++;
  return level;
}
export function groundByteLength(grids: readonly GroundGrid[], uniqueTiles: number, kMax: number) {
  let bytes = uniqueTiles * GROUND_RECIPE.nearTexels * 2;
  for (const grid of grids) {
    bytes += grid.columns * grid.rows * 4;
    for (let k = 3; k <= kMax; k++) {
      const { width, height } = coarseShape(grid, k);
      bytes += width * height * 2;
    }
  }
  return bytes;
}
export function requireGroundCapacity(bytes: number, limit = GROUND_LIMITS.residentBytes) {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit)
    throw new GroundDataError('capacity', `Resident RGB555 requires ${bytes} bytes; limit is ${limit} bytes`);
}
export function selectGroundLevel(deltaS: number, kMax: number) {
  if (!Number.isFinite(deltaS) || deltaS < 0) throw new RangeError('Ground footprint must be finite and nonnegative');
  let k = 0,
    threshold = 0.2;
  while (k < kMax && deltaS >= threshold) {
    k++;
    threshold *= 4;
  }
  return k;
}

/** Payload accounting excludes VM object headers; acquisition/digest copies are explicit. */
export function groundMemory(manifest: GroundManifest) {
  const metadataBytes = new TextEncoder().encode(JSON.stringify(manifest)).byteLength;
  const residentBytes = manifest.byteLength + rgbaColors.byteLength + metadataBytes;
  const loadPeakBytes = manifest.byteLength * 3 + rgbaColors.byteLength + metadataBytes;
  requireGroundCapacity(residentBytes);
  requireGroundCapacity(loadPeakBytes, GROUND_LIMITS.loadBytes);
  return Object.freeze({
    residentBytes,
    loadPeakBytes,
    encodedBytes: manifest.byteLength,
    metadataBytes,
    colorLookupBytes: rgbaColors.byteLength,
    uniqueTiles: manifest.uniqueTiles,
    sectionCount: manifest.grids.length,
  });
}

/** Manifest preflight precedes pixel acquisition in the browser root. */
export function validateGroundManifest(input: unknown, identity: string, expected: readonly GroundGrid[]) {
  const fail = (message: string): never => {
    throw new GroundDataError('invalid_ground', message);
  };
  if (!input || typeof input !== 'object') return fail('Missing resident ground manifest');
  const m = input as GroundManifest;
  const sameRecord = (input: unknown, expected: object) =>
    input !== null &&
    typeof input === 'object' &&
    Object.keys(input).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => (input as Record<string, unknown>)[key] === value);
  if (
    Object.keys(m).some(
      (key) => !['recipe', 'identity', 'sha256', 'byteLength', 'uniqueTiles', 'kMax', 'grids'].includes(key),
    ) ||
    !sameRecord(m.recipe, GROUND_RECIPE) ||
    m.identity !== identity ||
    !Number.isSafeInteger(m.uniqueTiles) ||
    m.uniqueTiles < 1 ||
    !Number.isInteger(m.kMax) ||
    m.kMax !== groundMaxLevel(expected) ||
    !Array.isArray(m.grids) ||
    m.grids.length !== expected.length ||
    m.grids.some((grid, index) => !sameRecord(grid, expected[index]!)) ||
    !/^[0-9a-f]{64}$/.test(m.sha256)
  )
    return fail('Resident ground recipe, identity or grids do not match this course');
  const length = groundByteLength(expected, m.uniqueTiles, m.kMax);
  if (m.byteLength !== length) return fail('Resident ground length mismatch');
  const manifest: GroundManifest = Object.freeze({ ...m, recipe: GROUND_RECIPE, grids: Object.freeze([...expected]) });
  return Object.freeze({ manifest, metrics: groundMemory(manifest) });
}

/** Validate the whole payload before any reader escapes; the owned bytes are never exposed. */
export async function readResidentGround(
  input: unknown,
  payload: Uint8Array<ArrayBuffer>,
  identity: string,
  expected: readonly GroundGrid[],
) {
  const { manifest: m, metrics } = validateGroundManifest(input, identity, expected);
  const fail = (message: string): never => {
    throw new GroundDataError('invalid_ground', message);
  };
  if (payload.byteLength !== m.byteLength) return fail('Resident ground length mismatch');
  const owned = payload.slice();
  if ((await contentDigest(owned)) !== m.sha256) return fail('Resident ground SHA-256 mismatch');
  const bytes = new DataView(owned.buffer);
  const dictionaryLength = m.uniqueTiles * GROUND_RECIPE.nearTexels;
  for (let i = 0; i < dictionaryLength; i++)
    if (bytes.getUint16(i * 2, true) > 32767) return fail('Resident ground contains a non-RGB555 color');
  let offset = dictionaryLength * 2;
  const readers = expected.map((grid) => {
    const directoryOffset = offset;
    const count = grid.columns * grid.rows;
    for (let i = 0; i < count; i++)
      if (bytes.getUint32(offset + i * 4, true) >= m.uniqueTiles)
        return fail('Resident tile reference is out of range');
    offset += count * 4;
    const coarse: { width: number; height: number; offset: number; scaleL: number; scaleS: number }[] = [];
    for (let k = 3; k <= m.kMax; k++) {
      const shape = coarseShape(grid, k);
      const start = offset;
      const count = shape.width * shape.height;
      for (let i = 0; i < count; i++)
        if (bytes.getUint16(offset + i * 2, true) > 32767) return fail('Resident ground contains a non-RGB555 color');
      offset += count * 2;
      coarse.push(Object.freeze({ ...shape, offset: start, scaleL: 40 / 2 ** k, scaleS: 10 / 4 ** k }));
    }
    // Row/span addressing is retained across the renderer's pixel loop, without changing its API.
    let lastS = NaN,
      lastK = -1,
      rowOffset = 0,
      rowY = 0;
    return Object.freeze({
      domain: Object.freeze({ start: 0, end: grid.length, left: grid.left, right: grid.right }),
      kMax: m.kMax,
      sampleAtLevel(s: number, l: number, k: number) {
        if (typeof s !== 'number' || typeof l !== 'number' || typeof k !== 'number')
          throw new TypeError('Resident ground coordinates and level must be numeric');
        if (
          s < 0 ||
          s > grid.length ||
          l < grid.left ||
          l >= grid.right ||
          !Number.isFinite(s) ||
          !Number.isFinite(l) ||
          !Number.isInteger(k) ||
          k < 0 ||
          k > m.kMax
        )
          throw new RangeError('Resident ground query outside admitted domain');
        const x = l * 40 - grid.originCell;
        let index;
        if (k < 3) {
          const width = 64 >> k;
          if (s !== lastS || k !== lastK) {
            const y = Math.min(Math.floor(s * 40), Math.ceil(grid.length * 40) - 1);
            rowOffset = directoryOffset + Math.floor(y / 64) * grid.columns * 4;
            rowY = Math.floor((y % 64) / (4 * 4 ** k)) * width;
            lastS = s;
            lastK = k;
          }
          const column = Math.floor(x / 64);
          const tile = bytes.getUint32(rowOffset + column * 4, true);
          index =
            tile * GROUND_RECIPE.nearTexels +
            (k === 0 ? 0 : k === 1 ? 1024 : 1152) +
            rowY +
            Math.floor((x % 64) / (64 / width));
          return rgbaColors[bytes.getUint16(index * 2, true)]!;
        }
        const level = coarse[k - 3]!;
        if (s !== lastS || k !== lastK) {
          rowOffset = level.offset + Math.min(Math.floor(s * level.scaleS), level.height - 1) * level.width * 2;
          lastS = s;
          lastK = k;
        }
        index = Math.floor(x / 2 ** k);
        return rgbaColors[bytes.getUint16(rowOffset + index * 2, true)]!;
      },
    });
  });
  return Object.freeze({
    readers: Object.freeze(readers),
    kMax: m.kMax,
    metrics,
  });
}
