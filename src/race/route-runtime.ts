import type { CompiledSection } from '../course/compiler/course-graph.js';
import { createCourseRoute, createRouteWindow } from '../course/course-route.js';
import { createCourseRouteReaders } from '../course/course-route-readers.js';
import type { CompiledCarriageway } from '../course/course-boundaries.js';
import { PLAN_PROJECTION_WINDOW_METERS } from '../course/geometry/plan-coordinate.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { RECOVERY_SETTINGS } from './recovery.js';

/**
 * The shared Route's owner and the resident window's only owner: it extends the append-only Route,
 * advances the window over it and builds the physical readers on the window. Consumers read the
 * Route or the window; only the fork decider receives `selectSuccessor`.
 */
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
  const builder = createCourseRoute(entry);
  const { route } = builder;
  const resident = createRouteWindow(route);
  const { window } = resident;
  const readers = createCourseRouteReaders(window);
  const metrics = { routeChanges: 0, routeChangeMaxMilliseconds: 0 };
  let indexed: typeof window.occurrences | null = null;
  let closedCarriageways: readonly CompiledCarriageway[] = Object.freeze([]);
  const refresh = (minS: number, maxS: number) => {
    const started = performance.now();
    builder.extendThrough(maxS + forwardMeters);
    resident.retainFrom(minS - rearMeters);
    if (indexed !== window.occurrences) {
      indexed = window.occurrences;
      closedCarriageways = Object.freeze(
        indexed.flatMap((occurrence) => {
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
    window,
    /** The fork decider's selection authority; no other consumer appends to the Route. */
    selectSuccessor: builder.select,
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
