import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledLink, CompiledSection } from '../../src/course/compiler/course-graph.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { stripSupportedIntervals } from '../../src/course/strip-material.js';
import { stripSlabAt } from '../../src/course/strip-slabs.js';
import { paceScheduleStations } from '../../src/content/pace-schedule.js';
import { racingLineExits, type RacingLineLaterals } from '../../src/content/racing-line.js';

/**
 * The racing line procedure: its name, version and the values deciding its lines. The edge margin derives from the
 * catalog's widest vehicle, so a wider vehicle changes the procedure's identity.
 */
export function racingLineProcedure(widestVehicle: number) {
  return Object.freeze({
    name: 'superoutride.racing-line',
    version: 1,
    /** Metres kept inside the road's edges: half the catalog's widest vehicle plus 0.3 m. */
    edgeMargin: Math.round((widestVehicle / 2 + 0.3) * 1e6) / 1e6,
    /** Linearisations of the path curvature, each solved to completion. */
    passes: 5,
    /** Interior-point iterations at most per linearisation, and the complementarity they stop below. */
    iterations: 200,
    complementarity: 1e-14,
    /** The centring of each interior-point step. */
    centring: 0.1,
    /** Metres: the least width of a lateral's bounds (a road too narrow for the margin bounds it to its middle). */
    leastWidth: 1e-4,
    /** The saved laterals' resolution in metres. */
    resolution: 0.001,
  });
}
export type RacingLineProcedure = ReturnType<typeof racingLineProcedure>;

/** One line of the solve: a Section's, or a fork Section's toward one exit, over the whole Section. */
interface Line {
  readonly section: CompiledSection;
  /** The Link the line leaves by: its exit at a fork, the Section's one Link otherwise (null at a terminal). */
  readonly link: CompiledLink | null;
  readonly stations: readonly number[];
  /** The variable of each sample and the offset added to it there (a seam's variable is in its successor's frame). */
  readonly variables: Int32Array;
  readonly offsets: Float64Array;
}

/**
 * One curvature term, `weight × κ²` over three consecutive laterals `l_j = x[variables[j]] + offsets[j]` in one frame:
 * the plan curvature at the middle lateral plus the laterals' second difference `Σ stencil_j l_j`, over the path's
 * length there. Linearised, the plan curvature is `κ₀ + gain (l₁ − l₀)`, so
 * `κ = constant + Σ (stencil_j + [j = 1] gain) x[variables[j]]`.
 */
interface Term {
  /** The stations the term spans: half the samples' spacings either side. */
  readonly span: number;
  /** The path's length over the span at the linearised lateral: the span times the plan's metric `1 − k l₀`. */
  weight: number;
  readonly variables: readonly [number, number, number];
  readonly offsets: readonly [number, number, number];
  readonly stencil: readonly [number, number, number];
  /** The line and sample whose plan curvature the term reads. */
  readonly line: Line;
  readonly sample: number;
  gain: number;
  constant: number;
}

/**
 * The racing lines of `course`: for each Section a lateral at each schedule station (its 5 m stations and its end), and
 * for a fork Section one per exit. They minimise the summed squared path curvature (the plan curvature at the lateral
 * plus the line's own second derivative), kept within the road each line drives less the edge margin, solved jointly
 * over the course graph as one sparse problem: every seam shares one lateral among the lines ending and beginning
 * there, and curvature terms span each seam, so the slope carries across it.
 *
 * Each pass linearises the plan curvature at the current laterals and solves the box-constrained quadratic by a
 * primal–dual interior-point method; each Newton step eliminates every line's inner samples, a banded system per line,
 * leaving a small dense system over the samples at and beside seams.
 */
