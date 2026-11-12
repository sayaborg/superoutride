import type { CompiledSection } from '../course/compiler/course-graph.js';
import { routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import { courseBoundaryAt, type CompiledBoundary } from '../course/course-boundaries.js';
import { courseRoadsAt, type CompiledLane, type CourseRoad } from '../course/course-lanes.js';
import type { CourseRoute } from '../course/course-route.js';
import type { RacingLines } from '../content/racing-line.js';

/**
 * The lane index of the racing line: an intent in it drives the course's racing line, a lane of every road it lies on
 * that neither ends nor is carried across seams.
 */
export const LINE = -1;

/**
 * A driver's intent: its lane, the index of a lane in its Section's lanes left to right (medians not counted) at route
 * station `at`, or `LINE`. Elsewhere on the Route the lane is the one it continues as across each seam: a Link's named
 * lane continues as the next Section's centre lane, and the lanes beside it in order; `LINE` stays the racing line.
 */
export interface DriverIntent {
  readonly lane: number;
  readonly at: number;
  /** On the racing line, the driver's offset from it at a route station (route lateral); none is 0. */
  offset?(s: number): number;
  /** Its vehicle's width, metres: a lane narrower is not there for the driver (`roomy`). None, 0. */
  readonly width?: number;
}

/**
 * Whether a lane `width` wide is there for a vehicle `vehicle` wide: a lane of positive width no narrower than the
 * vehicle. A lane of zero width is there for none.
 */
export const roomy = (width: number, vehicle = 0) => width > 0 && width >= vehicle;

/**
 * Where a lane of width `width` first leaves no room for a vehicle `vehicle` wide after native station `from` through
 * `to`: where its width falls below the vehicle's, or reaches zero. Null where it keeps room.
 */
function narrowing(width: CompiledBoundary, from: number, to: number, vehicle: number): number | null {
  let s0 = from,
    l0 = courseBoundaryAt(width, from);
  for (const vertex of width.vertices) {
    if (vertex.at.s <= from) continue;
    const s1 = Math.min(vertex.at.s, to),
      l1 = vertex.at.s <= to ? vertex.l : courseBoundaryAt(width, to);
    if (!roomy(l1, vehicle)) return vehicle > 0 ? s0 + ((l0 - vehicle) / (l0 - l1)) * (s1 - s0) : s1;
    if (vertex.at.s >= to) break;
    [s0, l0] = [vertex.at.s, vertex.l];
  }
  return null;
}

// A Section's lanes, left to right.
const laneLists = new WeakMap<CompiledSection, readonly CompiledLane[]>();
function lanesOf(section: CompiledSection): readonly CompiledLane[] {
  let lanes = laneLists.get(section);
  if (!lanes) {
    lanes = section.lanes.elements.flatMap((element) => (element.kind === 'lane' ? [element.lane] : []));
    laneLists.set(section, lanes);
  }
  return lanes;
}

const roadOf = (section: CompiledSection, lane: CompiledLane, at: number): CourseRoad | undefined =>
  courseRoadsAt(section.lanes, at).find((road) => road.lanes.includes(lane));

/**
 * The lanes and the racing line along the Route, as drivers and recovery read them. `racingLines` are the course's;
 * without them the racing line is the centre lane's centre.
 */
export function createCourseForkField(route: CourseRoute, racingLines: RacingLines | null = null) {
  // The occurrence at route station s (clamped to the Route), and the native station there.
  const place = (s: number) => {
    const occurrence = route.at(Math.min(route.end, Math.max(route.start, s)))!;
    const domain = occurrence.section.coordinates.domain;
    return { occurrence, at: Math.min(domain.end, Math.max(domain.start, routeSectionS(occurrence, s))) };
  };
  // A lane index across the seam into `next` (its incoming Link), forward or backward; null when it does not continue.
  const across = (next: RouteOccurrence, lane: number, forward: boolean): number | null => {
    const link = next.incoming!;
    const from = link.from.section,
      to = next.section;
    const fromRoad = roadOf(from, link.from.lane, from.coordinates.domain.end),
      toRoad = roadOf(to, to.lanes.center, 0);
    if (!fromRoad || !toRoad) return null;
    const named = fromRoad.lanes.indexOf(link.from.lane),
      centre = toRoad.lanes.indexOf(to.lanes.center);
    if (forward) {
      const k = fromRoad.lanes.indexOf(lanesOf(from)[lane]!);
      const target = k < 0 ? undefined : toRoad.lanes[centre + k - named];
      return target ? lanesOf(to).indexOf(target) : null;
    }
    const k = toRoad.lanes.indexOf(lanesOf(to)[lane]!);
    const source = k < 0 ? undefined : fromRoad.lanes[named + k - centre];
    return source ? lanesOf(from).indexOf(source) : null;
  };
  // The lane nearest route lateral `l` in `occurrence` at native station `at`, among `candidates` (lane indices).
  const nearestLane = (occurrence: RouteOccurrence, at: number, l: number, candidates: readonly number[]) => {
    const lanes = lanesOf(occurrence.section);
    let best = candidates[0]!;
    for (const i of candidates)
      if (
        Math.abs(courseBoundaryAt(lanes[i]!.center, at) - occurrence.lateralOrigin - l) <
        Math.abs(courseBoundaryAt(lanes[best]!.center, at) - occurrence.lateralOrigin - l)
      )
        best = i;
    return best;
  };
  // The lanes of `occurrence` at native station `at` there for a vehicle `vehicle` wide: those `roomy` for it, or where
  // none is, every lane of positive width.
  const there = (occurrence: RouteOccurrence, at: number, vehicle = 0) => {
    const lanes = lanesOf(occurrence.section).map((lane, i) => ({ i, width: courseBoundaryAt(lane.width, at) }));
    const fitting = lanes.filter(({ width }) => roomy(width, vehicle));
    return (fitting.length ? fitting : lanes.filter(({ width }) => roomy(width))).map(({ i }) => i);
  };
  // A lane carried across one seam; where it does not continue, the lane nearest it there for a vehicle `vehicle` wide.
  const carryAcross = (next: RouteOccurrence, lane: number, forward: boolean, vehicle = 0) => {
    const mapped = across(next, lane, forward);
    if (mapped !== null) return mapped;
    const before = route.occurrences[next.ordinal - 1]!;
    const [from, to] = forward ? [before, next] : [next, before];
    const fromAt = forward ? from.end - from.start : 0,
      toAt = forward ? 0 : to.end - to.start;
    const l = courseBoundaryAt(lanesOf(from.section)[lane]!.center, fromAt) - from.lateralOrigin;
    return nearestLane(to, toAt, l, there(to, toAt, vehicle));
  };
  // The racing line's route lateral at route station `s`.
  const lineL = (s: number) => {
    const { occurrence, at } = place(s);
    const section = occurrence.section;
    if (!racingLines) return courseBoundaryAt(section.lanes.center.center, at) - occurrence.lateralOrigin;
    return racingLines.lateral(section, at) - occurrence.lateralOrigin;
  };
  // The intent's lane at route station `s`: carried across each seam between.
  const laneIn = (intent: DriverIntent, s: number) => {
    if (intent.lane === LINE) return LINE;
    let lane = intent.lane;
    const from = place(intent.at).occurrence,
      to = place(s).occurrence;
    if (to.ordinal > from.ordinal)
      for (let k = from.ordinal + 1; k <= to.ordinal; k++)
        lane = carryAcross(route.occurrences[k]!, lane, true, intent.width);
    else
      for (let k = from.ordinal; k > to.ordinal; k--)
        lane = carryAcross(route.occurrences[k]!, lane, false, intent.width);
    return lane;
  };
  // The lanes of the road `lane` lies in, toward which a lane that ends merges: the road continuing beyond its end.
  const toward = (lane: number, road: CourseRoad | undefined, lanes: readonly CompiledLane[]) => {
    if (!road) return null;
    const first = lanes.indexOf(road.lanes[0]!),
      last = lanes.indexOf(road.lanes.at(-1)!);
    return lane < first ? lane + 1 : lane > last ? lane - 1 : null;
  };
  /*
   * Where lane `lane` of `occurrence` ends after native station `from` through `to`, for a vehicle `vehicle` wide:
   * where it leaves the vehicle no room (`narrowing`), or at the seam into the next occurrence when it does not
   * continue. With the lane to merge toward: the neighbour beside it there for the vehicle. Null when it runs on.
   */
  const endIn = (occurrence: RouteOccurrence, lane: number, from: number, to: number, vehicle = 0) => {
    const section = occurrence.section,
      lanes = lanesOf(section),
      own = lanes[lane]!;
    let end: { at: number; merge: number | null } | null = null;
    const narrows = roomy(courseBoundaryAt(own.width, from), vehicle) ? narrowing(own.width, from, to, vehicle) : null;
    if (narrows !== null) {
      const merge = [lane - 1, lane + 1].find(
        (i) => lanes[i] && roomy(courseBoundaryAt(lanes[i]!.width, narrows), vehicle),
      );
      end = { at: narrows, merge: merge ?? null };
    }
    const next = route.occurrences[occurrence.ordinal + 1];
    const seam = occurrence.end - occurrence.start;
    if (end === null && next && seam > from && seam <= to && across(next, lane, true) === null) {
      const link = next.incoming!;
      end = { at: seam, merge: toward(lane, roadOf(section, link.from.lane, seam), lanes) };
    }
    return end;
  };
  // The road at route station s: the centre lane's.
  const roadAt = (s: number) => {
    const { occurrence, at } = place(s);
    const section = occurrence.section;
    return { occurrence, at, road: roadOf(section, section.lanes.center, at)! };
  };
  const forkField = Object.freeze({
    /** The target l for an intent: the centre of its lane there, or the racing line (route lateral). */
    targetL(s: number, intent: DriverIntent) {
      if (intent.lane === LINE) return lineL(s) + (intent.offset?.(s) ?? 0);
      const { occurrence, at } = place(s);
      return courseBoundaryAt(lanesOf(occurrence.section)[laneIn(intent, s)]!.center, at) - occurrence.lateralOrigin;
    },
    /** Rewrite an intent's lane as its lane at route station `s`. */
    carry(intent: { lane: number; at: number }, s: number) {
      intent.lane = laneIn(intent, s);
      intent.at = s;
    },
    /**
     * Where the intent's lane ends ahead, after route station `s` through `end` (where it leaves its vehicle no room,
     * or a seam it does not continue across), and, when that is the first end ahead, the lane beside it to merge
     * toward; null when the lane runs on through `end`.
     */
    laneEnd(
      s: number,
      end: number,
      intent: DriverIntent,
    ): { readonly s: number; readonly merge: number | null } | null {
      if (intent.lane === LINE) return null;
      let lane = laneIn(intent, s);
      for (let k = place(s).occurrence.ordinal; k < route.occurrences.length; k++) {
        const occurrence = route.occurrences[k]!;
        if (occurrence.start > end) break;
        if (k > place(s).occurrence.ordinal) lane = carryAcross(occurrence, lane, true, intent.width);
        const found = endIn(
          occurrence,
          lane,
          Math.max(0, routeSectionS(occurrence, s)),
          Math.min(occurrence.end - occurrence.start, routeSectionS(occurrence, end)),
          intent.width,
        );
        if (found) return { s: occurrence.start + found.at, merge: found.merge };
      }
      return null;
    },
    /**
     * The lanes beside `lane` (the intent's lane index at route station `s`) in the same road there, there for a
     * vehicle `vehicle` wide (`roomy`); beside the racing line, the nearest such lane on each side of it in the centre
     * lane's road.
     */
    adjacentLanes(s: number, lane: number, vehicle = 0): number[] {
      const { occurrence, at } = place(s);
      const lanes = lanesOf(occurrence.section);
      if (lane === LINE) {
        const l = lineL(s) + occurrence.lateralOrigin;
        const road = forkField.roadLanes(s, vehicle);
        const centre = (i: number) => courseBoundaryAt(lanes[i]!.center, at);
        const left = road.filter((i) => centre(i) <= l).at(-1);
        const right = road.find((i) => centre(i) > l);
        return [left, right].filter((i) => i !== undefined);
      }
      const road = roadOf(occurrence.section, lanes[lane]!, at);
      return [lane - 1, lane + 1].filter(
        (i) => lanes[i] && road?.lanes.includes(lanes[i]!) && roomy(courseBoundaryAt(lanes[i]!.width, at), vehicle),
      );
    },
    /** The edges of the road drivers drive at route station `s` (route laterals). */
    roadEdges(s: number): { readonly left: number; readonly right: number } {
      const { occurrence, road } = roadAt(s);
      return { left: road.left - occurrence.lateralOrigin, right: road.right - occurrence.lateralOrigin };
    },
    /**
     * The ground a racing line driver's path may take at route station `s` to clear a fixed object (route laterals):
     * between the course limits, and within the solid walls beside the road drivers drive there (a wall wholly to one
     * side of that road's edges bounds the ground on that side).
     */
    groundEdges(s: number): { readonly left: number; readonly right: number } {
      const { occurrence, at, road } = roadAt(s);
      let left = -Infinity,
        right = Infinity;
      for (const line of occurrence.section.barriers) {
        if (at < line.start || at > line.end) continue;
        const l = line.lateralAt(at);
        if (line.keep === 1 || (line.keep === 0 && l <= road.left)) left = Math.max(left, l);
        else if (line.keep === -1 || (line.keep === 0 && l >= road.right)) right = Math.min(right, l);
      }
      return { left: left - occurrence.lateralOrigin, right: right - occurrence.lateralOrigin };
    },
    /**
     * The lanes of the road drivers drive at route station `s` there for a vehicle `vehicle` wide (`roomy`), as lane
     * indices.
     */
    roadLanes(s: number, vehicle = 0): number[] {
      const { occurrence, at, road } = roadAt(s);
      const lanes = lanesOf(occurrence.section);
      return road.lanes
        .filter((lane) => roomy(courseBoundaryAt(lane.width, at), vehicle))
        .map((lane) => lanes.indexOf(lane));
    },
    /**
     * The recovery lane at route station `s` of a vehicle `vehicle` wide at route lateral `l`, every vehicle's alike:
     * the lane nearest `l` of those there for its vehicle; a lane index.
     */
    recoveryLane(s: number, l: number, vehicle = 0) {
      const { occurrence, at } = place(s);
      return nearestLane(occurrence, at, l, there(occurrence, at, vehicle));
    },
    /** The recovery l at route station `s`: the centre of the recovery lane (`recoveryLane`) there, route lateral. */
    recoveryL(s: number, l: number, vehicle = 0) {
      const { occurrence, at } = place(s);
      const lane = lanesOf(occurrence.section)[forkField.recoveryLane(s, l, vehicle)]!;
      return courseBoundaryAt(lane.center, at) - occurrence.lateralOrigin;
    },
  });
  return forkField;
}
