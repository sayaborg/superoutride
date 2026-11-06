/**
 * FINAL LAP 2's road surface ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#its-road-surface)): its
 * picture's rows along the lap as Strips, each run of one color a Strip while it lasts, the part left of P by the left
 * edge line and the rest where it lies; where the road's width changes, the nearest level stretch's rows instead.
 */
import { romDiffers } from '../shared/conversion-errors.js';
import type { SurfacePart, SurfaceStrip } from '../shared/road-surface.js';
import { laneLateral, micrometre } from '../shared/section-writing.js';
import { LAP_UNITS, STEP_UNITS } from './final-lap-2-road.js';

/** A block of the road picture's steps, the slave's 0x1400's group of 32: its rows' patterns repeat by it. */
const BLOCK_UNITS = 32 * STEP_UNITS;
/** A pattern repeated: so many of its times at one spacing at least. */
const REPEATED = 3;

/** A run of one color along the lap: its side, its columns (the left side's from its row's left edge line), its color. */
interface Run {
  readonly key: string;
  readonly side: 'left' | 'right';
  readonly from: number;
  readonly to: number;
  readonly color: number;
  readonly outer: boolean;
}

/**
 * The surface of a course's road from its picture (`pictureRows`): its rows (`rows`, `ids` a unit), its left edge
 * line's column at each step (`edges`), the column of P (`centre`), a column's width (`metres`), and where a unit lies
 * on the lap as laid (`station`, its length `length`).
 *
 * - **Where the width changes.** A step whose left edge line stands where neither neighbour's does lies where the road
 *   narrows or widens; its rows' part left of P is the nearest level step's, a whole number of blocks away
 *   (`BLOCK_UNITS`), its patterns' place kept, moved with the edge.
 * - **Runs.** Each row's runs of one color, those left of P (cut there) by its left edge line, the rest where they
 *   lie; a run lasts while the rows draw it so, from the unit it begins to the unit it ends.
 * - **Laid.** A run is a Strip of its color, left of P by lane a's left (the left edge line), the picture's first
 *   column where it is drawn, the rest at its laterals. One recurring at one spacing `REPEATED` times or more lies over
 *   the stretch from its first time's curve table position to its last's end, its times at their phase counted from
 *   the line, its length and spacing kept (a unit the lap's length over its units), the stretch's ends cut; any other
 *   lies from its curve table position to the next. Repeats of one side, spacing and count whose first times begin
 *   within a spacing of each other are one pattern; the left side's are drawn first.
 */
