import type { CompiledSection } from '../course/compiler/course-graph.js';
import { createCourseRoute, createRouteWindow } from '../course/course-route.js';
import { createCourseRouteReaders } from '../course/course-route-readers.js';
import type { LoadingCoverage } from './loading-coverage.js';

/**
 * The shared Route's owner and the resident window's only owner: it extends the append-only Route,
 * advances the window over it and builds the physical readers on the window. Consumers read the
 * Route or the window; only the fork decider receives `selectSuccessor`.
 */
export function createRouteRuntime(entry: CompiledSection, coverage: LoadingCoverage) {
  const builder = createCourseRoute(entry);
  const { route } = builder;
  const resident = createRouteWindow(route);
  const { window } = resident;
  const readers = createCourseRouteReaders(window);
  const refresh = (minS: number, maxS: number) => {
    builder.extendThrough(maxS + coverage.forwardMeters);
    resident.retainFrom(minS - coverage.rearMeters);
  };
  refresh(0, 0);
  return Object.freeze({
    route,
    window,
    /** The fork decider's selection authority; no other consumer appends to the Route. */
    selectSuccessor: builder.select,
    readers,
    coverage,
    refresh,
  });
}