export function solveRacingLines(course: CompiledCourse, procedure: RacingLineProcedure): RacingLineLaterals {
  const lines: Line[] = [];
  let count = 0;
  // The seam at each Section's start that some Link enters: one variable in that Section's frame.
  const seams = new Map<CompiledSection, number>();
  for (const section of course.sections) if (section.incoming.length) seams.set(section, count++);
  for (const section of course.sections)
    for (const exit of racingLineExits(section)) {
      const link = exit ?? section.outgoing[0] ?? null;
      const stations = paceScheduleStations(section);
      const variables = new Int32Array(stations.length),
        offsets = new Float64Array(stations.length);
      const begins = seams.get(section);
      stations.forEach((_, i) => {
        if (i === 0 && begins !== undefined) variables[i] = begins;
        else if (i === stations.length - 1 && link) {
          // The lateral in the successor's frame is the lateral here less the cut's origin plus the entry's.
          variables[i] = seams.get(link.to.section)!;
          offsets[i] = link.from.lateralOrigin - link.to.lateralOrigin;
        } else variables[i] = count++;
      });
      lines.push({ section, link, stations, variables, offsets });
    }
  const lower = new Float64Array(count).fill(-Infinity),
    upper = new Float64Array(count).fill(Infinity);
  // Each sample's bounds narrow its variable's: a seam's from every line meeting there.
  for (const line of lines)
    line.stations.forEach((s, i) => {
      const [left, right] = roadBounds(line, s, procedure.edgeMargin);
      const v = line.variables[i]!,
        offset = line.offsets[i]!;
      lower[v] = Math.max(lower[v]!, left - offset);
      upper[v] = Math.min(upper[v]!, right - offset);
    });
  for (let v = 0; v < count; v++)
    if (!(upper[v]! - lower[v]! >= procedure.leastWidth)) {
      const middle = (lower[v]! + upper[v]!) / 2;
      lower[v] = middle - procedure.leastWidth / 2;
      upper[v] = middle + procedure.leastWidth / 2;
    }
  const terms = curvatureTerms(lines);
  const system = createSystem(lines, terms, count);
  const x = new Float64Array(count);
  for (let v = 0; v < count; v++) x[v] = (lower[v]! + upper[v]!) / 2;
  for (let pass = 0; pass < procedure.passes; pass++) {
    linearise(terms, x);
    interiorPoint(system, terms, x, lower, upper, procedure);
  }
  const scale = 1 / procedure.resolution;
  const sections = new Map<string, Map<string | null, readonly number[]>>();
  for (const line of lines) {
    const laterals = line.stations.map(
      (_, i) => Math.round((x[line.variables[i]!]! + line.offsets[i]!) * scale) / scale + 0,
    );
    const byExit = sections.get(line.section.id) ?? new Map<string | null, readonly number[]>();
    byExit.set(line.section.fork ? line.link!.id : null, laterals);
    sections.set(line.section.id, byExit);
  }
  return sections;
}

/**
 * The bounds of `line` at station `s`: the road it drives there less `margin` either side. That is the road of the lane
 * it leaves by (its Link's, or the centre lane at a terminal), or the road nearest that lane's centre where the lane has
 * no width. On a fork Section before the lock line it is the whole supported road: from the leftmost road's left edge
 * to the rightmost one's right edge, within the supported interval around the line's road.
 */
function roadBounds(line: Line, s: number, margin: number): [number, number] {
  const { section, link } = line;
  const lane = link?.from.lane ?? section.lanes.center;
  const roads = courseRoadsAt(section.lanes, s);
  const centre = courseBoundaryAt(lane.center, s);
  const middle = (road: { left: number; right: number }) => (road.left + road.right) / 2;
  const road =
    roads.find((candidate) => candidate.lanes.includes(lane)) ??
    roads.reduce<(typeof roads)[number] | undefined>(
      (best, candidate) =>
        best && Math.abs(middle(best) - centre) <= Math.abs(middle(candidate) - centre) ? best : candidate,
      undefined,
    );
  let left = road?.left ?? centre,
    right = road?.right ?? centre;
  if (section.fork && s < section.fork.lock.s && road) {
    const supported = stripSupportedIntervals(section.material.slabs[stripSlabAt(section.material.slabs, s)]!, s);
    const [a, b] = supported.find(([a, b]) => a <= middle(road) && middle(road) <= b) ?? [left, right];
    left = Math.max(a, Math.min(...roads.map((candidate) => candidate.left)));
    right = Math.min(b, Math.max(...roads.map((candidate) => candidate.right)));
  }
  return [left + margin, right - margin];
}

/**
 * The curvature terms: one at each interior sample of every line, and one at each seam for every line ending there and
 * every line beginning there.
 */
