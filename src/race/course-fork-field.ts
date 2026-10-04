import type { CompiledLink } from '../course/compiler/course-graph.js';
import {
  routeLaneAcross,
  routeLaneBefore,
  routeSectionS,
  selectedSuccessor,
  type RouteOccurrence,
} from '../course/course-route.js';
import {
  courseCarriagewayExists,
  courseBoundaryAt,
  courseLaneAt,
  courseLaneCenterAt,
  type CompiledCarriageway,
} from '../course/course-boundaries.js';
import { routeCrossingFraction, type createRouteCrossSections, type RoutePosition } from './route-cross-sections.js';
import type { CourseRoute } from '../course/course-route.js';

function center(road: CompiledCarriageway, s: number) {
  return (courseBoundaryAt(road.left, s) + courseBoundaryAt(road.right, s)) / 2;
}

/**
 * A driver's intent: its lane, a lane number (0 is the leftmost lane) of the Carriageway it follows at route station
 * `at`, and its target exit, an index into each fork occurrence's exits. Elsewhere on the Route the lane is the one it
 * runs on as, or runs on from, across each change of the Carriageway followed between (`routeLaneAcross`,
 * `routeLaneBefore`).
 */
export interface DriverIntent {
  readonly lane: number;
  readonly at: number;
  exit(occurrence: RouteOccurrence): number;
}

/** A change of the Carriageway followed, at route station `s`: the lane centres on either side there (route laterals). */
interface RoadChange {
  readonly s: number;
  readonly from: readonly number[];
  readonly to: readonly number[];
}

/** The Carriageway followed at a route station, with its occurrence and the clamped native station it is read at. */
export interface TargetCarriageway {
  readonly occurrence: RouteOccurrence;
  readonly road: CompiledCarriageway;
  readonly at: number;
}

