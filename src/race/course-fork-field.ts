import type { CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import { routeSectionS, selectedSuccessor, type RouteOccurrence } from '../course/course-route.js';
import { courseBoundaryAt } from '../course/course-boundaries.js';
import { courseRoadsAt, type CompiledLane, type CourseRoad } from '../course/course-lanes.js';
import { routeCrossingFraction, type createRouteCrossSections, type RoutePosition } from './route-cross-sections.js';
import type { CourseRoute } from '../course/course-route.js';

/**
 * A driver's intent: its lane, the index of a lane in its Section's lanes left to right (medians not counted) at route
 * station `at`, and its target exit, an index into each fork occurrence's exits. Elsewhere on the Route the lane is the
 * one it continues as across each seam: a Link's named lane continues as the next Section's centre lane, and the lanes
 * beside it in order.
 */
export interface DriverIntent {
  readonly lane: number;
  readonly at: number;
  exit(occurrence: RouteOccurrence): number;
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

/** One field authority observes every eligible motion before publishing any irreversible choice. */
export function createCourseForkField(
  route: CourseRoute,
  lines: ReturnType<typeof createRouteCrossSections>,
  select: (link: CompiledLink) => void,
) {
  // The occurrence at route station s (clamped to the Route), and the native station there.
  const place = (s: number) => {
    const occurrence = route.at(Math.min(route.end, Math.max(route.start, s)))!;
    const domain = occurrence.section.coordinates.domain;
    return { occurrence, at: Math.min(domain.end, Math.max(domain.start, routeSectionS(occurrence, s))) };
  };
  // The Link a fork occurrence leaves by: the selected one once decided, else the intended exit's.
  const exitLink = (occurrence: RouteOccurrence, exit: DriverIntent['exit']) =>
    selectedSuccessor(route, occurrence) ?? occurrence.section.fork!.exits[exit(occurrence)]!.link;
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
  const positive = (occurrence: RouteOccurrence, at: number) =>
    lanesOf(occurrence.section).flatMap((lane, i) => (courseBoundaryAt(lane.width, at) > 0 ? [i] : []));
  // A lane carried across one seam; where it does not continue, the lane nearest it there.
  const carryAcross = (next: RouteOccurrence, lane: number, forward: boolean) => {
    const mapped = across(next, lane, forward);
    if (mapped !== null) return mapped;
    const before = route.occurrences[next.ordinal - 1]!;
    const [from, to] = forward ? [before, next] : [next, before];
    const fromAt = forward ? from.end - from.start : 0,
      toAt = forward ? 0 : to.end - to.start;
    const l = courseBoundaryAt(lanesOf(from.section)[lane]!.center, fromAt) - from.lateralOrigin;
    return nearestLane(to, toAt, l, positive(to, toAt));
  };
  // The intent's lane at route station `s`: carried across each seam between.
  const laneIn = (intent: DriverIntent, s: number) => {
    let lane = intent.lane;
    const from = place(intent.at).occurrence,
      to = place(s).occurrence;
    if (to.ordinal > from.ordinal)
      for (let k = from.ordinal + 1; k <= to.ordinal; k++) lane = carryAcross(route.occurrences[k]!, lane, true);
    else for (let k = from.ordinal; k > to.ordinal; k--) lane = carryAcross(route.occurrences[k]!, lane, false);
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
   * Where lane `lane` of `occurrence` ends after native station `from` through `to`, for an intent following `exit`:
   * where its width reaches zero; at a fork, at the lock line (closure once decided) when it is not in the road of the
   * Link followed; at the seam into the next occurrence when it does not continue. With the lane to merge toward: the
   * neighbour beside it that continues. Null when it runs on.
   */
  const endIn = (occurrence: RouteOccurrence, lane: number, from: number, to: number, exit: DriverIntent['exit']) => {
    const section = occurrence.section,
      lanes = lanesOf(section),
      own = lanes[lane]!;
    let end: { at: number; merge: number | null } | null = null;
    if (courseBoundaryAt(own.width, from) > 0) {
      const zero = own.width.vertices.find((vertex) => vertex.at.s > from && vertex.at.s <= to && vertex.l === 0);
      if (zero) {
        const merge = [lane - 1, lane + 1].find((i) => lanes[i] && courseBoundaryAt(lanes[i]!.width, zero.at.s) > 0);
        end = { at: zero.at.s, merge: merge ?? null };
      }
    }
    const fork = section.fork;
    if (fork) {
      const decided = selectedSuccessor(route, occurrence) !== null;
      const line = decided ? fork.closure.s : fork.lock.s;
      const link = exitLink(occurrence, exit);
      const road = roadOf(section, link.from.lane, line);
      if (line > from && line <= to && (end === null || line < end.at) && !road?.lanes.includes(own))
        end = { at: line, merge: toward(lane, road, lanes) };
    }
    const next = route.occurrences[occurrence.ordinal + 1];
    const seam = occurrence.end - occurrence.start;
    if (end === null && next && seam > from && seam <= to && across(next, lane, true) === null) {
      const link = next.incoming!;
      end = { at: seam, merge: toward(lane, roadOf(section, link.from.lane, seam), lanes) };
    }
    return end;
  };
  // The intent's road at route station s: at a fork the road of the Link followed, else the centre lane's.
  const roadAt = (s: number, exit: DriverIntent['exit']) => {
    const { occurrence, at } = place(s);
    const section = occurrence.section;
    const followed = section.fork ? roadOf(section, exitLink(occurrence, exit).from.lane, at) : undefined;
    return { occurrence, at, road: followed ?? roadOf(section, section.lanes.center, at)! };
  };
  // The Route's selected successor is the only stored choice; locks and legal targets derive from it.
  const forkField = Object.freeze({
    choice: (occurrence: RouteOccurrence) => selectedSuccessor(route, occurrence),
    observe(
      motions: readonly {
        readonly id: string;
        readonly previous: RoutePosition;
        readonly vehicle: { readonly course: RoutePosition };
        readonly recovered: boolean;
      }[],
    ) {
      for (const line of lines.forks) {
        const occurrence = line.occurrence;
        // A fork is decided once: an occurrence with a successor is already locked.
        if (selectedSuccessor(route, occurrence)) continue;
        const fork = occurrence.section.fork!;
        let first: (typeof motions)[number] | null = null,
          firstU = Infinity;
        let selected: CompiledLink | null = null;
        for (const motion of motions) {
          if (motion.recovered) continue;
          const u = routeCrossingFraction(line, motion.previous, motion.vehicle.course);
          if (u === null || u > firstU || (u === firstU && first && motion.id >= first.id)) continue;
          const l = motion.previous.l + u * (motion.vehicle.course.l - motion.previous.l) + occurrence.lateralOrigin;
          const exit = fork.exits.find((exit) => l >= exit.left && l < exit.right);
          if (!exit) continue;
          first = motion;
          firstU = u;
          selected = exit.link;
        }
        if (first) select(selected!);
      }
    },
    /** The target l for an intent: the centre of its lane there (route lateral). */
    targetL(s: number, intent: DriverIntent) {
      const { occurrence, at } = place(s);
      return courseBoundaryAt(lanesOf(occurrence.section)[laneIn(intent, s)]!.center, at) - occurrence.lateralOrigin;
    },
    /** Rewrite an intent's lane as its lane at route station `s`. */
    carry(intent: { lane: number; at: number; exit: DriverIntent['exit'] }, s: number) {
      intent.lane = laneIn(intent, s);
      intent.at = s;
    },
    /**
     * Where the intent's lane ends ahead, after route station `s` through `end` (where its width reaches zero, at a
     * fork the line it must leave a road the Link followed does not take by, or a seam it does not continue across),
     * and, when that is the first end ahead, the lane beside it to merge toward; null when the lane runs on through
     * `end`.
     */
    laneEnd(
      s: number,
      end: number,
      intent: DriverIntent,
    ): { readonly s: number; readonly merge: number | null } | null {
      let lane = laneIn(intent, s);
      for (let k = place(s).occurrence.ordinal; k < route.occurrences.length; k++) {
        const occurrence = route.occurrences[k]!;
        if (occurrence.start > end) break;
        if (k > place(s).occurrence.ordinal) lane = carryAcross(occurrence, lane, true);
        const found = endIn(
          occurrence,
          lane,
          Math.max(0, routeSectionS(occurrence, s)),
          Math.min(occurrence.end - occurrence.start, routeSectionS(occurrence, end)),
          intent.exit,
        );
        if (found) return { s: occurrence.start + found.at, merge: found.merge };
      }
      return null;
    },
    /** The lanes beside `lane` (the intent's lane index at route station `s`) in the same road there. */
    adjacentLanes(s: number, lane: number): number[] {
      const { occurrence, at } = place(s);
      const lanes = lanesOf(occurrence.section);
      const road = roadOf(occurrence.section, lanes[lane]!, at);
      return [lane - 1, lane + 1].filter((i) => lanes[i] && road?.lanes.includes(lanes[i]!));
    },
    /** The lanes of the road an intent following `exit` drives at route station `s`, as lane indices. */
    roadLanes(s: number, exit: DriverIntent['exit']): number[] {
      const { occurrence, road } = roadAt(s, exit);
      const lanes = lanesOf(occurrence.section);
      return road.lanes.map((lane) => lanes.indexOf(lane));
    },
    /** The lane nearest route lateral `l` at route station `s`, in the road an intent following `exit` drives. */
    intentLane(s: number, l: number, exit: DriverIntent['exit']) {
      const { occurrence, at } = place(s);
      return nearestLane(occurrence, at, l, forkField.roadLanes(s, exit));
    },
    /**
     * The recovery l at route station `s`: a driven competitor's target l for its intent; the player, which has no
     * driver intent, recovers to the centre of the lane nearest route lateral `l` of the roads it may drive (at a
     * decided fork, the selected Link's road where that road is).
     */
    recoveryL(s: number, intent: DriverIntent | null, l = 0) {
      if (intent) return forkField.targetL(s, intent);
      const { occurrence, at } = place(s);
      const selected = selectedSuccessor(route, occurrence);
      const road = selected && occurrence.section.fork ? roadOf(occurrence.section, selected.from.lane, at) : undefined;
      const lanes = lanesOf(occurrence.section);
      const candidates = road ? road.lanes.map((lane) => lanes.indexOf(lane)) : positive(occurrence, at);
      return courseBoundaryAt(lanes[nearestLane(occurrence, at, l, candidates)]!.center, at) - occurrence.lateralOrigin;
    },
    /**
     * After a decided fork's closure, a position on a road the selected Link does not leave by is on a closed road: its
     * legal target is the nearest lane centre of the selected road. Null elsewhere.
     */
    legalTarget(s: number, l: number) {
      const occurrence = route.at(s);
      if (!occurrence) return null;
      const section = occurrence.section,
        fork = section.fork;
      const link = selectedSuccessor(route, occurrence);
      const at = routeSectionS(occurrence, s);
      if (!fork || !link || at < fork.closure.s) return null;
      const native = l + occurrence.lateralOrigin;
      const selected = roadOf(section, link.from.lane, at);
      const closed = courseRoadsAt(section.lanes, at).some(
        (road) => !road.lanes.includes(link.from.lane) && native >= road.left && native <= road.right,
      );
      if (!closed || !selected) return null;
      const lanes = lanesOf(section);
      const lane = nearestLane(
        occurrence,
        at,
        l,
        selected.lanes.map((candidate) => lanes.indexOf(candidate)),
      );
      return { s, l: courseBoundaryAt(lanes[lane]!.center, at) - occurrence.lateralOrigin };
    },
  });
  return forkField;
}