function curvatureTerms(lines: readonly Line[]): Term[] {
  const terms: Term[] = [];
  const add = (
    line: Line,
    sample: number,
    variables: [number, number, number],
    offsets: [number, number, number],
    h1: number,
    h2: number,
  ) => {
    const scale = 2 / (h1 + h2);
    terms.push({
      span: (h1 + h2) / 2,
      weight: (h1 + h2) / 2,
      variables,
      offsets,
      stencil: [scale / h1, -scale * (1 / h1 + 1 / h2), scale / h2],
      line,
      sample,
      gain: 0,
      constant: 0,
    });
  };
  for (const line of lines) {
    const { stations: s, variables: v, offsets: o } = line;
    for (let i = 1; i + 1 < s.length; i++)
      add(line, i, [v[i - 1]!, v[i]!, v[i + 1]!], [o[i - 1]!, o[i]!, o[i + 1]!], s[i]! - s[i - 1]!, s[i + 1]! - s[i]!);
  }
  // Across each seam: the second-to-last sample of a line ending there, the seam and the second sample of a line
  // beginning there, in the beginning line's frame (the ending line's laterals less its seam offset).
  for (const ending of lines) {
    const n = ending.stations.length;
    if (!ending.link || n < 2) continue;
    const shift = ending.offsets[n - 1]!;
    for (const beginning of lines) {
      if (beginning.section !== ending.link.to.section || beginning.stations.length < 2) continue;
      add(
        beginning,
        0,
        [ending.variables[n - 2]!, beginning.variables[0]!, beginning.variables[1]!],
        [ending.offsets[n - 2]! - shift, beginning.offsets[0]!, beginning.offsets[1]!],
        ending.stations[n - 1]! - ending.stations[n - 2]!,
        beginning.stations[1]! - beginning.stations[0]!,
      );
    }
  }
  return terms;
}

/**
 * Linearise each term at the current laterals: the plan curvature at lateral l is `k/(1 − k l)` for the plan's curvature
 * k at the middle sample, so near `l₀` it is `κ₀ + g (l − l₀)` with `g = k²/(1 − k l₀)²`, and the path's length over the
 * term's span is the span times `1 − k l₀`.
 */
function linearise(terms: readonly Term[], x: Float64Array) {
  const metrics = { curvature: 0, offsetMetric: 1 };
  for (const term of terms) {
    const { line, sample, variables, offsets, stencil } = term;
    const l0 = x[variables[1]]! + offsets[1];
    const k = line.section.coordinates.metricsAt(line.stations[sample]!, l0, metrics).curvature;
    const metric = 1 - k * l0;
    term.weight = term.span * metric;
    term.gain = (k * k) / (metric * metric);
    term.constant =
      k / metric -
      term.gain * x[variables[1]]! +
      stencil[0] * offsets[0] +
      stencil[1] * offsets[1] +
      stencil[2] * offsets[2];
  }
}

/** A term's coefficient of its `j`th variable. */
const coefficient = (term: Term, j: number) => term.stencil[j]! + (j === 1 ? term.gain : 0);

/**
 * The sparse structure of the problem's Hessian: each line's inner variables (its own samples not at or beside a seam,
 * in order) as one band of width two, and the border variables (every seam, and each sample beside one) apart. Inner
 * variables of different lines never share a term.
 */
function createSystem(lines: readonly Line[], terms: readonly Term[], count: number) {
  const borderOf = new Int32Array(count).fill(-1),
    innerOf = new Int32Array(count).fill(-1),
    blockOf = new Int32Array(count).fill(-1);
  const border: number[] = [];
  const addBorder = (v: number) => {
    if (borderOf[v]! < 0) borderOf[v] = border.push(v) - 1;
  };
  // Every variable of a term reaching across a seam, and every seam, is a border variable.
  for (const term of terms) if (term.sample === 0) term.variables.forEach(addBorder);
  for (const line of lines) {
    if (line.section.incoming.length) addBorder(line.variables[0]!);
    if (line.link) addBorder(line.variables[line.variables.length - 1]!);
  }
  const blocks: { readonly variables: Int32Array; readonly terms: Term[]; readonly coupled: Set<number> }[] = [];
  for (const line of lines) {
    const inner = [...line.variables].filter((v) => borderOf[v]! < 0);
    if (!inner.length) continue;
    inner.forEach((v, i) => {
      innerOf[v] = i;
      blockOf[v] = blocks.length;
    });
    blocks.push({ variables: Int32Array.from(inner), terms: [], coupled: new Set() });
  }
  // Each block's terms, and the border variables coupled to its inner ones.
  for (const term of terms) {
    const touched = new Set<number>();
    for (const v of term.variables) if (blockOf[v]! >= 0) touched.add(blockOf[v]!);
    for (const b of touched) {
      blocks[b]!.terms.push(term);
      for (const v of term.variables) if (borderOf[v]! >= 0) blocks[b]!.coupled.add(borderOf[v]!);
    }
  }
  return {
    count,
    border,
    borderOf,
    innerOf,
    blocks: blocks.map((block, b) => ({
      index: b,
      variables: block.variables,
      terms: block.terms,
      coupled: Int32Array.from([...block.coupled].sort((p, q) => p - q)),
    })),
    blockOf,
  };
}
type RacingLineSystem = ReturnType<typeof createSystem>;

/**
 * Minimise `Σ weight κ²` within `lower ≤ x ≤ upper` from `x`, writing the minimiser to `x`: a primal–dual
 * interior-point method on the bound slacks, with a fixed centring.
 */