export function finalLap2Surface(options: {
  readonly rows: readonly (readonly number[])[];
  readonly ids: Uint32Array;
  readonly edges: readonly number[];
  readonly centre: number;
  readonly metres: number;
  readonly line: number;
  readonly station: (u: number) => number;
  readonly length: number;
}): SurfaceStrip[] {
  const { rows, ids, edges, centre, metres, line, station, length } = options;
  const steps = LAP_UNITS / STEP_UNITS;
  const split = Math.floor(centre);
  const edge = (s: number) => edges[((s % steps) + steps) % steps]!;
  const level = (s: number) => edge(s) === edge(s - 1) || edge(s) === edge(s + 1);
  // Each unit's row for its part left of P: its own, or where the width changes the nearest level step's.
  const blocks = LAP_UNITS / BLOCK_UNITS;
  const source = (u: number) => {
    const s = Math.floor(u / STEP_UNITS);
    if (level(s)) return u;
    for (let k = 1; k < blocks; k++)
      for (const v of [u - k * BLOCK_UNITS, u + k * BLOCK_UNITS])
        if (level(Math.floor((((v % LAP_UNITS) + LAP_UNITS) % LAP_UNITS) / STEP_UNITS)))
          return ((v % LAP_UNITS) + LAP_UNITS) % LAP_UNITS;
    throw romDiffers('A road picture has no level step');
  };
  const runsOf = (left: number, right: number) => {
    const runs: Run[] = [];
    const add = (colors: readonly number[], from: number, to: number, side: Run['side'], shift: number) => {
      for (let x = from; x < to;) {
        let end = x + 1;
        while (end < to && colors[end] === colors[x]) end++;
        // The picture's first column stays where it is drawn, the edge line moving or not.
        const outer = x === 0;
        const run = { side, from: x - shift, to: end - shift, color: colors[x]!, outer };
        runs.push({ ...run, key: `${side} ${outer ? 'outer' : run.from} ${run.to} ${run.color}` });
        x = end;
      }
    };
    const s = Math.floor(left / STEP_UNITS);
    add(rows[ids[left]!]!, 0, split, 'left', edge(s));
    add(rows[ids[right]!]!, split, rows[ids[right]!]!.length, 'right', 0);
    return runs;
  };
  // Each run as long as it lasts, cut at the line.
  const lasting: { run: Run; from: number; to: number }[] = [];
  const open = new Map<string, { run: Run; from: number }>();
  let last = '';
  const close = (key: string, u: number) => {
    const { run, from } = open.get(key)!;
    open.delete(key);
    if (from < line && u > line) lasting.push({ run, from, to: line }, { run, from: line, to: u });
    else lasting.push({ run, from, to: u });
  };
  for (let u = 0; u < LAP_UNITS; u++) {
    const left = source(u);
    const now = `${ids[left]} ${edge(Math.floor(left / STEP_UNITS))} ${ids[u]}`;
    if (now === last) continue;
    last = now;
    const runs = runsOf(left, u);
    const keys = new Set(runs.map((r) => r.key));
    for (const key of [...open.keys()]) if (!keys.has(key)) close(key, u);
    for (const run of runs) if (!open.has(run.key)) open.set(run.key, { run, from: u });
  }
  for (const key of [...open.keys()]) close(key, LAP_UNITS);
  // Where a unit lies on the lap (the table's end its start), a run's end at the line the lap's end.
  const at = (u: number, end: boolean) => (end && u === line ? length : station(u % LAP_UNITS));
  const unit = length / LAP_UNITS;
  const lateral = (run: Run, column: number) =>
    run.side === 'left' ? laneLateral('a', 'left', column * metres) : micrometre((column - centre) * metres);
  const part = (run: Run, from: number, to: number): SurfacePart => ({
    from,
    to,
    left: run.outer ? micrometre(-centre * metres) : lateral(run, run.from),
    right: lateral(run, run.to),
    color: run.color,
  });
  // The runs of one key and length in turn: those recurring at one spacing a repeat, the others each alone.
  const groups = new Map<string, { run: Run; from: number; to: number }[]>();
  for (const l of lasting) {
    const key = `${l.run.key} ${l.to - l.from}`;
    const group = groups.get(key);
    if (group) group.push(l);
    else groups.set(key, [l]);
  }
  const alone: { side: Run['side']; strip: SurfaceStrip }[] = [];
  const repeats = new Map<string, { side: Run['side']; every: number; count: number; part: SurfacePart }[]>();
  const single = (run: Run, from: number, to: number) => {
    if (to - from > 1e-6) alone.push({ side: run.side, strip: { parts: [part(run, from, to)], every: 0, count: 1 } });
  };
  /**
   * A run recurring `count` times `spacing` units apart from unit `u`, `size` units each, over the stretch from its first
   * time's curve table position to its last's end: its times at their phase counted from the line in the lap's mean
   * units, its length and spacing kept (Places and patterns), the stretch's ends cut.
   */
  const recurring = (run: Run, u: number, spacing: number, count: number, size: number) => {
    const [a, b] = [at(u, false), at(u + (count - 1) * spacing + size, true)];
    const [every, span] = [micrometre(spacing * unit), size * unit];
    const phase = ((((u - line) % spacing) + spacing) % spacing) * unit;
    const first = phase + Math.ceil((a - phase) / every - 1e-9) * every;
    const times = Math.max(0, Math.floor((b - first - span) / every + 1e-9) + 1);
    single(run, a, Math.min(b, first - every + span));
    if (times >= 2) {
      const key = `${run.side} ${every} ${times}`;
      const entry = { side: run.side, every, count: times, part: part(run, first, first + span) };
      const same = repeats.get(key);
      if (same) same.push(entry);
      else repeats.set(key, [entry]);
    } else if (times === 1) single(run, first, first + span);
    const after = first + times * every;
    single(run, Math.max(a, after), Math.min(b, after + span));
  };
  for (const group of groups.values()) {
    group.sort((a, b) => a.from - b.from);
    for (let i = 0; i < group.length;) {
      const spacing = i + 1 < group.length ? group[i + 1]!.from - group[i]!.from : 0;
      let j = i;
      // One recurring: its times at one spacing, on one side of the line.
      while (
        j + 1 < group.length &&
        group[j + 1]!.from - group[j]!.from === spacing &&
        group[j + 1]!.from < line === group[i]!.from < line
      )
        j++;
      const { run, from, to } = group[i]!;
      if (j - i + 1 >= REPEATED) {
        recurring(run, from, spacing, j - i + 1, to - from);
        i = j + 1;
      } else {
        single(run, at(from, false), at(to, true));
        i += 1;
      }
    }
  }
  // Repeats of one spacing and count whose first times begin within one spacing of each other: one pattern.
  const patterns: { side: Run['side']; strip: SurfaceStrip }[] = [];
  for (const same of repeats.values()) {
    same.sort((a, b) => a.part.from - b.part.from);
    for (let i = 0; i < same.length;) {
      let j = i;
      while (j + 1 < same.length && same[j + 1]!.part.from - same[i]!.part.from < same[i]!.every) j++;
      const { side, every, count } = same[i]!;
      patterns.push({ side, strip: { parts: same.slice(i, j + 1).map((e) => e.part), every, count } });
      i = j + 1;
    }
  }
  // Left of P first, so that the right part lies over where they meet.
  return [...patterns, ...alone]
    .sort((a, b) => (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1))
    .map((e) => e.strip);
}
