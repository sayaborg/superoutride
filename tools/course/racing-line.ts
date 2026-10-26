import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledLink, CompiledSection } from '../../src/course/compiler/course-graph.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import { courseRoadsAt } from '../../src/course/course-lanes.js';
import { stripSupportedIntervals } from '../../src/course/strip-material.js';
import { stripSlabAt } from '../../src/course/strip-slabs.js';
import { paceScheduleStations } from '../../src/content/pace-schedule.js';
import { racingLineExits, type RacingLineLaterals } from '../../src/content/racing-line.js';
import { wrapAngle } from '../../src/core/math.js';
import { createPlanCoordinateSample, type PlanCoordinateReader } from '../../src/course/geometry/plan-coordinate.js';
import { invertPlanarTransform, type PlanarTransform } from '../../src/core/planar-transform.js';
import type { CourseObject } from '../../src/course/course-objects.js';
import { AdmissionError } from '../../src/core/admission.js';
import { REFERENCE_DRIVER } from './reference-driving-policy.js';

/** The racing line procedure: its name, version and the values deciding its lines. */
export const RACING_LINE_PROCEDURE = Object.freeze({
  name: 'superoutride.racing-line',
  version: 4,
  /**
   * Per square metre: the length weights λ the lines are solved for, ascending from 0 (the minimum-curvature lines),
   * each from the lines of the one before; the one whose lines the timing driver drives fastest is chosen. Author
   * values: the length term weighs as much as the squared curvature of a turn of radius `1/√λ`, here four to a
   * decade from 316 m, gentler than a turn that limits speed, to 3.2 m, tighter than any road, where the lines are
   * all but the shortest.
   */
  lengthWeights: Object.freeze([
    0,
    ...Array.from({ length: 17 }, (_, k) => Number((10 ** (-5 + k / 4)).toPrecision(3))),
  ]),
  /** The driver that times the lines: the reference driver, whose plan's speeds time them (`plannedLineSeconds`). */
  driver: REFERENCE_DRIVER,
  /**
   * Metres: the width of the vehicle the lines are solved for, every course's (K, 2026-10-26), and the room it keeps
   * from the road's edges and from a fixed body standing on the road. A line keeps half the width plus the room from
   * each.
   */
  vehicleWidth: 2,
  edgeClearance: 0.3,
  bodyClearance: 0.5,
  /**
   * Linearisations of the objective at most, each solved to completion; the laterals move toward each solution by
   * the longest step of 1, 1/2, 1/4, … (at most `halvings` halvings) that lowers the objective, and the passes stop
   * once one moves no lateral by more than the saved `resolution`, or no step lowers it.
   */
  passes: 50,
  halvings: 20,
  /** Interior-point iterations at most per linearisation, and the complementarity they stop below. */
  iterations: 200,
  complementarity: 1e-14,
  /** The centring of each interior-point step. */
  centring: 0.1,
  /** Metres: the least width of a lateral's bounds (a gap too narrow for its margins bounds it to its middle). */
  leastWidth: 1e-4,
  /** The saved laterals' resolution in metres. */
  resolution: 0.001,
});
export type RacingLineProcedure = typeof RACING_LINE_PROCEDURE;

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
 * A term of the linearised objective: the square of its residual `constant + Σ coefficients_j x[variables[j]]`, over
 * consecutive samples, each the point of lateral `l_j = x[variables[j]] + offsets[j]` at station `stations[j]` of its
 * Section's plan coordinates.
 */
interface Term {
  readonly coordinates: readonly PlanCoordinateReader[];
  readonly stations: readonly number[];
  readonly variables: readonly number[];
  readonly offsets: readonly number[];
  readonly coefficients: Float64Array;
  constant: number;
}

/**
 * A curvature term, `m κ²` at the middle of three samples: `κ` the path's curvature as the planned driver reads it, the
 * heading change of the chord to the third point from the chord from the first over the chords' mean length `m`. Its
 * residual is `√m κ`.
 */
interface CurvatureTerm extends Term {
  /**
   * A term across a seam, whose points lie on two lines, places its beginning line's points in the ending line's frame
   * by the Link's rigid motion, since each Section's plan coordinates are its own frame; null within one line.
   */
  readonly frame: PlanarTransform | null;
}

