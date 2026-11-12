import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { courseStartGrid } from '../course/compiler/course-rules.js';
import { resolveLoadingCoverage, type CourseLoadingWindow } from './loading-coverage.js';
import { createRouteRuntime } from './route-runtime.js';
import { gridRouteS } from '../course/course-route.js';

/**
 * One graph assembly for driving every course, including a single Section without Links: the
 * Route runtime, loaded by the one loading coverage record.
 */
export function createCourseWorld(
  section: CompiledSection,
  gates: CompiledCourse['gates'],
  vehicles: readonly CompiledVehicleDefinition[],
  window: CourseLoadingWindow,
) {
  if (!gates?.grid.length) throw new RangeError('Driving requires a compiled start gate with a grid');
  // Every slot a run may start from, of either grid, in the start's Section, which begins the Route.
  const slots = [...courseStartGrid(gates, false), ...courseStartGrid(gates, true)];
  if (Math.min(...slots.map((slot) => slot.at.s)) < window.cameraDistance)
    throw new RangeError('Driving requires the rearmost grid position to have camera space behind it');
  const coverage = resolveLoadingCoverage(window, vehicles);
  // A circuit starting in the Section returning to `section`, its entry, runs that Section first.
  const start = gates.start.outgoing.some((link) => link.to.section === section) ? gates.start : section;
  const runtime = createRouteRuntime(section, start, coverage);
  const stations = slots.map((slot) => gridRouteS(runtime.route, slot));
  runtime.refresh(Math.min(...stations), Math.max(...stations));
  return runtime;
}
