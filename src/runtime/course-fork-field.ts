import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import type { CompiledFork, CompiledLink, CompiledSection } from '../course/compiler/course-graph.js';
import { courseRegionAt, courseBoundaryAt, type CompiledCarriageway } from '../course/course-regions.js';
import { guidePathToWorld } from '../course/geometry/guide-curve.js';
import type { Vec2 } from '../core/math.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from '../gameplay/world-crossing-gate.js';
import type { createCourseDrivingGraph } from './course-driving-session.js';
type Session = ReturnType<ReturnType<typeof createCourseDrivingGraph>['createSession']>;

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
    const pose = guidePathToWorld(section.guide, fork.lock.s, 0, createPlanarCoordinateSample());
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
        const fork = motion.session.history.active.section.fork;
        if (!fork || locks.has(fork) || motion.recovered) continue;
        const gate = gates.get(fork);
        if (!gate) throw new Error('Field motion must belong to its compiled course');
        const crossing = observeWorldCrossingGate(gate, motion.previous, motion.current);
        if (crossing?.direction !== 'FORWARD') continue;
        const region = fork.regions.find((r) => crossing.lateral >= r.left && crossing.lateral < r.right);
        if (region) candidates.push({ fork, link: region.link, u: crossing.u, id: motion.id });
      }
      candidates.sort((a, b) => a.u - b.u || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const candidate of candidates) {
        if (locks.has(candidate.fork)) continue;
        const prepared = motions
          .filter((m) => m.session.history.active.section === candidate.fork.section)
          .map((m) => m.session.prepareChoice(candidate.link));
        prepared.forEach((p) => p.commit());
        locks.set(candidate.fork, candidate.link);
      }
    },
    targetL(section: CompiledSection, s: number, lane: number) {
      const fork = section.fork;
      if (!fork) return lane;
      let road =
        locks.get(fork)?.source.carriageway ??
        fork.regions[lane < 0 ? 0 : fork.regions.length - 1]!.link.source.carriageway;
      const at = Math.min(section.raster.length, Math.max(0, s));
      if (!road.regions.some((b) => b.start.s <= at && b.end.s >= at))
        road = section.ports.find((p) => p.kind === 'entry')!.carriageway;
      return center(road, at);
    },
    legalTarget(session: Session, s: number, l: number) {
      const section = session.history.active.section,
        fork = section.fork;
      const link = fork && locks.get(fork);
      if (!fork || !link || s < fork.closure.s) return null;
      const region = courseRegionAt(section.regionPartition, Math.min(s, section.raster.length), l);
      return region?.role === 'pavement' && !link.source.carriageway.regions.includes(region)
        ? { s, l: center(link.source.carriageway, s) }
        : null;
    },
  });
}