/** A racing line solution and its timing: the lines, their length weight, and each timing vehicle's seconds. */
export interface RacingLineSolution {
  readonly laterals: RacingLineLaterals;
  readonly lengthWeight: number;
  readonly seconds: readonly number[];
  /** Each timing vehicle's seconds on the minimum-curvature lines (length weight 0). */
  readonly minimumCurvatureSeconds: readonly number[];
}

/**
 * The racing lines of `course`: for each Section a lateral at each schedule station (its 5 m stations and its end), and
 * for a fork Section one per exit. For a length weight λ they minimise `Σ m κ² + λ Σ len`: the summed squared path
 * curvature, measured on the chords between the stations' points as the planned driver reads it and weighted by the
 * chords' mean length, plus λ times the lines' length, the sum of their chords. They are kept within the road each line
 * drives less its margins from the road's edges and the fixed bodies on it, and solved jointly over the course graph as
 * one sparse problem: every seam shares one lateral among the lines ending and beginning there, and curvature terms span
 * each seam, so the slope carries across it. Of the procedure's length weights, the one whose lines `time` (each timing vehicle's seconds on them) sums least
 * is chosen, the smaller on a tie.
 *
 * Each pass linearises the objective at the current laterals (each curvature term's residual, and each chord's length
 * to second order), solves the box-constrained quadratic by a primal–dual interior-point method and steps toward its
 * solution as far as lowers the objective; each Newton step eliminates every line's inner samples, a banded system
 * per line, leaving a small dense system over the samples at and beside seams.
 */
export function solveRacingLines(
  course: CompiledCourse,
  procedure: RacingLineProcedure,
  time: (laterals: RacingLineLaterals) => readonly number[],
): RacingLineSolution {
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
  for (const line of lines) {
    const bodies = sampleBodies(line);
    line.stations.forEach((s, i) => {
      const [left, right] = lineBounds(line, s, bodies[i]!, procedure);
      const v = line.variables[i]!,
        offset = line.offsets[i]!;
      lower[v] = Math.max(lower[v]!, left - offset);
      upper[v] = Math.min(upper[v]!, right - offset);
    });
  }
  for (let v = 0; v < count; v++)
    if (!(upper[v]! - lower[v]! >= procedure.leastWidth)) {
      const middle = (lower[v]! + upper[v]!) / 2;
      lower[v] = middle - procedure.leastWidth / 2;
      upper[v] = middle + procedure.leastWidth / 2;
    }
  const curvatures = curvatureTerms(lines);
  const chords = chordTerms(lines);
  const terms = [...curvatures, ...chords];
  const system = createSystem(lines, curvatures, terms, count);
  const x = new Float64Array(count),
    solution = new Float64Array(count),
    trial = new Float64Array(count),
    linear = new Float64Array(count);
  for (let v = 0; v < count; v++) x[v] = (lower[v]! + upper[v]!) / 2;
  // Minimise the objective at length weight `weight` from the current laterals.
  const minimise = (weight: number) => {
    const objective = (at: Float64Array) =>
      linearise(curvatures, at) + weight * lineariseChords(chords, weight, at, linear);
    let total = objective(x);
    for (let pass = 0; pass < procedure.passes; pass++) {
      solution.set(x);
      interiorPoint(system, terms, linear, solution, lower, upper, procedure);
      // The longest step toward the solution that lowers the total; the bounds are a box, so every step keeps them.
      let next = Infinity;
      for (let halving = 0, step = 1; halving <= procedure.halvings && !(next < total); halving++, step /= 2) {
        for (let v = 0; v < count; v++) trial[v] = x[v]! + step * (solution[v]! - x[v]!);
        next = objective(trial);
      }
      if (!(next < total)) break;
      let moved = 0;
      for (let v = 0; v < count; v++) moved = Math.max(moved, Math.abs(trial[v]! - x[v]!));
      x.set(trial);
      total = next;
      if (moved <= procedure.resolution) break;
    }
  };
  const scale = 1 / procedure.resolution;
  const lateralsOf = (): RacingLineLaterals => {
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
  };
  const sum = (seconds: readonly number[]) => seconds.reduce((total, value) => total + value, 0);
  let chosen: Omit<RacingLineSolution, 'minimumCurvatureSeconds'> | null = null,
    minimumCurvatureSeconds: readonly number[] = [];
  for (const lengthWeight of procedure.lengthWeights) {
    minimise(lengthWeight);
    const laterals = lateralsOf();
    const seconds = time(laterals);
    if (lengthWeight === 0) minimumCurvatureSeconds = seconds;
    if (!chosen || sum(seconds) < sum(chosen.seconds)) chosen = { laterals, lengthWeight, seconds };
  }
  return { ...chosen!, minimumCurvatureSeconds };
}