function interiorPoint(
  system: RacingLineSystem,
  terms: readonly Term[],
  x: Float64Array,
  lower: Float64Array,
  upper: Float64Array,
  procedure: RacingLineProcedure,
) {
  const n = system.count;
  // Start strictly inside the bounds.
  for (let v = 0; v < n; v++) {
    const inset = (upper[v]! - lower[v]!) * 0.01;
    x[v] = Math.min(upper[v]! - inset, Math.max(lower[v]! + inset, x[v]!));
  }
  const zLower = new Float64Array(n).fill(1e-3),
    zUpper = new Float64Array(n).fill(1e-3);
  const gradient = new Float64Array(n),
    diagonal = new Float64Array(n),
    rhs = new Float64Array(n),
    step = new Float64Array(n),
    dzLower = new Float64Array(n),
    dzUpper = new Float64Array(n);
  for (let iteration = 0; iteration < procedure.iterations; iteration++) {
    gradient.fill(0);
    for (const term of terms) {
      let residual = term.constant;
      for (let j = 0; j < 3; j++) residual += coefficient(term, j) * x[term.variables[j]!]!;
      for (let j = 0; j < 3; j++) gradient[term.variables[j]!]! += 2 * term.weight * coefficient(term, j) * residual;
    }
    let gap = 0;
    for (let v = 0; v < n; v++) gap += (x[v]! - lower[v]!) * zLower[v]! + (upper[v]! - x[v]!) * zUpper[v]!;
    const mu = gap / (2 * n);
    if (mu < procedure.complementarity) break;
    const target = procedure.centring * mu;
    for (let v = 0; v < n; v++) {
      const s1 = x[v]! - lower[v]!,
        s2 = upper[v]! - x[v]!;
      diagonal[v] = zLower[v]! / s1 + zUpper[v]! / s2;
      rhs[v] = -gradient[v]! + target / s1 - target / s2;
    }
    solveNewton(system, terms, diagonal, rhs, step);
    // The longest steps keeping the slacks and duals positive, shortened to stay inside.
    let primal = 1,
      dual = 1;
    for (let v = 0; v < n; v++) {
      const s1 = x[v]! - lower[v]!,
        s2 = upper[v]! - x[v]!,
        dx = step[v]!;
      dzLower[v] = target / s1 - zLower[v]! - (zLower[v]! / s1) * dx;
      dzUpper[v] = target / s2 - zUpper[v]! + (zUpper[v]! / s2) * dx;
      if (dx < 0) primal = Math.min(primal, (-0.99 * s1) / dx);
      if (dx > 0) primal = Math.min(primal, (0.99 * s2) / dx);
      if (dzLower[v]! < 0) dual = Math.min(dual, (-0.99 * zLower[v]!) / dzLower[v]!);
      if (dzUpper[v]! < 0) dual = Math.min(dual, (-0.99 * zUpper[v]!) / dzUpper[v]!);
    }
    for (let v = 0; v < n; v++) {
      x[v]! += primal * step[v]!;
      zLower[v]! += dual * dzLower[v]!;
      zUpper[v]! += dual * dzUpper[v]!;
    }
  }
}

/**
 * Solve `(H + diag(diagonal)) step = rhs` for the Hessian H of the terms: each block's inner variables are eliminated
 * by its banded factorisation, the border variables solved densely from their Schur complement, then the inner
 * variables substituted back.
 */
