import type { CompiledFork, CompiledLink, CompiledSection } from '../compiler/course-graph.js';
import { courseBandAt, courseBoundaryAt, type CompiledCarriageway } from '../course/course-bands.js';
import { guidePathToWorld } from '../core/guide-curve.js';
import type { Vec2 } from '../core/math.js';
import { compileWorldCrossingGate, observeWorldCrossingGate } from '../gameplay/world-crossing-gate.js';
import type { createCourseDrivingGraph } from './course-driving-session.js';
type Session = ReturnType<ReturnType<typeof createCourseDrivingGraph>['createSession']>;

function center(road: CompiledCarriageway, s: number) {
  const bands = road.bands.filter((b) => b.start.s <= s && b.end.s >= s);
  return (
    (Math.min(...bands.map((b) => courseBoundaryAt(b.left, s))) +
      Math.max(...bands.map((b) => courseBoundaryAt(b.right, s)))) /
    2
  );
}

/** One field authority observes every eligible motion before publishing any irreversible choice. */
export function createCourseForkField() {
  const locks = new Map<CompiledFork, CompiledLink>();
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
      const candidates = motions
        .flatMap((motion) => {
          const fork = motion.session.history.active.section.fork;
          if (!fork || locks.has(fork) || motion.recovered) return [];
          const pose = guidePathToWorld(fork.section.guide, fork.lock.s, 0);
          const gate = compileWorldCrossingGate({
            id: fork.section.id,
            center: pose,
            heading: pose.heading,
            halfWidth: Math.max(...fork.regions.flatMap((r) => [Math.abs(r.left), Math.abs(r.right)])),
          });
          const crossing = observeWorldCrossingGate(gate, motion.previous, motion.current);
          if (crossing?.direction !== 'FORWARD') return [];
          const region = fork.regions.find((r) => crossing.lateral >= r.left && crossing.lateral < r.right);
          return region ? [{ fork, link: region.link, u: crossing.u, id: motion.id }] : [];
        })
        .sort((a, b) => a.u - b.u || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
      if (!road.bands.some((b) => b.start.s <= at && b.end.s >= at))
        road = section.ports.find((p) => p.kind === 'entry')!.carriageway;
      return center(road, at);
    },
    legalTarget(session: Session, s: number, l: number) {
      const section = session.history.active.section,
        fork = section.fork;
      const link = fork && locks.get(fork);
      if (!fork || !link || s < fork.closure.s) return null;
      const band = courseBandAt(section.bandPartition, Math.min(s, section.raster.length), l);
      return band?.role === 'pavement' && !link.source.carriageway.bands.includes(band)
        ? { s, l: center(link.source.carriageway, s) }
        : null;
    },
  });
}
