/**
 * The grades' rule's solve ([Original road data](../../../docs/original-road-data.md#profile-from-the-originals-screen),
 * Solve and PVIs): a piece's grades on its cells' borders, free within `GRADE_LIMIT` over its stretch and 0 at its ends,
 * solved from level by the box minimiser (`minimiseInBox`); then its vertical curves taken away one move at a time to
 * one, solved again after each; the piece the fewest within half a row of the best look.
 */
import { minimiseInBox } from './box-minimiser.js';
import { GRADE_LIMIT, PVI_ROWS, LOOK_PLACES } from './shared-constants.js';
import type { Measure } from './screen-measure.js';

/** The solve's tolerances and limits: the first solve's iterations and each later one's, evaluations twice these. */
const FIRST_ITERATIONS = 3000;
const LATER_ITERATIONS = 300;
const COST_TOLERANCE = 1e-13;
const GRADIENT_TOLERANCE = 1e-9;
const MEMORY = 30;
/** The moves' weighing: the Gauss–Newton matrix's ridge, relative to its mean diagonal. */
const RIDGE = 1e-9;

/** A run of cells [from, to]: a vertical curve (its grade linear along it) or a straight (one grade). */
export interface Element {
  readonly from: number;
  readonly to: number;
  readonly curve: boolean;
}

/** A solved piece on the way: its vertical curves, its look, its grades on the piece's borders and its elements. */
export interface Solved {
  readonly curves: number;
  readonly look: number;
  readonly grades: Float64Array;
  readonly elements: readonly Element[];
}

/** A dense matrix's product with a vector, and its transpose's. */
const times = (m: readonly Float64Array[], v: ArrayLike<number>) =>
  Float64Array.from(m, (row) => row.reduce((s, x, j) => s + x * v[j]!, 0));
const timesTransposed = (m: readonly Float64Array[], v: ArrayLike<number>, columns: number) => {
  const out = new Float64Array(columns);
  m.forEach((row, i) => row.forEach((x, j) => (out[j]! += x * v[i]!)));
  return out;
};

/**
 * The free grades of a chain of elements over `borders` + 1 borders: a straight ties its ends' grades into one group;
 * the groups holding the first and last borders are 0; the rest are the unknowns, `columns` of them. `roots` names each
 * knot's group, `column` each free group's unknown, and `map` gives every border's grade from the unknowns.
 */
function structure(elements: readonly Element[], borders: number) {
  const knots = [elements[0]!.from, ...elements.map((e) => e.to)];
  const group = knots.map((_, i) => i);
  const find = (i: number): number => {
    while (group[i] !== i) i = group[i] = group[group[i]!]!;
    return i;
  };
  elements.forEach((e, k) => {
    if (e.curve) return;
    const a = find(k),
      b = find(k + 1);
    group[Math.max(a, b)] = Math.min(a, b);
  });
  const roots = knots.map((_, i) => find(i));
  const fixed = new Set([roots[0]!, roots.at(-1)!]);
  const free = [...new Set(roots)].filter((r) => !fixed.has(r)).sort((a, b) => a - b);
  const column = new Map(free.map((r, c) => [r, c]));
  const map = Array.from({ length: borders + 1 }, () => new Float64Array(free.length));
  elements.forEach((e, k) => {
    const ra = roots[k]!,
      rb = roots[k + 1]!;
    for (let j = e.from; j <= e.to; j++) {
      if (j === e.to && k + 1 < elements.length) continue;
      const [wa, wb] = e.curve ? [(e.to - j) / (e.to - e.from), (j - e.from) / (e.to - e.from)] : [1, 0];
      for (const [r, w] of [
        [ra, wa],
        [rb, wb],
      ] as const)
        if (w && column.has(r)) map[j]![column.get(r)!]! += w;
    }
  });
  return { knots, roots, column, map, columns: free.length };
}

/** The unknowns from grades: each free group's mean grade at its knots. */
function unknownsFrom(g: Float64Array, s: ReturnType<typeof structure>): Float64Array {
  const sums = new Float64Array(s.columns),
    counts = new Float64Array(s.columns);
  s.roots.forEach((r, i) => {
    const c = s.column.get(r);
    if (c === undefined) return;
    sums[c]! += g[s.knots[i]!]!;
    counts[c]! += 1;
  });
  return sums.map((sum, c) => sum / counts[c]!);
}

