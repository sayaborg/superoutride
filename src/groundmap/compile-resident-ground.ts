import { courseBoundaryAt } from '../course/course-bands.js';
import { contentDigest } from '../core/content-digest.js';
import { rgba } from '../graphics/software-surface.js';
import { rgbaToRgb555 } from '../graphics/rgb555.js';
import type { CourseGroundSourceData, CoursePaint } from '../visual/course-presentation.js';
import {
  GROUND_RECIPE,
  coarseShape,
  groundGrid,
  groundMaxLevel,
  groundMemory,
  groundByteLength,
  requireGroundCapacity,
  type GroundManifest,
} from './resident-ground.js';

const repeat = (x: number, period: number) => ((x % period) + period) % period;
const channels = Array.from({ length: 32 }, (_, x) => Math.round((x * 255) / 31));
const quantize = (r: number, g: number, b: number, area: number) =>
  area === 0 ? 0 : rgbaToRgb555(rgba(r / area, g / area, b / area));

/** Resolve the saved source field at its 40x40 cell centres. Reuse exact source rows, never filtered output. */
function sourceRows(data: CourseGroundSourceData, originCell: number, width: number) {
  const templates = new Map<string, { id: number; pixels: Uint16Array }>();
  const paintIds = new WeakMap<CoursePaint, number>();
  let nextPaint = 0;
  const rowLimit = Math.max(1, Math.floor((4 * 1024 * 1024) / (width * 2)));
  const cache = new Map<string, Uint16Array>();
  let nextId = 0;
  const template = (paint: CoursePaint, s: number) => {
    const source = paint.asset.source;
    const y = repeat(Math.floor(40 * (s - paint.phaseS)), source.height);
    const odd = paint.alternate ? repeat(Math.floor((s - paint.phaseS) / paint.alternate.spanS), 2) : 0;
    let paintId = paintIds.get(paint);
    if (paintId === undefined) {
      paintId = nextPaint++;
      paintIds.set(paint, paintId);
    }
    const key = `${paintId}/${y}/${odd}`;
    let row = templates.get(key);
    if (!row) {
      const pixels = new Uint16Array(width);
      for (let x = 0; x < width; x++) {
        const l = (originCell + x + 0.5) / 40;
        const sx = repeat(Math.floor(40 * (l - paint.phaseL)), source.width);
        const index = source.levels[0]!.indices[y * source.width + sx]!;
        const alternate = paint.alternate;
        const palette =
          alternate && (odd + repeat(Math.floor((l - paint.phaseL) / alternate.spanL), 2)) % 2
            ? alternate.paletteRgb555
            : source.levels[0]!.paletteRgb555;
        pixels[x] = index ? palette[index]! : data.baseRgb555;
      }
      row = { id: nextId++, pixels };
      if (templates.size >= rowLimit) templates.delete(templates.keys().next().value!);
      templates.set(key, row);
    }
    return row;
  };
  return (cellY: number) => {
    const s = Math.min(cellY + 0.5, (cellY + data.partition.length * 40) / 2) / 40;
    const layers: { start: number; end: number; row: Uint16Array }[] = [];
    let key = '';
    for (const binding of data.bands) {
      const band = binding.band;
      if (s < band.start.s || s >= band.end.s) continue;
      let index = binding.sections.length - 1;
      while (index > 0 && binding.sections[index]!.anchor.s > s) index--;
      const paint = binding.sections[index]!.paint;
      if (!paint) continue;
      const start = Math.max(0, Math.ceil(courseBoundaryAt(band.left, s) * 40 - originCell - 0.5));
      const end = Math.min(width, Math.ceil(courseBoundaryAt(band.right, s) * 40 - originCell - 0.5));
      const row = template(paint, s);
      key += `${start},${end},${row.id};`;
      layers.push({ start, end, row: row.pixels });
    }
    const stamps = data.stamps.filter(
      (stamp) => cellY >= stamp.gridS && cellY < stamp.gridS + stamp.asset.source.height,
    );
    for (const stamp of stamps) key += `s${stamp.id}:${cellY - stamp.gridS};`;
    let row = cache.get(key);
    if (row) return row;
    row = new Uint16Array(width).fill(data.baseRgb555);
    for (const layer of layers)
      if (layer.end > layer.start) row.set(layer.row.subarray(layer.start, layer.end), layer.start);
    for (const stamp of stamps) {
      const source = stamp.asset.source,
        level = source.levels[0]!;
      for (
        let x = Math.max(0, stamp.gridL - originCell);
        x < Math.min(width, stamp.gridL - originCell + source.width);
        x++
      ) {
        const index = level.indices[(cellY - stamp.gridS) * source.width + x + originCell - stamp.gridL]!;
        if (index) row[x] = level.paletteRgb555[index]!;
      }
    }
    // A bounded row cache is a compilation optimization, not a source or final-image authority.
    if (cache.size >= rowLimit) cache.delete(cache.keys().next().value!);
    cache.set(key, row);
    return row;
  };
}

