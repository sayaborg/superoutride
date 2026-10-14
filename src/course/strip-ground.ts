import type { StripBudget } from './strip-budget.js';
import { CourseInputError } from './course-diagnostics.js';
import { COURSE_DOCUMENT_LIMITS } from './course-limits.js';
import { rgb555LinearChannel } from '../image/image-filter.js';
import { resolveStripSlabs, stripEdgeAt, type StripPiece, type StripSlab } from './strip-slabs.js';
import { UNSLICED, type WorkSlices } from '../core/work-slices.js';

export const STRIP_ACTIVE_LIMIT = COURSE_DOCUMENT_LIMITS.activeStrips;
/** Smallest cached interval in metres. */
export const STRIP_BASE_STEP = 1;

/**
 * A Section's resolved color slabs, packed: slab `i` spans `[stations[i], stations[i + 1])` with `active[i]` active
 * Strips, and its spans, left to right, are `firstSpan[i]` up to `firstSpan[i + 1]`. Each span has its color (`-1`
 * transparent) and, after its slab's first span, its left edge's laterals at its slab's start and end (`edges`, two per
 * span), the right edge of the span before it; a slab's first span is open to the left and its last to the right.
 */
interface PackedSlabs {
  readonly count: number;
  readonly stations: Float64Array;
  readonly active: Uint8Array;
  readonly firstSpan: Uint32Array;
  readonly colors: Int32Array;
  readonly edges: Float64Array;
}

function packSlabs(slabs: readonly StripSlab[]): PackedSlabs {
  const spans = slabs.reduce((sum, slab) => sum + slab.spans.length, 0);
  const packed = {
    count: slabs.length,
    stations: new Float64Array(slabs.length + 1),
    active: new Uint8Array(slabs.length),
    firstSpan: new Uint32Array(slabs.length + 1),
    colors: new Int32Array(spans),
    edges: new Float64Array(2 * spans),
  };
  let span = 0;
  slabs.forEach((slab, i) => {
    packed.stations[i] = slab.start;
    packed.active[i] = slab.active;
    packed.firstSpan[i] = span;
    slab.spans.forEach((piece, k) => {
      packed.colors[span] = piece.value ?? -1;
      if (k > 0) {
        packed.edges[2 * span] = stripEdgeAt(piece, 'left', slab.start);
        packed.edges[2 * span + 1] = stripEdgeAt(piece, 'left', slab.end);
      }
      span++;
    });
  });
  packed.stations[slabs.length] = slabs.at(-1)?.end ?? 0;
  packed.firstSpan[slabs.length] = span;
  return packed;
}

/** The left edge of `span` in `slab` at station `s`: affine over the slab, exact at its ends. */
function edgeAt(packed: PackedSlabs, slab: number, span: number, s: number): number {
  const a = packed.stations[slab]!,
    b = packed.stations[slab + 1]!,
    from = packed.edges[2 * span]!,
    to = packed.edges[2 * span + 1]!;
  return s === a ? from : s === b ? to : from + (to - from) * ((s - a) / (b - a));
}