/** A piece's borders laid on the measure's: `tile` maps them (identity where absent). */
type Tile = (pieceGrades: Float64Array) => Float64Array;

/** The unknowns solved within the limit from `v`, by the measure's cost through `map` and `tile`. */
function solveUnknowns(
  measure: Measure,
  v: Float64Array,
  map: readonly Float64Array[],
  columns: number,
  tile: Tile,
  tileTransposed: Tile,
  iterations: number,
): Float64Array {
  if (!columns) return new Float64Array(0);
  return minimiseInBox(
    (x) => {
      const { cost, gradient } = measure.cost(tile(times(map, x)));
      return { cost, gradient: timesTransposed(map, tileTransposed(gradient), columns) };
    },
    v,
    {
      lower: -GRADE_LIMIT,
      upper: GRADE_LIMIT,
      iterations,
      evaluations: 2 * iterations,
      costTolerance: COST_TOLERANCE,
      gradientTolerance: GRADIENT_TOLERANCE,
      memory: MEMORY,
    },
  );
}

/**
 * The one move the linearised fit says costs least: (L v)² / (L P Lᵀ), L the move's condition on the unknowns and
 * P = (JᵀJ + ridge)⁻¹. A vertical curve made straight, or two touching ones made one; of equal values the earlier, a
 * straight before a join; none weighable, the first curve made straight.
 */
function reduceOne(
  measure: Measure,
  elements: readonly Element[],
  v: Float64Array,
  s: ReturnType<typeof structure>,
  tile: Tile,
): Element[] {
  const g = tile(times(s.map, v));
  const H = measure.gaussNewton(g);
  // The unknowns' matrix: (tile · map)ᵀ H (tile · map).
  const columns = Array.from({ length: s.columns }, (_, c) => tile(Float64Array.from(s.map, (row) => row[c]!)));
  const Hv = columns.map((a) => {
    const Ha = times(H, a);
    return Float64Array.from(columns, (b) => b.reduce((sum, x, j) => sum + x * Ha[j]!, 0));
  });
  const trace = Hv.reduce((sum, row, i) => sum + row[i]!, 0);
  const P = inverse(Hv.map((row, i) => row.map((x, j) => (i === j ? x + (RIDGE * trace) / Hv.length : x))));
  if (!P) throw new Error("The moves' matrix is singular");
  const condition = (terms: readonly (readonly [number, number])[]) => {
    const L = new Float64Array(s.columns);
    for (const [k, w] of terms) {
      const c = s.column.get(s.roots[k]!);
      if (c !== undefined) L[c]! += w;
    }
    return L;
  };
  const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i]! * b[i]!;
    return sum;
  };
  let best: { value: number; kind: 'straight' | 'join'; i: number } | null = null;
  const weigh = (L: Float64Array, kind: 'straight' | 'join', i: number) => {
    const den = dot(L, times(P, L));
    if (!(den > 0)) return;
    const value = dot(L, v) ** 2 / den;
    if (best === null || value < best.value) best = { value, kind, i };
  };
  elements.forEach((e, i) => {
    if (!e.curve) return;
    weigh(
      condition([
        [i, 1],
        [i + 1, -1],
      ]),
      'straight',
      i,
    );
    if (elements[i + 1]?.curve) {
      const a = s.knots[i]!,
        b = s.knots[i + 1]!,
        c = s.knots[i + 2]!;
      weigh(
        condition([
          [i + 1, 1],
          [i, -(c - b) / (c - a)],
          [i + 2, -(b - a) / (c - a)],
        ]),
        'join',
        i,
      );
    }
  });
  const move = (best as { kind: 'straight' | 'join'; i: number } | null) ?? {
    kind: 'straight' as const,
    i: elements.findIndex((e) => e.curve),
  };
  const next = elements.map((e) => ({ ...e }));
  if (move.kind === 'straight') next[move.i] = { ...next[move.i]!, curve: false };
  else next.splice(move.i, 2, { from: next[move.i]!.from, to: next[move.i + 1]!.to, curve: true });
  const tidy: Element[] = [];
  for (const e of next) {
    const last = tidy.at(-1);
    if (last && !last.curve && !e.curve) tidy[tidy.length - 1] = { ...last, to: e.to };
    else tidy.push(e);
  }
  return tidy;
}