/**
 * The fixed bodies bounding each sample of `line`: those standing between it and the sample either side, since the line
 * runs straight from one sample to the next. A movable object is knocked aside and bounds none.
 */
function sampleBodies(line: Line): CourseObject[][] {
  const { stations } = line;
  const bodies = stations.map((): CourseObject[] => []);
  let k = 0;
  for (const object of line.section.objects) {
    if (object.movable) continue;
    while (k + 1 < stations.length && stations[k + 1]! <= object.s) k++;
    bodies[k]!.push(object);
    if (stations[k]! < object.s && k + 1 < stations.length) bodies[k + 1]!.push(object);
  }
  return bodies;
}

/**
 * The bounds of `line` at station `s`: of the gaps that `bodies` standing on the road it drives leave between its edges,
 * the widest less its margins, half the procedure's vehicle width plus its clearance from an edge or a body on each
 * side. A gap narrower than its margins bounds the line to its middle, and a road the bodies close throws.
 */
function lineBounds(
  line: Line,
  s: number,
  bodies: readonly CourseObject[],
  procedure: RacingLineProcedure,
): [number, number] {
  const [left, right] = roadAt(line, s);
  const edge = procedure.vehicleWidth / 2 + procedure.edgeClearance,
    body = procedure.vehicleWidth / 2 + procedure.bodyClearance;
  const standing = bodies
    .map((object) => [object.l - object.width / 2, object.l + object.width / 2] as const)
    .filter(([a, b]) => b > left && a < right)
    .sort(([a], [b]) => a - b);
  // The widest gap less its margins (its room, negative where the margins overlap), the leftmost of equals.
  let best = null as [number, number] | null;
  let bestRoom = -Infinity;
  let [from, fromMargin] = [left, edge];
  const gap = (to: number, toMargin: number) => {
    const room = to - from - fromMargin - toMargin;
    if (!(to > from) || !(room > bestRoom)) return;
    const middle = (from + to) / 2;
    bestRoom = room;
    best =
      room >= 0
        ? [from + fromMargin, to - toMargin]
        : [middle - procedure.leastWidth / 2, middle + procedure.leastWidth / 2];
  };
  for (const [a, b] of standing) {
    gap(a, body);
    if (b > from) [from, fromMargin] = [b, body];
  }
  gap(right, edge);
  if (!best)
    throw new AdmissionError(
      'road_closed',
      `/sections/${line.section.id}`,
      `Bodies close the road at station ${s.toFixed(3)} m`,
    );
  return best;
}

/**
 * The road `line` drives at station `s`: the road of the lane it leaves by (its Link's, or the centre lane at a
 * terminal), or the road nearest that lane's centre where the lane has no width. On a fork Section before the lock line
 * it is the whole supported road: from the leftmost road's left edge to the rightmost one's right edge, within the
 * supported interval around the line's road.
 */
function roadAt(line: Line, s: number): [number, number] {
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
  return [left, right];
}

/**
 * The curvature terms: one at each interior sample of every line, and one at each seam for every line ending there and
 * every line beginning there.
 */
function curvatureTerms(lines: readonly Line[]): CurvatureTerm[] {
  const terms: CurvatureTerm[] = [];
  const add = (points: readonly (readonly [Line, number])[], frame: PlanarTransform | null) =>
    terms.push({
      coordinates: points.map(([line]) => line.section.coordinates),
      stations: points.map(([line, i]) => line.stations[i]!),
      variables: points.map(([line, i]) => line.variables[i]!),
      offsets: points.map(([line, i]) => line.offsets[i]!),
      frame,
      coefficients: new Float64Array(3),
      constant: 0,
    });
  for (const line of lines)
    for (let i = 1; i + 1 < line.stations.length; i++)
      add(
        [
          [line, i - 1],
          [line, i],
          [line, i + 1],
        ],
        null,
      );
  // Across each seam: the second-to-last sample of a line ending there, the seam and the second sample of a line
  // beginning there, each in its own line's frame.
  for (const ending of lines) {
    const n = ending.stations.length;
    if (!ending.link || n < 2) continue;
    // The ending Section's frame from its successor's, the inverse of the Link's.
    const frame = invertPlanarTransform(ending.link.toFromFrom);
    for (const beginning of lines) {
      if (beginning.section !== ending.link.to.section || beginning.stations.length < 2) continue;
      add(
        [
          [ending, n - 2],
          [beginning, 0],
          [beginning, 1],
        ],
        frame,
      );
    }
  }
  return terms;
}

