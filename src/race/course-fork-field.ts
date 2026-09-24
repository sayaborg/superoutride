import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { CompiledFork, CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import { routeSectionS, type RouteOccurrence } from '../course/course-route.js';
import { courseCutLateral } from '../course/compiler/course-links.js';
import { courseRegionAt, courseBoundaryAt, type CompiledCarriageway } from '../course/course-regions.js';
import type { Vec2 } from '../core/math.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from './world-crossing-gate.js';
import type { createSharedRouteDrivingGraph } from './shared-route-driving-session.js';
type Session = ReturnType<ReturnType<typeof createSharedRouteDrivingGraph>['createSession']>;

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
export function createCourseForkField(sections: readonly CompiledSection[]) {
  const locks = new Map<CompiledFork, CompiledLink>();
  const gates = new Map<CompiledFork, ReturnType<typeof compileWorldCrossingGate>>();
  for (const section of sections) {
    const fork = section.fork;
    if (!fork) continue;
    const pose = section.coordinates.toWorld(fork.lock.s, 0, createPlanCoordinateSample());
    gates.set(
      fork,
      compileWorldCrossingGate({
        id: section.id,
        center: pose,
        heading: pose.heading,
        halfWidth: Math.max(...fork.regions.flatMap((r) => [Math.abs(r.left), Math.abs(r.right)])),
      }),
    );
  }
  const candidates: { fork: CompiledFork; link: CompiledLink; u: number; id: string }[] = [];
  const nativePrevious = { x: 0, z: 0 },
    nativeCurrent = { x: 0, z: 0 };
  const toNative = (occurrence: RouteOccurrence, point: Vec2, out: typeof nativePrevious) => {
    const t = occurrence.sectionFromWorld;
    out.x = t.cosine * point.x + t.sine * point.z + t.translation.x;
    out.z = -t.sine * point.x + t.cosine * point.z + t.translation.z;
    return out;
  };
  return Object.freeze({
    choice: (fork: CompiledFork) => locks.get(fork) ?? null,
    observe(
      motions: readonly {
        readonly id: string;
        readonly session: Session;
        readonly previous: Vec2;
        readonly current: Vec2;
        readonly recovered: boolean;
      }[],
    ) {
      candidates.length = 0;
      for (const motion of motions) {
        const occurrence = motion.session.occurrence,
          fork = occurrence.section.fork;
        if (!fork || locks.has(fork) || motion.recovered) continue;
        const gate = gates.get(fork);
        if (!gate) throw new Error('Field motion must belong to its compiled course');
        const crossing = observeWorldCrossingGate(
          gate,
          toNative(occurrence, motion.previous, nativePrevious),
          toNative(occurrence, motion.current, nativeCurrent),
        );
        if (crossing?.direction !== 'FORWARD') continue;
        const region = fork.regions.find((r) => crossing.lateral >= r.left && crossing.lateral < r.right);
        if (region) candidates.push({ fork, link: region.link, u: crossing.u, id: motion.id });
      }
      candidates.sort((a, b) => a.u - b.u || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const candidate of candidates) {
        if (locks.has(candidate.fork)) continue;
        const prepared = motions
          .filter((m) => m.session.occurrence.section === candidate.fork.section)
          .map((m) => m.session.prepareChoice(candidate.link));
        prepared.forEach((p) => p.commit());
        locks.set(candidate.fork, candidate.link);
      }
    },
    targetL(occurrence: RouteOccurrence, s: number, lane: number) {
      const section = occurrence.section;
      const fork = section.fork;
      if (!fork)
        return lane + (occurrence.incoming ? courseCutLateral(occurrence.incoming.to) - occurrence.lateralOrigin : 0);
      let road =
        locks.get(fork)?.from.carriageway ??
        fork.regions[lane < 0 ? 0 : fork.regions.length - 1]!.link.from.carriageway;
      const at = Math.min(
        section.coordinates.domain.end,
        Math.max(section.coordinates.domain.start, routeSectionS(occurrence, s)),
      );
      if (!road.regions.some((b) => b.start.s <= at && b.end.s >= at))
        road = section.carriageways.find((c) => c.regions.some((r) => r.start.s === 0 && r.end.s > 0))!;
      return center(road, at) - occurrence.lateralOrigin;
    },
    legalTarget(session: Session, s: number, l: number) {
      const occurrence = session.occurrence,
        section = occurrence.section,
        fork = section.fork;
      const link = fork && locks.get(fork);
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
