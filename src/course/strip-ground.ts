import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { rgb555LinearChannel } from '../image/image-filter.js';
import { resolveStripSlabs, stripEdgeAt, type StripPiece, type StripSlab } from './strip-slabs.js';

export const STRIP_ACTIVE_LIMIT = COURSE_DOCUMENT_LIMITS.activeStrips;
/** Smallest cached interval in metres. */
export const STRIP_BASE_STEP = 1;

interface StripLateralField {
  readonly count: number;
  readonly base: readonly number[];
  /** x, premultiplied linear R/G/B/coverage, then their lateral slopes. Private owned storage. */
  readonly data: Float64Array;
}
interface Level {
  readonly step: number;
  readonly indices: Uint32Array;
  readonly active: Uint8Array;
}
interface Event {
  readonly x: number;
  readonly value: number[];
  readonly slope: number[];
}

/** Integrating an affine edge over s yields a lateral ramp, not a relocated hard edge. */
function lateralFieldFor(
  slabs: readonly StripSlab[],
  first: number,
  start: number,
  end: number,
  path: string,
): { field: StripLateralField; active: number; key: string } {
  const base = [0, 0, 0, 0],
    events = new Map<number, Event>();
  let active = 0;
  const event = (x: number) => {
    let value = events.get(x);
    if (!value) {
      value = { x, value: [0, 0, 0, 0], slope: [0, 0, 0, 0] };
      events.set(x, value);
    }
    return value;
  };
  for (let i = first; i < slabs.length && slabs[i]!.start < end; i++) {
    const slab = slabs[i]!,
      a = Math.max(start, slab.start),
      b = Math.min(end, slab.end),
      weight = (b - a) / (end - start);
    if (!(b > a)) continue;
    active = Math.max(active, slab.active);
    for (const p of slab.spans) {
      if (p.value === null) continue;
      const color = [
        rgb555LinearChannel(p.value >>> 10),
        rgb555LinearChannel((p.value >>> 5) & 31),
        rgb555LinearChannel(p.value & 31),
        1,
      ];
      for (const side of ['left', 'right'] as const) {
        const sign = side === 'left' ? 1 : -1;
        if (p[side] === null) {
          if (side === 'left') for (let c = 0; c < 4; c++) base[c]! += color[c]! * weight;
          continue;
        }
        const x0 = stripEdgeAt(p, side, a),
          x1 = stripEdgeAt(p, side, b),
          lo = Math.min(x0, x1),
          hi = Math.max(x0, x1);
        if (lo === hi) {
          const e = event(lo);
          for (let c = 0; c < 4; c++) e.value[c]! += sign * color[c]! * weight;
        } else {
          const l = event(lo),
            r = event(hi);
          for (let c = 0; c < 4; c++) {
            const slope = (sign * color[c]! * weight) / (hi - lo);
            l.slope[c]! += slope;
            r.slope[c]! -= slope;
          }
        }
      }
    }
  }
  const sorted = [...events.values()]
    .sort((a, b) => a.x - b.x)
    .filter((e) => e.value.some((v) => v !== 0) || e.slope.some((v) => v !== 0));
  if (
    base.some((v) => !Number.isFinite(v)) ||
    sorted.some(
      (e) =>
        !Number.isFinite(e.x) || e.value.some((v) => !Number.isFinite(v)) || e.slope.some((v) => !Number.isFinite(v)),
    )
  )
    throw new CourseInputError(
      'invalid_numeric_domain',
      path,
      'Strip lateral field coefficients must be finite and representable',
    );
  const key = JSON.stringify([base, sorted]);
  const data = new Float64Array(sorted.length * 9),
    values = [...base],
    slopes = [0, 0, 0, 0];
  let previous = sorted[0]?.x ?? 0;
  sorted.forEach((e, i) => {
    data[i * 9] = e.x;
    for (let c = 0; c < 4; c++) {
      values[c]! += slopes[c]! * (e.x - previous) + e.value[c]!;
      slopes[c]! += e.slope[c]!;
      data[i * 9 + 1 + c] = values[c]!;
      data[i * 9 + 5 + c] = slopes[c]!;
    }
    previous = e.x;
  });
  if (data.some((v) => !Number.isFinite(v)))
    throw new CourseInputError(
      'invalid_numeric_domain',
      path,
      'Strip lateral field integrals must be finite and representable',
    );
  // Outside all finite edges the field is constant. Remove accumulated cancellation in the final slope.
  if (sorted.length) for (let c = 0; c < 4; c++) data[(sorted.length - 1) * 9 + 5 + c] = 0;
  return { field: { base: Object.freeze(base), data, count: sorted.length }, active, key };
}