/**
 * Linearise each term's residual `√m κ = Δφ/√m` at the laterals `x` and return the summed squared curvature there,
 * `Σ m κ²`. A point moves with its lateral along its plan normal `N`, so each chord `d` turns by `(d × N)/|d|²` and
 * lengthens by `(d · N)/|d|` per metre of either end's lateral, and the residual by `(Δφ' − κ m'/2)/√m`.
 */
function linearise(terms: readonly CurvatureTerm[], x: Float64Array): number {
  const sample = createPlanCoordinateSample();
  const px = [0, 0, 0],
    pz = [0, 0, 0],
    nx = [0, 0, 0],
    nz = [0, 0, 0];
  let total = 0;
  for (const term of terms) {
    for (let j = 0; j < term.variables.length; j++) {
      const point = term.coordinates[j]!.toWorld(term.stations[j]!, x[term.variables[j]!]! + term.offsets[j]!, sample);
      px[j] = point.x;
      pz[j] = point.z;
      nx[j] = Math.cos(point.heading);
      nz[j] = -Math.sin(point.heading);
      // A seam term's beginning points, in the ending line's frame.
      const frame = j > 0 ? term.frame : null;
      if (frame) {
        const { cosine, sine, translation } = frame;
        [px[j], pz[j]] = [
          translation.x + px[j]! * cosine + pz[j]! * sine,
          translation.z - px[j]! * sine + pz[j]! * cosine,
        ];
        [nx[j], nz[j]] = [nx[j]! * cosine + nz[j]! * sine, -nx[j]! * sine + nz[j]! * cosine];
      }
    }
    const ax = px[1]! - px[0]!,
      az = pz[1]! - pz[0]!,
      bx = px[2]! - px[1]!,
      bz = pz[2]! - pz[1]!;
    const a2 = ax * ax + az * az,
      b2 = bx * bx + bz * bz,
      a = Math.sqrt(a2),
      b = Math.sqrt(b2);
    const m = (a + b) / 2;
    const kappa = wrapAngle(Math.atan2(bx, bz) - Math.atan2(ax, az)) / m;
    // Each chord's turn and lengthening per metre of an end's lateral along `(vx, vz)`.
    const turnA = (vx: number, vz: number) => (az * vx - ax * vz) / a2,
      turnB = (vx: number, vz: number) => (bz * vx - bx * vz) / b2,
      lengthA = (vx: number, vz: number) => (ax * vx + az * vz) / a,
      lengthB = (vx: number, vz: number) => (bx * vx + bz * vz) / b;
    const turns = [turnA(nx[0]!, nz[0]!), -turnA(nx[1]!, nz[1]!) - turnB(nx[1]!, nz[1]!), turnB(nx[2]!, nz[2]!)];
    const lengths = [
      -lengthA(nx[0]!, nz[0]!) / 2,
      (lengthA(nx[1]!, nz[1]!) - lengthB(nx[1]!, nz[1]!)) / 2,
      lengthB(nx[2]!, nz[2]!) / 2,
    ];
    const root = Math.sqrt(m);
    term.constant = root * kappa;
    for (let j = 0; j < term.variables.length; j++) {
      term.coefficients[j] = (turns[j]! - (kappa * lengths[j]!) / 2) / root;
      term.constant -= term.coefficients[j]! * x[term.variables[j]!]!;
    }
    total += m * kappa * kappa;
  }
  return total;
}

/** The chord terms: one between each pair of consecutive samples of every line, in the line's frame. */
function chordTerms(lines: readonly Line[]): Term[] {
  const terms: Term[] = [];
  for (const line of lines)
    for (let i = 0; i + 1 < line.stations.length; i++)
      terms.push({
        coordinates: [line.section.coordinates, line.section.coordinates],
        stations: [line.stations[i]!, line.stations[i + 1]!],
        variables: [line.variables[i]!, line.variables[i + 1]!],
        offsets: [line.offsets[i]!, line.offsets[i + 1]!],
        coefficients: new Float64Array(2),
        constant: 0,
      });
  return terms;
}