/** The slab owning `s`: half-open, the last also owning the Section's end. */
function slabAt(packed: PackedSlabs, s: number): number {
  let lo = 0,
    hi = packed.count;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (packed.stations[mid]! <= s) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

/**
 * The distinct lateral fields packed in one buffer: field `i`'s base (4 values), then its `counts[i]` nodes of 9 values
 * (x, premultiplied linear R/G/B/coverage, then their lateral slopes), from `offsets[i]`. Private owned storage.
 */
interface PackedFields {
  readonly offsets: Uint32Array;
  readonly counts: Uint32Array;
  readonly data: Float64Array;
}
/** A level's cells: cell `i` spans `[i*step, (i+1)*step)`, the last clipped to `length`; each names its field. */
interface Level {
  readonly step: number;
  readonly indices: Uint32Array;
  readonly active: Uint8Array;
}
/**
 * A lateral field while compiling: its base and its events in ascending x, each `x`, then the jumps of the premultiplied
 * linear R/G/B/coverage there, then the changes of their lateral slopes (9 values per event).
 */
interface FieldDraft {
  readonly base: readonly number[];
  readonly events: Float64Array;
  readonly count: number;
}
const EVENT = 9;

/** A color's premultiplied linear R/G/B and coverage, by RGB555 value. */
const linearColors = new Map<number, readonly number[]>();
function linearColor(value: number): readonly number[] {
  let color = linearColors.get(value);
  if (!color) {
    color = Object.freeze([
      rgb555LinearChannel(value >>> 10),
      rgb555LinearChannel((value >>> 5) & 31),
      rgb555LinearChannel(value & 31),
      1,
    ]);
    linearColors.set(value, color);
  }
  return color;
}

/**
 * Relative size below which an event's summed jumps and slope changes are rounding residue of contributions that
 * cancel (such as the two halves of one moving edge's ramp meeting where two slabs or cells meet); such a channel is
 * zero, and an event with every channel zero is dropped.
 */
const CANCELLED_EVENT = 1e-9;

/** Values a lateral field's event accumulates while integrating: `x`, its 8 channels, then their magnitudes. */
const ACCUMULATED = 2 * EVENT - 1;

/** Integrating an affine edge over s yields a lateral ramp, not a relocated hard edge. */
function lateralFieldFor(
  slabs: PackedSlabs,
  first: number,
  start: number,
  end: number,
  scratch: { records: Float64Array },
): { field: FieldDraft; active: number } {
  const base = [0, 0, 0, 0],
    // Each event's record: its x, its channels' sums and the sums of their contributions' magnitudes.
    events = new Map<number, number>();
  let active = 0;
  const event = (x: number) => {
    let at = events.get(x);
    if (at === undefined) {
      at = events.size * ACCUMULATED;
      if (at + ACCUMULATED > scratch.records.length) {
        const grown = new Float64Array(2 * scratch.records.length);
        grown.set(scratch.records);
        scratch.records = grown;
      }
      scratch.records.fill(0, at, at + ACCUMULATED);
      scratch.records[at] = x;
      events.set(x, at);
    }
    return at;
  };
  // An edge of `span` (its left edge, or the left edge of the span after it for its right) from `a` to `b`, signed.
  const edge = (slab: number, span: number, a: number, b: number, color: readonly number[], weight: number) => {
    const x0 = edgeAt(slabs, slab, span, a),
      x1 = edgeAt(slabs, slab, span, b),
      lo = Math.min(x0, x1),
      hi = Math.max(x0, x1);
    if (lo === hi) {
      const e = event(lo),
        records = scratch.records;
      for (let c = 0; c < 4; c++) {
        const value = color[c]! * weight;
        records[e + 1 + c]! += value;
        records[e + EVENT + c]! += Math.abs(value);
      }
    } else {
      const l = event(lo),
        r = event(hi),
        records = scratch.records;
      for (let c = 0; c < 4; c++) {
        const slope = (color[c]! * weight) / (hi - lo);
        records[l + 5 + c]! += slope;
        records[l + EVENT + 4 + c]! += Math.abs(slope);
        records[r + 5 + c]! -= slope;
        records[r + EVENT + 4 + c]! += Math.abs(slope);
      }
    }
  };
  const negative = [0, 0, 0, 0];
  for (let i = first; i < slabs.count && slabs.stations[i]! < end; i++) {
    const a = Math.max(start, slabs.stations[i]!),
      b = Math.min(end, slabs.stations[i + 1]!),
      weight = (b - a) / (end - start);
    if (!(b > a)) continue;
    active = Math.max(active, slabs.active[i]!);
    const firstSpan = slabs.firstSpan[i]!,
      lastSpan = slabs.firstSpan[i + 1]! - 1;
    for (let span = firstSpan; span <= lastSpan; span++) {
      const value = slabs.colors[span]!;
      if (value < 0) continue;
      const color = linearColor(value);
      if (span === firstSpan) for (let c = 0; c < 4; c++) base[c]! += color[c]! * weight;
      else edge(i, span, a, b, color, weight);
      if (span < lastSpan) {
        for (let c = 0; c < 4; c++) negative[c] = -color[c]!;
        edge(i, span + 1, a, b, negative, weight);
      }
    }
  }
  const records = scratch.records,
    sorted = [...events.values()].sort((a, b) => records[a]! - records[b]!);
  const data = new Float64Array(sorted.length * EVENT);
  let count = 0;
  for (const e of sorted) {
    const at = count * EVENT;
    let kept = false;
    data[at] = records[e]!;
    for (let c = 1; c < EVENT; c++)
      if (Math.abs(records[e + c]!) > CANCELLED_EVENT * records[e + EVENT - 1 + c]!) {
        data[at + c] = records[e + c]!;
        kept = true;
      } else data[at + c] = 0;
    if (kept) count++;
  }
  return { field: { base, events: data.slice(0, count * EVENT), count }, active };
}

/**
 * The field averaging `a` over `wa` and `b` over `wb` (weights summing to one): its base and each event's jumps and
 * slope changes weighted, events at an equal x summed, as averaging their cells' Strips directly integrates them.
 */
function averageFields(a: FieldDraft, wa: number, b: FieldDraft, wb: number): FieldDraft {
  const base = [0, 1, 2, 3].map((c) => a.base[c]! * wa + b.base[c]! * wb);
  const events = new Float64Array((a.count + b.count) * EVENT),
    ea = a.events,
    eb = b.events;
  let i = 0,
    j = 0,
    count = 0;
  while (i < a.count || j < b.count) {
    const xa = i < a.count ? ea[i * EVENT]! : Infinity,
      xb = j < b.count ? eb[j * EVENT]! : Infinity,
      at = count * EVENT;
    let kept = false;
    if (xa < xb || xb < xa) {
      const [source, index, weight] = xa < xb ? [ea, i++, wa] : [eb, j++, wb];
      events[at] = source[index * EVENT]!;
      for (let c = 1; c < EVENT; c++) events[at + c] = source[index * EVENT + c]! * weight;
      kept = true;
    } else {
      events[at] = xa;
      for (let c = 1; c < EVENT; c++) {
        const p = ea[i * EVENT + c]! * wa,
          q = eb[j * EVENT + c]! * wb,
          sum = p + q;
        if (Math.abs(sum) > CANCELLED_EVENT * (Math.abs(p) + Math.abs(q))) {
          events[at + c] = sum;
          kept = true;
        } else events[at + c] = 0;
      }
      i++;
      j++;
    }
    if (kept) count++;
  }
  return { base, events: events.subarray(0, count * EVENT), count };
}

/**
 * Write a field's coefficients to `data` from `at`: its base, then each event's `x`, the R/G/B/coverage there and their
 * lateral slopes.
 */
function writeFieldCoefficients(field: FieldDraft, path: string, data: Float64Array, at: number) {
  const { base, events, count } = field;
  const values = [...base],
    slopes = [0, 0, 0, 0];
  let previous = count ? events[0]! : 0;
  for (let c = 0; c < 4; c++) data[at + c] = base[c]!;
  const nodes = at + 4;
  for (let i = 0; i < count; i++) {
    const x = events[i * EVENT]!;
    data[nodes + i * EVENT] = x;
    for (let c = 0; c < 4; c++) {
      values[c]! += slopes[c]! * (x - previous) + events[i * EVENT + 1 + c]!;
      slopes[c]! += events[i * EVENT + 5 + c]!;
      data[nodes + i * EVENT + 1 + c] = values[c]!;
      data[nodes + i * EVENT + 5 + c] = slopes[c]!;
    }
    previous = x;
  }
  if (base.some((v) => !Number.isFinite(v)) || events.some((v) => !Number.isFinite(v)))
    throw new CourseInputError(
      'invalid_numeric_domain',
      path,
      'Strip lateral field coefficients must be finite and representable',
    );
  for (let i = nodes; i < nodes + count * EVENT; i++)
    if (!Number.isFinite(data[i]!))
      throw new CourseInputError(
        'invalid_numeric_domain',
        path,
        'Strip lateral field integrals must be finite and representable',
      );
  // Outside all finite edges the field is constant. Remove accumulated cancellation in the final slope.
  if (count) for (let c = 0; c < 4; c++) data[nodes + (count - 1) * EVENT + 5 + c] = 0;
}

/** Equal fields' storage, shared: each distinct field's index in order of first appearance. */
function createFieldIntern() {
  const fields: FieldDraft[] = [],
    buckets = new Map<number, number[]>(),
    bits = new Float64Array(1),
    words = new Uint32Array(bits.buffer);
  const hash = (field: FieldDraft) => {
    let h = 0x811c9dc5;
    const mix = (value: number) => {
      // -0 equals 0, as in the field's meaning.
      bits[0] = value + 0;
      h = Math.imul(h ^ words[0]!, 0x01000193);
      h = Math.imul(h ^ words[1]!, 0x01000193);
    };
    field.base.forEach(mix);
    for (let i = 0; i < field.count * EVENT; i++) mix(field.events[i]!);
    return h >>> 0;
  };
  const equal = (a: FieldDraft, b: FieldDraft) =>
    a.count === b.count && a.base.every((v, c) => v === b.base[c]) && a.events.every((v, i) => v === b.events[i]);
  return {
    fields,
    /** The index of `field`'s storage and whether it is new. */
    intern(field: FieldDraft): { index: number; added: boolean } {
      const key = hash(field);
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, (bucket = []));
      for (const index of bucket) if (equal(fields[index]!, field)) return { index, added: false };
      bucket.push(fields.length);
      fields.push(field);
      return { index: fields.length - 1, added: true };
    },
  };
}

