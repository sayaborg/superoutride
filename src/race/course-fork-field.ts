import type { CompiledLink } from '../course/compiler/course-graph.js';
import { routeSectionS, selectedSuccessor, type RouteOccurrence } from '../course/course-route.js';
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
 * A driver's intent: its lane, a lane number (0 is the leftmost lane of the Carriageway it follows), and its target
 * exit, an index into each fork occurrence's exits.
 */
export interface DriverIntent {
  readonly lane: number;
  exit(occurrence: RouteOccurrence): number;
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
  const targetCarriageway = (s: number, exit: DriverIntent['exit']): TargetCarriageway => {
    const occurrence = route.at(s)!;
    const section = occurrence.section;
    const at = Math.min(
      section.coordinates.domain.end,
      Math.max(section.coordinates.domain.start, routeSectionS(occurrence, s)),
    );
    const exists = (road: CompiledCarriageway) => courseCarriagewayExists(road, at, section.coordinates.domain.end);
    const fork = section.fork;
    let road = fork
      ? (selectedSuccessor(route, occurrence)?.from.carriageway ?? fork.exits[exit(occurrence)]!.link.from.carriageway)
      : null;
    if (!road || !exists(road)) road = section.carriageways.find(exists)!;
    return { occurrence, road, at };
  };
  // The Route's selected successor is the only stored choice; locks and legal targets derive from it.
  const forkField = Object.freeze({
    choice: (occurrence: RouteOccurrence) => selectedSuccessor(route, occurrence),
    observe(
      motions: readonly {
        readonly id: string;
        readonly previous: RoutePosition;
        readonly current: { readonly course: RoutePosition };
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
          const u = routeCrossingFraction(line, motion.previous, motion.current.course);
          if (u === null || u > firstU || (u === firstU && first && motion.id >= first.id)) continue;
          const l = motion.previous.l + u * (motion.current.course.l - motion.previous.l) + occurrence.lateralOrigin;
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
    /** The target l for an intent: the centre of its lane, within the lanes of the Carriageway it follows. */
    targetL(s: number, intent: DriverIntent) {
      const { occurrence, road, at } = targetCarriageway(s, intent.exit);
      return courseLaneCenterAt(road, Math.min(intent.lane, road.lanes - 1), at) - occurrence.lateralOrigin;
    },
    /** The lane number whose centre lies nearest route lateral `l` at route station `s`, on the road holding or nearest `l`. */
    intentLane(s: number, l: number) {
      const occurrence = route.at(s)!;
      const section = occurrence.section;
      const at = routeSectionS(occurrence, s);
      const native = l + occurrence.lateralOrigin;
      const distance = (road: CompiledCarriageway) =>
        Math.max(courseBoundaryAt(road.left, at) - native, native - courseBoundaryAt(road.right, at), 0);
      let nearest: CompiledCarriageway | null = null;
      for (const road of section.carriageways)
        if (
          courseCarriagewayExists(road, at, section.coordinates.domain.end) &&
          (!nearest || distance(road) < distance(nearest))
        )
          nearest = road;
      return courseLaneAt(nearest!, native, at);
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