/**
 * Model `weight` times each chord's length to second order at the laterals `x`, and return the summed length there. A
 * chord `d` between points that move along their plan normals `N` lengthens by `±(d · N)/|d|` per metre of either end's
 * lateral, which `linear` collects as the model's constant gradient, and its length's curvature is `(t · ΔN)²/|d|`
 * along the unit normal `t` of `d`, which the chord's residual carries: `√(weight/(2|d|)) t · (N_b Δl_b − N_a Δl_a)`.
 */
function lineariseChords(chords: readonly Term[], weight: number, x: Float64Array, linear: Float64Array): number {
  const sample = createPlanCoordinateSample();
  linear.fill(0);
  let total = 0;
  for (const chord of chords) {
    const a = chord.coordinates[0]!.toWorld(chord.stations[0]!, x[chord.variables[0]!]! + chord.offsets[0]!, sample);
    const ax = a.x,
      az = a.z,
      ha = a.heading;
    const b = chord.coordinates[1]!.toWorld(chord.stations[1]!, x[chord.variables[1]!]! + chord.offsets[1]!, sample);
    const dx = b.x - ax,
      dz = b.z - az,
      length = Math.hypot(dx, dz);
    // The ends' normals, the chord's direction and its unit normal.
    const nax = Math.cos(ha),
      naz = -Math.sin(ha),
      nbx = Math.cos(b.heading),
      nbz = -Math.sin(b.heading);
    const ux = dx / length,
      uz = dz / length;
    linear[chord.variables[0]!]! -= weight * (ux * nax + uz * naz);
    linear[chord.variables[1]!]! += weight * (ux * nbx + uz * nbz);
    const scale = Math.sqrt(weight / (2 * length));
    chord.coefficients[0] = -scale * (uz * nax - ux * naz);
    chord.coefficients[1] = scale * (uz * nbx - ux * nbz);
    chord.constant =
      -chord.coefficients[0]! * x[chord.variables[0]!]! - chord.coefficients[1]! * x[chord.variables[1]!]!;
    total += length;
  }
  return total;
}

/** A term's coefficient of its `j`th variable. */
const coefficient = (term: Term, j: number) => term.coefficients[j]!;

/**
 * The sparse structure of the problem's Hessian: each line's inner variables (its own samples not at or beside a seam,
 * in order) as one band of width two, and the border variables (every seam, and each sample beside one) apart. Inner
 * variables of different lines never share a term.
 */
function createSystem(
  lines: readonly Line[],
  curvatures: readonly CurvatureTerm[],
  terms: readonly Term[],
  count: number,
) {
  const borderOf = new Int32Array(count).fill(-1),
    innerOf = new Int32Array(count).fill(-1),
    blockOf = new Int32Array(count).fill(-1);
  const border: number[] = [];
  const addBorder = (v: number) => {
    if (borderOf[v]! < 0) borderOf[v] = border.push(v) - 1;
  };
  // Every variable of a term reaching across a seam, and every seam, is a border variable.
  for (const term of curvatures) if (term.frame) term.variables.forEach(addBorder);
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
 * Minimise the linearised objective, the terms' squared residuals plus `linear · x`, within `lower ≤ x ≤ upper` from
 * `x`, writing the minimiser to `x`: a primal–dual interior-point method on the bound slacks, with a fixed centring.
 */
function interiorPoint(
  system: RacingLineSystem,
  terms: readonly Term[],
  linear: Float64Array,
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
    gradient.set(linear);
    for (const term of terms) {
      let residual = term.constant;
      for (let j = 0; j < term.variables.length; j++) residual += coefficient(term, j) * x[term.variables[j]!]!;
      for (let j = 0; j < term.variables.length; j++)
        gradient[term.variables[j]!]! += 2 * coefficient(term, j) * residual;
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
    for (let j = 0; j < term.variables.length; j++) {
      const p = borderOf[term.variables[j]!]!;
      if (p < 0) continue;
      for (let k = 0; k < term.variables.length; k++) {
        const q = borderOf[term.variables[k]!]!;
        if (q >= 0) schur[p * size + q]! += 2 * coefficient(term, j) * coefficient(term, k);
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
      for (let j = 0; j < term.variables.length; j++) {
        const vj = term.variables[j]!;
        if (blockOf[vj] !== block.index) continue;
        const i = innerOf[vj]!;
        for (let k = 0; k < term.variables.length; k++) {
          const vk = term.variables[k]!,
            value = 2 * coefficient(term, j) * coefficient(term, k);
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