/** Whole-course compilation with bounded source strips and exact completed-record deduplication. */
export async function compileResidentGround(inputs: readonly CourseGroundSourceData[], identity: string) {
  const grids = inputs.map((d) => groundGrid(d.partition.length, d.left, d.right));
  const kMax = groundMaxLevel(grids);
  requireGroundCapacity(groundByteLength(grids, 0, kMax));
  const dictionary: Uint16Array[] = [],
    buckets = new Map<number, number[]>();
  const sections = [];
  const intern = (record: Uint16Array) => {
    let hash = 2166136261;
    for (const value of record) hash = Math.imul(hash ^ value, 16777619) >>> 0;
    const bucket = buckets.get(hash) ?? [];
    for (const index of bucket) if (dictionary[index]!.every((value, i) => value === record[i])) return index;
    const index = dictionary.length;
    requireGroundCapacity(groundByteLength(grids, index + 1, kMax));
    dictionary.push(record);
    bucket.push(index);
    buckets.set(hash, bucket);
    return index;
  };
  let sourceCells = 0;
  for (const [sectionIndex, data] of inputs.entries()) {
    const grid = grids[sectionIndex]!,
      width = grid.columns * 64;
    const rowAt = sourceRows(data, grid.originCell, width);
    const directory = new Uint32Array(grid.columns * grid.rows);
    const shape = coarseShape(grid, 3);
    // Unquantized sums retain direct-source integration for every coarse level.
    const shapes = Array.from({ length: kMax - 2 }, (_, i) => coarseShape(grid, i + 3));
    const levels = shapes.map((shape) => new Uint16Array(shape.width * shape.height));
    const accumulators = shapes.map((shape) => new Float64Array(shape.width * 4));
    const sums = accumulators[0]!;
    const finishRow = (index: number, y: number) => {
      const current = accumulators[index]!,
        shape = shapes[index]!,
        pixels = levels[index]!;
      const next = accumulators[index + 1];
      for (let x = 0; x < shape.width; x++) {
        const at = x * 4;
        pixels[y * shape.width + x] = quantize(current[at]!, current[at + 1]!, current[at + 2]!, current[at + 3]!);
        if (next)
          for (let c = 0; c < 4; c++) {
            const to = Math.floor(x / 2) * 4 + c;
            next[to] = next[to]! + current[at + c]!;
          }
      }
      current.fill(0);
      if (next && ((y + 1) % 4 === 0 || y + 1 === shape.height)) finishRow(index + 1, Math.floor(y / 4));
    };
    const prefix = new Float64Array(65 * 65 * 4);
    const rowIds = new WeakMap<Uint16Array, Uint32Array>();
    const chunks = new Map<number, { id: number; pixels: Uint16Array }[]>();
    let nextChunk = 0;
    const identifyRow = (row: Uint16Array) => {
      let ids = rowIds.get(row);
      if (ids) return ids;
      ids = new Uint32Array(grid.columns);
      for (let tx = 0; tx < grid.columns; tx++) {
        const start = tx * 64;
        let hash = 2166136261;
        for (let x = 0; x < 64; x++) hash = Math.imul(hash ^ row[start + x]!, 16777619) >>> 0;
        const bucket = chunks.get(hash) ?? [];
        let found = bucket.find((chunk) => chunk.pixels.every((value, x) => value === row[start + x]));
        if (!found) {
          found = { id: nextChunk++, pixels: row.slice(start, start + 64) };
          bucket.push(found);
          if (chunks.size >= 4096) chunks.delete(chunks.keys().next().value!);
          chunks.set(hash, bucket);
        }
        ids[tx] = found.id;
      }
      rowIds.set(row, ids);
      return ids;
    };
    const tileCache = new Map<string, { tile: number; sums: Float64Array }>();
    for (let ty = 0; ty < grid.rows; ty++) {
      const rows = Array.from({ length: 64 }, (_, y) => rowAt(ty * 64 + y));
      const ids = rows.map(identifyRow);
      for (let tx = 0; tx < grid.columns; tx++) {
        const start = grid.originCell + tx * 64;
        const rowKey = ids.map((row) => row[tx]).join(',');
        const key = `${Math.max(0, -data.left * 40 - start)}/${Math.min(64, data.right * 40 - start)}/${Math.min(64, data.partition.length * 40 - ty * 64)}/${rowKey}`;
        const cached = tileCache.get(key);
        if (cached) {
          directory[ty * grid.columns + tx] = cached.tile;
          for (let x = 0; x < 8 && tx * 8 + x < shape.width; x++) {
            const at = (tx * 8 + x) * 4;
            for (let c = 0; c < 4; c++) sums[at + c] = sums[at + c]! + cached.sums[x * 4 + c]!;
          }
          continue;
        }
        prefix.fill(0);
        for (let y = 0; y < 64; y++) {
          let r = 0,
            g = 0,
            b = 0,
            a = 0;
          const weightY = Math.max(0, Math.min(1, data.partition.length * 40 - (ty * 64 + y)));
          for (let x = 0; x < 64; x++) {
            const cellX = grid.originCell + tx * 64 + x;
            const weightX = Math.max(0, Math.min(cellX + 1, data.right * 40) - Math.max(cellX, -data.left * 40));
            const weight = weightX * weightY;
            const color = rows[y]![tx * 64 + x]!;
            r += channels[(color >>> 10) & 31]! * weight;
            g += channels[(color >>> 5) & 31]! * weight;
            b += channels[color & 31]! * weight;
            a += weight;
            const at = ((y + 1) * 65 + x + 1) * 4,
              above = at - 65 * 4;
            prefix[at] = prefix[above]! + r;
            prefix[at + 1] = prefix[above + 1]! + g;
            prefix[at + 2] = prefix[above + 2]! + b;
            prefix[at + 3] = prefix[above + 3]! + a;
          }
        }
        const area = (x0: number, y0: number, x1: number, y1: number, c: number) =>
          prefix[(y1 * 65 + x1) * 4 + c]! -
          prefix[(y0 * 65 + x1) * 4 + c]! -
          prefix[(y1 * 65 + x0) * 4 + c]! +
          prefix[(y0 * 65 + x0) * 4 + c]!;
        const record = new Uint16Array(GROUND_RECIPE.nearTexels);
        let offset = 0;
        for (let k = 0; k < 3; k++) {
          const dx = 2 ** k,
            dy = 4 * 4 ** k;
          for (let y = 0; y < 64; y += dy)
            for (let x = 0; x < 64; x += dx)
              record[offset++] = quantize(
                area(x, y, x + dx, y + dy, 0),
                area(x, y, x + dx, y + dy, 1),
                area(x, y, x + dx, y + dy, 2),
                area(x, y, x + dx, y + dy, 3),
              );
        }
        const tile = intern(record);
        directory[ty * grid.columns + tx] = tile;
        const tileSums = new Float64Array(32);
        for (let x = 0; x < 64; x += 8) {
          const cx = tx * 8 + x / 8;
          if (cx >= shape.width) break;
          const at = cx * 4;
          for (let c = 0; c < 4; c++) {
            const total = area(x, 0, x + 8, 64, c);
            tileSums[(x / 8) * 4 + c] = total;
            sums[at + c] = sums[at + c]! + total;
          }
        }
        if (tileCache.size >= 2048) tileCache.delete(tileCache.keys().next().value!);
        tileCache.set(key, { tile, sums: tileSums });
        sourceCells += 4096;
      }
      if ((ty + 1) % 4 === 0 || ty + 1 === grid.rows) finishRow(0, Math.floor(ty / 4));
    }
    sections.push({ directory, levels });
  }
  const byteLength = groundByteLength(grids, dictionary.length, kMax);
  const header = {
    recipe: GROUND_RECIPE,
    identity,
    sha256: '0'.repeat(64),
    byteLength,
    uniqueTiles: dictionary.length,
    kMax,
    grids: Object.freeze(grids),
  };
  groundMemory(header);
  const payload = new Uint8Array(byteLength),
    bytes = new DataView(payload.buffer);
  let offset = 0;
  for (const record of dictionary)
    for (const value of record) {
      bytes.setUint16(offset, value, true);
      offset += 2;
    }
  for (const { directory, levels } of sections) {
    for (const value of directory) {
      bytes.setUint32(offset, value, true);
      offset += 4;
    }
    for (const level of levels)
      for (const value of level) {
        bytes.setUint16(offset, value, true);
        offset += 2;
      }
  }
  const manifest: GroundManifest = Object.freeze({ ...header, sha256: await contentDigest(payload) });
  return Object.freeze({ manifest, payload, sourceCells });
}
