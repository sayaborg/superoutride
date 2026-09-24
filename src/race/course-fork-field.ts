import type { CompiledFork, CompiledLink } from '../course/compiler/course-graph.js';
import { routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import { courseCarriagewayExists, courseBoundaryAt, type CompiledCarriageway } from '../course/course-boundaries.js';
import { routeCrossingFraction, type createRouteCrossSections, type RoutePosition } from './route-cross-sections.js';
import type { CourseRoute } from '../course/course-route.js';

function center(road: CompiledCarriageway, s: number) {
  return (courseBoundaryAt(road.left, s) + courseBoundaryAt(road.right, s)) / 2;
}

/** One field authority observes every eligible motion before publishing any irreversible choice. */
export function createCourseForkField(route: CourseRoute, lines: ReturnType<typeof createRouteCrossSections>) {
  const locks = new Map<RouteOccurrence, CompiledLink>();
  return Object.freeze({
    choice: (fork: CompiledFork) => {
      for (const [occurrence, link] of locks) if (occurrence.section.fork === fork) return link;
      return null;
    },
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
        if (locks.has(occurrence)) continue;
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
        if (first) {
          route.append(selected!);
          locks.set(occurrence, selected!);
        }
      }
    },
    targetL(s: number, lane: number) {
      const occurrence = route.at(s)!;
      const section = occurrence.section;
      const fork = section.fork;
      if (!fork)
        return lane + (occurrence.incoming ? occurrence.incoming.to.lateralOrigin - occurrence.lateralOrigin : 0);
      let road =
        locks.get(occurrence)?.from.carriageway ??
        fork.exits[lane < 0 ? 0 : fork.exits.length - 1]!.link.from.carriageway;
      const at = Math.min(
        section.coordinates.domain.end,
        Math.max(section.coordinates.domain.start, routeSectionS(occurrence, s)),
      );
      if (!courseCarriagewayExists(road, at, section.coordinates.domain.end))
        road = section.carriageways.find((c) => courseCarriagewayExists(c, at, section.coordinates.domain.end))!;
      return center(road, at) - occurrence.lateralOrigin;
    },
    recoveryL(s: number, lane: number) {
      const occurrence = route.at(s)!;
      const at = routeSectionS(occurrence, s);
      const selected = locks.get(occurrence)?.from.carriageway;
      const active = (road: CompiledCarriageway) =>
        courseCarriagewayExists(road, at, occurrence.section.coordinates.domain.end);
      const road =
        selected && active(selected)
          ? selected
          : (occurrence.section.carriageways.find(
              (road) =>
                active(road) &&
                lane + occurrence.lateralOrigin >= courseBoundaryAt(road.left, at) &&
                lane + occurrence.lateralOrigin <= courseBoundaryAt(road.right, at),
            ) ?? occurrence.section.carriageways.find(active)!);
      return center(road, at) - occurrence.lateralOrigin;
    },
    legalTarget(s: number, l: number) {
      const occurrence = route.at(s);
      if (!occurrence) return null;
      const section = occurrence.section,
        fork = section.fork;
      const link = locks.get(occurrence);
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
}
