import type { CompiledSection } from '../course/compiler/course-graph.js';
import { createCourseRoute } from '../course/course-route.js';
import { createCourseRouteReaders } from '../course/course-route-readers.js';
import type { CompiledCarriageway } from '../course/course-regions.js';
import { PLAN_PROJECTION_WINDOW_METERS } from '../course/geometry/plan-coordinate.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { RECOVERY_SETTINGS } from './recovery.js';

/** One route, physical readers and loading owner shared by all actors. */
export function createRouteRuntime(
  entry: CompiledSection,
  coverage: {
    readonly cameraDistance: number;
    readonly far: number;
    readonly near: number;
    readonly maximumStepMeters: number;
    readonly contactReachMeters: number;
  },
) {
  const forwardMeters =
    Math.max(coverage.cameraDistance + coverage.far, ENVELOPE_DRIVER.lookahead, PLAN_PROJECTION_WINDOW_METERS) +
    coverage.maximumStepMeters;
  const rearMeters =
    Math.max(
      coverage.cameraDistance + coverage.near,
      RECOVERY_SETTINGS.backtrackDistance + PLAN_PROJECTION_WINDOW_METERS + coverage.contactReachMeters,
    ) + coverage.maximumStepMeters;
  const route = createCourseRoute(entry);
  const readers = createCourseRouteReaders(route);
  const metrics = { routeChanges: 0, routeChangeMaxMilliseconds: 0 };
  let indexed: typeof route.occurrences | null = null;
  let closedCarriageways: readonly CompiledCarriageway[] = Object.freeze([]);
  const refresh = (minS: number, maxS: number) => {
    const started = performance.now();
    route.extendThrough(maxS + forwardMeters);
    route.discardBefore(minS - rearMeters);
    if (indexed !== route.occurrences) {
      indexed = route.occurrences;
      closedCarriageways = Object.freeze(
        route.occurrences.flatMap((occurrence) => {
          const link = occurrence.incoming;
          return link?.from.section.fork
            ? link.from.section.outgoing.filter((other) => other !== link).map((other) => other.from.carriageway)
            : [];
        }),
      );
      metrics.routeChanges += 1;
      metrics.routeChangeMaxMilliseconds = Math.max(metrics.routeChangeMaxMilliseconds, performance.now() - started);
    }
  };
  refresh(0, 0);
  return Object.freeze({
    route,
    readers,
    metrics,
    forwardMeters,
    rearMeters,
    refresh,
    get closedCarriageways() {
      return closedCarriageways;
    },
  });
}