/** One field authority observes every eligible motion before publishing any irreversible choice. */
export function createCourseForkField(
  route: CourseRoute,
  lines: ReturnType<typeof createRouteCrossSections>,
  select: (link: CompiledLink) => void,
) {
  // The Carriageway an intent follows at Section station `at` of `occurrence`.
  const roadAt = (occurrence: RouteOccurrence, at: number, exit: DriverIntent['exit']) => {
    const section = occurrence.section;
    const exists = (road: CompiledCarriageway) => courseCarriagewayExists(road, at, section.coordinates.domain.end);
    const fork = section.fork;
    const road = fork
      ? (selectedSuccessor(route, occurrence)?.from.carriageway ?? fork.exits[exit(occurrence)]!.link.from.carriageway)
      : null;
    return road && exists(road) ? road : section.carriageways.find(exists)!;
  };
  const targetCarriageway = (s: number, exit: DriverIntent['exit']): TargetCarriageway => {
    const occurrence = route.at(s)!;
    const domain = occurrence.section.coordinates.domain;
    const at = Math.min(domain.end, Math.max(domain.start, routeSectionS(occurrence, s)));
    return { occurrence, road: roadAt(occurrence, at, exit), at };
  };
  // The lane centres of `road` at Section station `at` of `occurrence`, as route laterals.
  const centres = (occurrence: RouteOccurrence, road: CompiledCarriageway, at: number) =>
    Array.from({ length: road.lanes }, (_, lane) => courseLaneCenterAt(road, lane, at) - occurrence.lateralOrigin);
  /*
   * Visit, in order, the changes of the Carriageway an intent following `exit` follows after route station `start`
   * through `end`: each seam (the Carriageway the earlier occurrence leaves by, at its end, then the one followed at the
   * start of the next), and each station within a Section where the followed Carriageway changes (a road ending or
   * beginning there). A visit returning true stops the walk.
   */
  const changes = (start: number, end: number, exit: DriverIntent['exit'], visit: (change: RoadChange) => boolean) => {
    for (const occurrence of route.occurrences) {
      if (occurrence.end < start || occurrence.start > end) continue;
      if (occurrence.ordinal > 0 && occurrence.start > start && occurrence.start <= end) {
        const before = route.occurrences[occurrence.ordinal - 1]!;
        const from = centres(before, occurrence.incoming!.from.carriageway, before.end - before.start);
        if (visit({ s: occurrence.start, from, to: centres(occurrence, roadAt(occurrence, 0, exit), 0) })) return;
      }
      const section = occurrence.section;
      if (section.carriageways.length < 2) continue;
      const stations = [
        ...new Set(
          section.carriageways.flatMap((road) => [
            Math.max(road.left.vertices[0]!.at.s, road.right.vertices[0]!.at.s),
            Math.min(road.left.vertices.at(-1)!.at.s, road.right.vertices.at(-1)!.at.s),
          ]),
        ),
      ]
        .filter((at) => at > 0 && at < section.coordinates.domain.end)
        .sort((a, b) => a - b);
      let road = roadAt(occurrence, 0, exit);
      for (const at of stations) {
        const next = roadAt(occurrence, at, exit);
        if (next === road) continue;
        const s = occurrence.start + at;
        if (
          s > start &&
          s <= end &&
          visit({ s, from: centres(occurrence, road, at), to: centres(occurrence, next, at) })
        )
          return;
        road = next;
      }
    }
  };
  // The intent's lane at route station `s`: carried by position across each change of the followed Carriageway between.
  const laneIn = (intent: DriverIntent, s: number) => {
    let lane = intent.lane;
    if (s > intent.at)
      changes(intent.at, s, intent.exit, (change) => {
        lane = routeLaneAcross(change.from, lane, change.to).lane;
        return false;
      });
    else if (s < intent.at) {
      const between: RoadChange[] = [];
      changes(s, intent.at, intent.exit, (change) => {
        between.push(change);
        return false;
      });
      for (let i = between.length - 1; i >= 0; i--) lane = routeLaneBefore(between[i]!.from, between[i]!.to, lane);
    }
    return lane;
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
    /**
     * The Carriageway an intent follows at route station `s`: at a fork the selected exit's once the choice is decided,
     * else the intended exit's, and where that exit does not exist the Carriageway that does; off forks the
     * Carriageway existing there.
     */
    targetCarriageway,
    /** The target l for an intent: the centre of its lane there, in the Carriageway it follows. */
    targetL(s: number, intent: DriverIntent) {
      const { occurrence, road, at } = targetCarriageway(s, intent.exit);
      return courseLaneCenterAt(road, laneIn(intent, s), at) - occurrence.lateralOrigin;
    },
    /** Rewrite an intent's lane as its lane at route station `s`. */
    carry(intent: { lane: number; at: number; exit: DriverIntent['exit'] }, s: number) {
      intent.lane = laneIn(intent, s);
      intent.at = s;
    },
    /**
     * Where the intent's lane ends ahead: the first change of the followed Carriageway after route station `s`, through
     * `end`, across which it does not continue (`routeLaneAcross`), and, when that is the first change ahead, the lane
     * before it that continues into the same lane (the lane to merge toward); null when the lane runs on through `end`.
     */
    laneEnd(
      s: number,
      end: number,
      intent: DriverIntent,
    ): { readonly s: number; readonly merge: number | null } | null {
      let lane = laneIn(intent, s),
        first = true;
      let ended: { readonly s: number; readonly merge: number | null } | null = null;
      changes(s, end, intent.exit, (change) => {
        const across = routeLaneAcross(change.from, lane, change.to);
        if (!across.continues) {
          ended = { s: change.s, merge: first ? routeLaneBefore(change.from, change.to, across.lane) : null };
          return true;
        }
        lane = across.lane;
        first = false;
        return false;
      });
      return ended;
    },
    /** The lane of the Carriageway an intent following `exit` follows at route station `s` nearest route lateral `l`. */
    intentLane(s: number, l: number, exit: DriverIntent['exit']) {
      const { occurrence, road, at } = targetCarriageway(s, exit);
      return courseLaneAt(road, l + occurrence.lateralOrigin, at);
    },
    /**
     * The recovery l at route station `s`: a driven competitor's target l for its intent; the player, which has no
     * driver intent, recovers to the centre of the selected Carriageway, else of the Carriageway existing there.
     */
    recoveryL(s: number, intent: DriverIntent | null) {
      if (intent) return forkField.targetL(s, intent);
      const occurrence = route.at(s)!;
      const at = routeSectionS(occurrence, s);
      const selected = selectedSuccessor(route, occurrence)?.from.carriageway;
      const active = (road: CompiledCarriageway) =>
        courseCarriagewayExists(road, at, occurrence.section.coordinates.domain.end);
      const road = selected && active(selected) ? selected : occurrence.section.carriageways.find(active)!;
      return center(road, at) - occurrence.lateralOrigin;
    },
    legalTarget(s: number, l: number) {
      const occurrence = route.at(s);
      if (!occurrence) return null;
      const section = occurrence.section,
        fork = section.fork;
      const link = selectedSuccessor(route, occurrence);
      const nativeS = routeSectionS(occurrence, s);
      if (!fork || !link || nativeS < fork.closure.s) return null;
      const closed = fork.exits.some(({ link: exitLink }) => {
        const road = exitLink.from.carriageway;
        return (
          exitLink !== link &&
          courseCarriagewayExists(road, nativeS, section.coordinates.domain.end) &&
          l >= courseBoundaryAt(road.left, nativeS) - occurrence.lateralOrigin &&
          l <= courseBoundaryAt(road.right, nativeS) - occurrence.lateralOrigin
        );
      });
      return closed ? { s, l: center(link.from.carriageway, nativeS) - occurrence.lateralOrigin } : null;
    },
  });
  return forkField;
}
