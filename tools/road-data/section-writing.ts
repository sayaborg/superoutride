/**
 * How the originals' Sections are written ([Original road data](../../docs/original-road-data.md#course-documents)):
 * knots simplified, sprites repeated, pictures raised, a road's plan as written and its Sections cut where their
 * coordinate domains would pass over themselves.
 */
import { requireInput } from '../course/authoring-io.js';
import type { CoursePath } from './course-path.js';
import { overlappingCells } from './crossings.js';

/** Within a Section, its coordinate domain is checked at least this far apart along the road and this close, metres. */
const DOMAIN_APART = 10;
const DOMAIN_MARGIN = 0.5;
/** A cut keeps this far from a gate, metres. */
const GATE_ROOM = 2;

const round = (value: number, step = 1e-6) => Number((Math.round(value / step) * step).toFixed(6));

/** Knots without repeats of a position, nor knots where the value neither starts nor stops changing. */
export function simplified(knots: readonly [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const knot of knots) {
    if (out.length && out.at(-1)![0] === knot[0]) continue;
    const [a, b] = [out.at(-2), out.at(-1)];
    if (a && b && (b[1] - a[1]) * (knot[0] - b[0]) === (knot[1] - b[1]) * (b[0] - a[0])) out.pop();
    out.push(knot);
  }
  return out;
}

/** Repeated sprites keep their stations to within this, metres: each occurrence is a micrometre-rounded station. */
const REPEAT_TOLERANCE = 2e-6;

/**
 * Sprite elements with each run of equal sprites without a body (all but `at`) at equal spacing written as one repeat
 * of its first: the original brings out a strip's pieces, and many objects, at a steady rate. An entry may be a unit,
 * sprites at one station (a board and its edge), repeated together. Runs are found in station order, each as long as it
 * keeps its spacing; the rest stay as they are, a body where its station is exactly.
 */
export function repeated<T extends { readonly at: { readonly offset: number }; readonly body: unknown }>(
  sprites: readonly (T | readonly T[])[],
) {
  const groups = new Map<string, (readonly T[])[]>();
  for (const [k, entry] of sprites.entries()) {
    const unit: readonly T[] = Array.isArray(entry) ? entry : [entry as T];
    const key = unit.every((s) => s.body === null)
      ? JSON.stringify(unit.map((s) => ({ ...s, at: null })))
      : `body ${k}`;
    groups.set(key, [...(groups.get(key) ?? []), unit]);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => a[0]!.at.offset - b[0]!.at.offset);
    const out: (T | { kind: 'repeat'; every: number; count: number; elements: T[] })[] = [];
    for (let i = 0; i < sorted.length;) {
      const first = sorted[i]!;
      const offset = (n: number) => sorted[n]![0]!.at.offset;
      const every = round((sorted[i + 1] ? offset(i + 1) : offset(i)) - offset(i));
      let count = 1;
      while (
        every > 0 &&
        i + count < sorted.length &&
        Math.abs(offset(i + count) - (offset(i) + count * every)) <= REPEAT_TOLERANCE
      )
        count++;
      out.push(...(count > 1 ? [{ kind: 'repeat' as const, every, count, elements: [...first] }] : first));
      i += count;
    }
    return out;
  });
}

/**
 * Sprite elements, each raised off the ground (a nonzero `groundOffset`) whose picture `split` names shown by that
 * picture's `-raised` image: a picture standing at its foot on the ground stands on its bottom edge raised off it
 * ([Original road data](../../docs/original-road-data.md#foot-shadows)).
 */
export function raisedSplit<T>(elements: readonly T[], split: ReadonlySet<string>): T[] {
  return elements.map((e) => {
    const element = e as { kind?: string; image?: string; groundOffset?: number; elements?: readonly unknown[] };
    if (element.kind === 'repeat') return { ...e, elements: raisedSplit(element.elements!, split) };
    return element.groundOffset && split.has(element.image!) ? { ...e, image: `${element.image}-raised` } : e;
  });
}

/**
 * Cuts of P's `[from, to]` (metres) so that no Section's coordinate domain, `reach` metres either side of P, passes over
 * itself: while two of its cells at least `DOMAIN_APART` apart overlap, the earliest later one with the latest earlier
 * one (with `once`, every pair whose earlier one lies before that later one, where one cut parts them all), it is cut
 * between them, at the middle of the longest straight there, else halfway, keeping clear of the gates (metres along
 * P).
 */
export function domainCuts(
  path: CoursePath,
  from: number,
  to: number,
  reach: number,
  gates: readonly number[],
  once = false,
): number[] {
  const step = 2.5;
  const pairs = overlappingCells(path, {
    from,
    to,
    step,
    sides: () => [reach, reach],
    apart: DOMAIN_APART,
    margin: DOMAIN_MARGIN,
  });
  if (!pairs.length) return [];
  const later = Math.min(...pairs.map(([, b]) => b));
  // With `once`, one cut parts every pair whose earlier cell lies before the earliest later cell, where one can; else
  // the earliest later cell's pairs are parted first.
  const latest = Math.max(...pairs.filter(([a]) => a < later).map(([a]) => a)) + step;
  const earlier =
    once && latest < later ? latest : Math.max(...pairs.filter(([, b]) => b === later).map(([a]) => a)) + step;
  const clear = (u: number) => gates.every((g) => Math.abs(g - u) > GATE_ROOM);
  const straights = path.elements
    .map((e) => ({ a: Math.max(e.start, earlier), b: Math.min(e.start + e.length, later), turn: e.turn }))
    .filter((e) => e.turn === 0 && e.b - e.a > 2 * GATE_ROOM && clear((e.a + e.b) / 2))
    .sort((x, y) => y.b - y.a - (x.b - x.a));
  let cut = straights.length ? (straights[0]!.a + straights[0]!.b) / 2 : (earlier + later) / 2;
  for (let d = 0; !clear(cut) && d < later - earlier; d += 0.5) cut = (earlier + later) / 2 + d;
  requireInput(cut > earlier && cut < later && clear(cut), '/plan', `No cut parts the road's passages at ${earlier} m`);
  return [...domainCuts(path, from, cut, reach, gates, once), cut, ...domainCuts(path, cut, to, reach, gates, once)];
}

/** A plan element as written. */
export interface WrittenElement {
  readonly kind: string;
  readonly id: string;
  readonly length: number;
  readonly radius?: number;
  readonly turn?: string;
}

/** A piece's plan: P's elements over it, on the plane, to the micrometre. */
export function writtenPlan(path: CoursePath, piece: { readonly from: number; readonly to: number }): WrittenElement[] {
  const elements: WrittenElement[] = [];
  for (const e of path.elements) {
    const [a, b] = [Math.max(e.start, piece.from), Math.min(e.start + e.length, piece.to)];
    if (b - a <= 1e-9) continue;
    const length = round(path.planeScale(e) * (b - a));
    const id = `${e.turn === 0 ? 's' : 'c'}${elements.length}`;
    if (e.turn === 0) elements.push({ kind: 'straight', id, length });
    else {
      const turn = (e.turn * (b - a)) / e.length;
      elements.push({
        kind: 'arc',
        id,
        length,
        radius: round(length / Math.abs(turn)),
        turn: turn > 0 ? 'left' : 'right',
      });
    }
  }
  return elements;
}