/** `x` rounded to `places` decimals, half to even on the exact value. */
export function round(x: number, places: number): number {
  const exact = Math.abs(x).toFixed(100);
  const point = exact.indexOf('.');
  const kept = exact.slice(0, point + 1 + places),
    rest = exact.slice(point + 1 + places);
  const digits = BigInt(kept.replace('.', ''));
  const half = rest[0]! > '5' || (rest[0] === '5' && /[1-9]/.test(rest.slice(1)));
  const tie = rest[0] === '5' && !/[1-9]/.test(rest.slice(1));
  const up = half || (tie && digits % 2n === 1n);
  const n = digits + (up ? 1n : 0n);
  const text = n.toString().padStart(places + 1, '0');
  const value = Number(`${text.slice(0, text.length - places)}.${text.slice(text.length - places)}`);
  return x < 0 ? -value : value;
}

/** A look rounded as the pieces are compared. */
const rounded = (look: number) => round(look, LOOK_PLACES);

/**
 * A piece's way from every cell of its stretch [a, b) a vertical curve down to one: its grades on the measure's borders,
 * or, `repeats` given, on its stretch's own, repeated that many times along the measure's (the road level past them).
 */
export function solvePiece(measure: Measure, a: number, b: number, repeats?: number): Solved[] {
  const borders = repeats ? b : measure.edges;
  const tile: Tile = repeats
    ? (gc) =>
        Float64Array.from({ length: measure.edges + 1 }, (_, e) =>
          e < repeats * b ? gc[e % b]! : e === repeats * b ? gc[b]! : 0,
        )
    : (g) => g;
  const tileTransposed: Tile = repeats
    ? (g) => {
        const gc = new Float64Array(b + 1);
        for (let e = 0; e <= Math.min(repeats * b, measure.edges); e++) gc[e < repeats * b ? e % b : b]! += g[e]!;
        return gc;
      }
    : (g) => g;
  let elements: Element[] = [
    ...(a > 0 ? [{ from: 0, to: a, curve: false }] : []),
    ...Array.from({ length: b - a }, (_, j) => ({ from: a + j, to: a + j + 1, curve: true })),
    ...(b < borders ? [{ from: b, to: borders, curve: false }] : []),
  ];
  let s = structure(elements, borders);
  let v = solveUnknowns(measure, new Float64Array(s.columns), s.map, s.columns, tile, tileTransposed, FIRST_ITERATIONS);
  const way: Solved[] = [];
  for (;;) {
    const grades = times(s.map, v);
    const curves = elements.filter((e) => e.curve).length;
    way.push({ curves, look: rounded(measure.look(tile(grades))), grades, elements });
    if (curves <= 1) return way;
    elements = reduceOne(measure, elements, v, s, tile);
    s = structure(elements, borders);
    v = solveUnknowns(measure, unknownsFrom(grades, s), s.map, s.columns, tile, tileTransposed, LATER_ITERATIONS);
  }
}

/** The piece: of the way, the fewest vertical curves within `PVI_ROWS` of the best look; and the best look. */
export function choosePiece(way: readonly Solved[]): { readonly piece: Solved; readonly best: number } {
  const best = Math.min(...way.map((p) => p.look));
  const piece = way
    .filter((p) => p.look <= best + PVI_ROWS)
    .reduce((chosen, p) => (p.curves < chosen.curves ? p : chosen));
  return { piece, best };
}

/** A dense square matrix's inverse by elimination with partial pivoting, null where it is singular. */
function inverse(a: readonly Float64Array[]): Float64Array[] | null {
  const n = a.length;
  const m = a.map((row) => Float64Array.from(row));
  const inv = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[p]![c]!)) p = r;
    if (!(Math.abs(m[p]![c]!) > 0)) return null;
    [m[c], m[p]] = [m[p]!, m[c]!];
    [inv[c], inv[p]] = [inv[p]!, inv[c]!];
    const pivot = m[c]![c]!;
    for (let k = 0; k < n; k++) {
      m[c]![k]! /= pivot;
      inv[c]![k]! /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        m[r]![k]! -= f * m[c]![k]!;
        inv[r]![k]! -= f * inv[c]![k]!;
      }
    }
  }
  return inv;
}