export interface StripGround {
  readonly length: number;
  /** The least and greatest laterals its colored spans reach over its length (Infinity and -Infinity for none). */
  readonly coverage: Readonly<{ left: number; right: number }>;
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
  active: number;
}
export interface StripGroundCellReader {
  readonly levelCount: number;
  /**
   * The instantaneous resolved Strips at `s`, following the resolved span order without preblending or sorting: the
   * first span's color as the base, then one node at each later span's left edge with that span's color and no slope.
   */
  readInstant(s: number, target: StripCellTarget): void;
  /** The cell of `level` containing `s`. */
  read(level: number, s: number, target: StripCellTarget): void;
}

/**
 * The dyadic levels and their distinct fields. Level 0's cells integrate the slabs; each coarser cell averages the two
 * cells of the level below that it spans, weighted by their actual extents, which equals integrating its slabs
 * directly.
 */
async function compileLevels(
  length: number,
  slabs: PackedSlabs,
  path: string,
  budget: StripBudget,
  slices: WorkSlices,
) {
  const levels: Level[] = [],
    { fields, intern } = createFieldIntern();
  let cells = 0,
    coefficientBytes = 0,
    directoryBytes = 0;
  const extent = (step: number, i: number) => Math.min(length, (i + 1) * step) - i * step;
  // Each level's cells average over their actual extent; equal lateral fields share storage across levels.
  const level = async (
    step: number,
    build: (
      start: number,
      end: number,
      i: number,
    ) => { index: number; active: number } | (FieldDraft & { active: number }),
  ): Promise<Level> => {
    const count = Math.ceil(length / step);
    cells += count;
    budget.spend('preblendCells', count, path, "The Section's Strip preblend cells");
    const indices = new Uint32Array(count),
      active = new Uint8Array(count);
    directoryBytes += indices.byteLength + active.byteLength;
    for (let i = 0; i < count; i++) {
      if (slices.due()) await slices.pause();
      const built = build(i * step, Math.min(length, (i + 1) * step), i);
      let index: number;
      if ('index' in built) index = built.index;
      else {
        const interned = intern(built);
        index = interned.index;
        if (interned.added) {
          const bytes = built.count * EVENT * 8 + 32;
          coefficientBytes += bytes;
          budget.spend('coefficientBytes', bytes, path, "The Section's Strip coefficient bytes");
        }
      }
      indices[i] = index;
      active[i] = built.active;
    }
    return { step, indices, active };
  };
  let slab = 0;
  const scratch = { records: new Float64Array(64 * ACCUMULATED) };
  const integrated = (start: number, end: number) => {
    while (slab + 1 < slabs.count && slabs.stations[slab + 1]! <= start) slab++;
    const { field, active } = lateralFieldFor(slabs, slab, start, end, scratch);
    return { ...field, active };
  };
  // The cell spanning cells `i` and `i + 1` of the finer level `below`, the second absent past its end.
  const averaged = (below: Level, i: number) => {
    const first = i,
      second = i + 1 < below.indices.length ? i + 1 : null;
    if (second === null || below.indices[first] === below.indices[second])
      return {
        index: below.indices[first]!,
        active: second === null ? below.active[first]! : Math.max(below.active[first]!, below.active[second]!),
      };
    const wa = extent(below.step, first),
      wb = extent(below.step, second),
      total = wa + wb;
    const field = averageFields(
      fields[below.indices[first]!]!,
      wa / total,
      fields[below.indices[second]!]!,
      wb / total,
    );
    return { ...field, active: Math.max(below.active[first]!, below.active[second]!) };
  };
  for (let step = STRIP_BASE_STEP; ; step *= 2) {
    const below = levels.at(-1);
    const built = await level(step, below ? (_start, _end, i) => averaged(below, 2 * i) : integrated);
    levels.push(built);
    if (built.indices.length === 1) break;
  }
  const offsets = new Uint32Array(fields.length),
    counts = new Uint32Array(fields.length);
  let size = 0;
  fields.forEach((field, i) => {
    offsets[i] = size;
    counts[i] = field.count;
    size += 4 + field.count * EVENT;
  });
  const data = new Float64Array(size);
  for (const [i, field] of fields.entries()) {
    if (slices.due()) await slices.pause();
    writeFieldCoefficients(field, path, data, offsets[i]!);
  }
  return {
    levels,
    lateralFields: { offsets, counts, data } satisfies PackedFields,
    cells,
    coefficientBytes,
    directoryBytes,
  };
}

