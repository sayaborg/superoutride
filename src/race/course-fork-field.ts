import type { CompiledFork, CompiledLink } from '../course/compiler/course-graph.js';
import { routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import { courseCutLateral } from '../course/compiler/course-links.js';
import { courseRegionAt, courseBoundaryAt, type CompiledCarriageway } from '../course/course-regions.js';
import { routeCrossingFraction, type createRouteCrossSections, type RoutePosition } from './route-cross-sections.js';
import type { CourseRoute } from '../course/course-route.js';
import type { createRouteRuntime } from './route-runtime.js';
type RouteAccess = ReturnType<ReturnType<typeof createRouteRuntime>['createRouteAccess']>;

function center(road: CompiledCarriageway, s: number) {
  let left = Infinity,
    right = -Infinity;
  for (const region of road.regions)
    if (region.start.s <= s && region.end.s >= s) {
      left = Math.min(left, courseBoundaryAt(region.left, s));
      right = Math.max(right, courseBoundaryAt(region.right, s));
    }
  return (left + right) / 2;
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
        readonly routeAccess: RouteAccess;
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
          const region = fork.regions.find((region) => l >= region.left && l < region.right);
          if (!region) continue;
          first = motion;
          firstU = u;
          selected = region.link;
        }
        if (first) {
          first.routeAccess.prepareChoice(selected!).commit();
          locks.set(occurrence, selected!);
        }
      }
    },
    targetL(s: number, lane: number) {
      const occurrence = route.at(s)!;
      const section = occurrence.section;
      const fork = section.fork;
      if (!fork)
        return lane + (occurrence.incoming ? courseCutLateral(occurrence.incoming.to) - occurrence.lateralOrigin : 0);
      let road =
        locks.get(occurrence)?.from.carriageway ??
        fork.regions[lane < 0 ? 0 : fork.regions.length - 1]!.link.from.carriageway;
      const at = Math.min(
        section.coordinates.domain.end,
        Math.max(section.coordinates.domain.start, routeSectionS(occurrence, s)),
      );
      if (!road.regions.some((b) => b.start.s <= at && b.end.s >= at))
        road = section.carriageways.find((c) => c.regions.some((r) => r.start.s === 0 && r.end.s > 0))!;
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
      const region = courseRegionAt(
        section.regionPartition,
        Math.min(nativeS, section.coordinates.domain.end),
        l,
        occurrence.lateralOrigin,
      );
      return region?.role === 'pavement' && !link.from.carriageway.regions.includes(region)
        ? { s, l: center(link.from.carriageway, nativeS) - occurrence.lateralOrigin }
        : null;
    },
  });
}