export interface StripGround {
  readonly kind: 'strips';
  readonly length: number;
  readonly slabs: readonly StripSlab[];
  readonly reader: StripGroundCellReader;
  readonly metrics: {
    readonly expandedStrips: number;
    readonly maxActiveStrips: number;
    readonly preblendCells: number;
    readonly lateralFields: number;
    readonly coefficientBytes: number;
    readonly directoryBytes: number;
  };
}

/** Caller-owned scratch; copying coefficients never exposes the compiled buffers. */
export interface StripCellTarget {
  base: number[];
  data: Float64Array;
  count: number;
  length: number;
  active: number;
}
export interface StripGroundCellReader {
  readonly levelCount: number;
  read(level: number, s: number, target: StripCellTarget): void;
}

/** Compile all s levels before driving. Storage is private; each renderer owns its sampling scratch. */
export function compileStripGround(length: number, pieces: readonly StripPiece[], path: string): StripGround {
  const slabs = resolveStripSlabs(length, pieces, null, path),
    levels: Level[] = [],
    lateralFields: StripLateralField[] = [],
    intern = new Map<string, number>();
  let cells = 0,
    coefficientBytes = 0,
    directoryBytes = 0;
  for (let step = STRIP_BASE_STEP; ; step *= 2) {
    const count = Math.ceil(length / step);
    cells += count;
    const indices = new Uint32Array(count),
      active = new Uint8Array(count);
    directoryBytes += indices.byteLength + active.byteLength;
    let slab = 0;
    for (let i = 0; i < count; i++) {
      const start = i * step,
        end = Math.min(length, (i + 1) * step);
      while (slab + 1 < slabs.length && slabs[slab]!.end <= start) slab++;
      const built = lateralFieldFor(slabs, slab, start, end, path);
      let index = intern.get(built.key);
      if (index === undefined) {
        index = lateralFields.length;
        intern.set(built.key, index);
        lateralFields.push(built.field);
        coefficientBytes += built.field.data.byteLength + 32;
        if (coefficientBytes > COURSE_DOCUMENT_LIMITS.coefficientBytes)
          throw new CourseInputError(
            'resource_limit',
            path,
            `Strip coefficient storage exceeds ${COURSE_DOCUMENT_LIMITS.coefficientBytes} bytes`,
          );
      }
      indices[i] = index;
      active[i] = built.active;
    }
    levels.push({ step, indices, active });
    if (count === 1) break;
  }
  const metrics = Object.freeze({
    expandedStrips: pieces.length,
    maxActiveStrips: slabs.reduce((max, s) => Math.max(max, s.active), 0),
    preblendCells: cells,
    lateralFields: lateralFields.length,
    coefficientBytes,
    directoryBytes,
  });
  const reader: StripGroundCellReader = Object.freeze({
    levelCount: levels.length,
    read(level: number, s: number, target: StripCellTarget) {
      const input = levels[level]!;
      const cell = Math.min(input.indices.length - 1, Math.floor(s / input.step));
      const field = lateralFields[input.indices[cell]!]!;
      const cellLength = Math.min(input.step, length - cell * input.step);
      target.length = cellLength;
      target.active = input.active[cell]!;
      target.count = field.count;
      for (let c = 0; c < 4; c++) target.base[c] = field.base[c]!;
      if (target.data.length < field.data.length)
        target.data = new Float64Array(2 ** Math.ceil(Math.log2(field.data.length)));
      target.data.set(field.data);
    },
  });
  return Object.freeze({ kind: 'strips' as const, length, slabs, metrics, reader });
}