/**
 * Compile all s levels before driving. Storage is private; each renderer owns its sampling scratch. The work pauses
 * between cells when `slices` is due.
 */
export async function compileStripGround(
  length: number,
  pieces: readonly StripPiece[],
  path: string,
  budget: StripBudget,
  slices: WorkSlices = UNSLICED,
): Promise<StripGround> {
  const slabs = packSlabs(await resolveStripSlabs(length, pieces, null, path, budget, slices));
  const { levels, lateralFields, cells, coefficientBytes, directoryBytes } = await compileLevels(
    length,
    slabs,
    path,
    budget,
    slices,
  );
  const metrics = Object.freeze({
    expandedStrips: pieces.length,
    maxActiveStrips: slabs.active.reduce((max, active) => Math.max(max, active), 0),
    preblendCells: cells,
    lateralFields: lateralFields.counts.length,
    coefficientBytes,
    directoryBytes,
  });
  let left = Infinity,
    right = -Infinity;
  for (let i = 0; i < slabs.count; i++)
    for (let span = slabs.firstSpan[i]!; span < slabs.firstSpan[i + 1]!; span++)
      if (slabs.colors[span]! >= 0)
        for (const s of [slabs.stations[i]!, slabs.stations[i + 1]!]) {
          left = Math.min(left, span === slabs.firstSpan[i] ? -Infinity : edgeAt(slabs, i, span, s));
          right = Math.max(right, span + 1 === slabs.firstSpan[i + 1] ? Infinity : edgeAt(slabs, i, span + 1, s));
        }
  const coverage = Object.freeze({ left, right });
  // Copy `count` nodes of 9 values and a base into the caller's scratch, growing it to a power of two when it is short.
  const reserve = (target: StripCellTarget, count: number) => {
    if (target.data.length < count * EVENT) target.data = new Float64Array(2 ** Math.ceil(Math.log2(count * EVENT)));
  };
  // A level's cell containing s (the final closed endpoint uses the last cell), as a number so reading allocates nothing.
  const cellAt = (input: Level, s: number) => Math.min(input.indices.length - 1, Math.floor(s / input.step));
  const copy = (input: Level, cell: number, target: StripCellTarget) => {
    const field = input.indices[cell]!,
      { data } = lateralFields,
      at = lateralFields.offsets[field]!,
      count = lateralFields.counts[field]!;
    target.active = input.active[cell]!;
    target.count = count;
    for (let c = 0; c < 4; c++) target.base[c] = data[at + c]!;
    reserve(target, count);
    for (let i = 0; i < count * EVENT; i++) target.data[i] = data[at + 4 + i]!;
  };
  const writeColor = (value: number, out: number[] | Float64Array, at: number) => {
    const color = value < 0 ? null : linearColor(value);
    for (let c = 0; c < 4; c++) out[at + c] = color === null ? 0 : color[c]!;
  };
  const reader: StripGroundCellReader = Object.freeze({
    levelCount: levels.length,
    readInstant(s: number, target: StripCellTarget) {
      const slab = slabAt(slabs, s),
        first = slabs.firstSpan[slab]!,
        count = slabs.firstSpan[slab + 1]! - first - 1;
      target.active = slabs.active[slab]!;
      target.count = count;
      reserve(target, count);
      writeColor(slabs.colors[first]!, target.base, 0);
      for (let k = 0; k < count; k++) {
        const span = first + 1 + k,
          at = k * EVENT;
        target.data[at] = edgeAt(slabs, slab, span, s);
        writeColor(slabs.colors[span]!, target.data, at + 1);
        target.data.fill(0, at + 5, at + 9);
      }
    },
    read(level: number, s: number, target: StripCellTarget) {
      const input = levels[level]!;
      copy(input, cellAt(input, s), target);
    },
  });
  return Object.freeze({ length, coverage, metrics, reader });
}