function solveNewton(
  system: RacingLineSystem,
  terms: readonly Term[],
  diagonal: Float64Array,
  rhs: Float64Array,
  step: Float64Array,
) {
  const { border, borderOf, innerOf, blockOf, blocks } = system;
  const size = border.length;
  const schur = new Float64Array(size * size),
    reduced = new Float64Array(size);
  border.forEach((v, p) => {
    schur[p * size + p] = diagonal[v]!;
    reduced[p] = rhs[v]!;
  });
  // The border-to-border Hessian.
  for (const term of terms)
    for (let j = 0; j < 3; j++) {
      const p = borderOf[term.variables[j]!]!;
      if (p < 0) continue;
      for (let k = 0; k < 3; k++) {
        const q = borderOf[term.variables[k]!]!;
        if (q >= 0) schur[p * size + q]! += 2 * term.weight * coefficient(term, j) * coefficient(term, k);
      }
    }
  const eliminated = blocks.map((block) => {
    const m = block.variables.length;
    const d0 = Float64Array.from(block.variables, (v) => diagonal[v]!),
      d1 = new Float64Array(m),
      d2 = new Float64Array(m);
    const columns = new Map<number, Float64Array>();
    for (const p of block.coupled) columns.set(p, new Float64Array(m));
    for (const term of block.terms)
      for (let j = 0; j < 3; j++) {
        const vj = term.variables[j]!;
        if (blockOf[vj] !== block.index) continue;
        const i = innerOf[vj]!;
        for (let k = 0; k < 3; k++) {
          const vk = term.variables[k]!,
            value = 2 * term.weight * coefficient(term, j) * coefficient(term, k);
          if (borderOf[vk]! >= 0) columns.get(borderOf[vk]!)![i]! += value;
          else {
            const q = innerOf[vk]!;
            if (q === i) d0[i]! += value;
            else if (q === i + 1) d1[i]! += value;
            else if (q === i + 2) d2[i]! += value;
          }
        }
      }
    factorBand(d0, d1, d2);
    const inner = Float64Array.from(block.variables, (v) => rhs[v]!);
    solveBand(d0, d1, d2, inner);
    const solved = new Map<number, Float64Array>();
    for (const [p, column] of columns) {
      const y = Float64Array.from(column);
      solveBand(d0, d1, d2, y);
      solved.set(p, y);
    }
    // Eliminate the block: its share of the Schur complement and of the reduced right-hand side.
    for (const [p, column] of columns) {
      for (const [q, y] of solved) {
        let dot = 0;
        for (let i = 0; i < m; i++) dot += column[i]! * y[i]!;
        schur[p * size + q]! -= dot;
      }
      let dot = 0;
      for (let i = 0; i < m; i++) dot += column[i]! * inner[i]!;
      reduced[p]! -= dot;
    }
    return { inner, solved };
  });
  choleskySolve(schur, reduced, size);
  border.forEach((v, p) => (step[v] = reduced[p]!));
  blocks.forEach((block, b) => {
    const { inner, solved } = eliminated[b]!;
    for (const [p, y] of solved) for (let i = 0; i < inner.length; i++) inner[i]! -= y[i]! * reduced[p]!;
    block.variables.forEach((v, i) => (step[v] = inner[i]!));
  });
}

/**
 * Factor a symmetric positive band of width two in place as `LDLᵀ`: D on the diagonal `d0`, L's first and second
 * sub-diagonals over the band's `d1` and `d2` (entry `i` below row `i`).
 */
function factorBand(d0: Float64Array, d1: Float64Array, d2: Float64Array) {
  const m = d0.length;
  for (let i = 0; i < m; i++) {
    // A's (i, i−2) and (i, i−1) entries are d2[i−2] and d1[i−1], which L's overwrite.
    const l2 = i >= 2 ? d2[i - 2]! / d0[i - 2]! : 0;
    const l1 = i >= 1 ? (d1[i - 1]! - (i >= 2 ? l2 * d1[i - 2]! * d0[i - 2]! : 0)) / d0[i - 1]! : 0;
    if (i >= 2) d2[i - 2] = l2;
    if (i >= 1) d1[i - 1] = l1;
    d0[i] = d0[i]! - l1 * l1 * (i >= 1 ? d0[i - 1]! : 0) - l2 * l2 * (i >= 2 ? d0[i - 2]! : 0);
  }
}

/** Solve with a factored band, in place. */
function solveBand(d0: Float64Array, l1: Float64Array, l2: Float64Array, r: Float64Array) {
  const m = d0.length;
  for (let i = 0; i < m; i++)
    r[i] = r[i]! - (i >= 1 ? l1[i - 1]! * r[i - 1]! : 0) - (i >= 2 ? l2[i - 2]! * r[i - 2]! : 0);
  for (let i = 0; i < m; i++) r[i] = r[i]! / d0[i]!;
  for (let i = m - 1; i >= 0; i--)
    r[i] = r[i]! - (i + 1 < m ? l1[i]! * r[i + 1]! : 0) - (i + 2 < m ? l2[i]! * r[i + 2]! : 0);
}

/** Solve a dense symmetric positive system in place by its Cholesky factorisation. */
function choleskySolve(a: Float64Array, b: Float64Array, n: number) {
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]!;
    for (let k = 0; k < j; k++) d -= a[j * n + k]! * a[j * n + k]!;
    d = Math.sqrt(d);
    a[j * n + j] = d;
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]!;
      for (let k = 0; k < j; k++) s -= a[i * n + k]! * a[j * n + k]!;
      a[i * n + j] = s / d;
    }
  }
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= a[i * n + k]! * b[k]!;
    b[i] = s / a[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]!;
    for (let k = i + 1; k < n; k++) s -= a[k * n + i]! * b[k]!;
    b[i] = s / a[i * n + i]!;
  }
}
