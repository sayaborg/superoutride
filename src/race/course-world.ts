import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { resolveLoadingCoverage, type CourseLoadingWindow } from './loading-coverage.js';
import { createRouteRuntime } from './route-runtime.js';

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
  if (Math.min(...gates.grid.map((slot) => slot.at.s)) < window.cameraDistance)
    throw new RangeError('Driving requires the rearmost grid position to have camera space behind it');
  const coverage = resolveLoadingCoverage(window, vehicles);
  // Before its lock, a fork's parent Section alone carries the forward coverage.
  const reached = new Set([section]);
  for (const current of reached) {
    const fork = current.fork;
    if (fork && fork.lock.s + coverage.forwardMeters > current.coordinates.domain.end)
      throw new RangeError(`Fork Section ${current.id} must cover its lock plus ${coverage.forwardMeters} m`);
    for (const link of current.outgoing) reached.add(link.to.section);
  }
  const runtime = createRouteRuntime(section, coverage);
  runtime.refresh(Math.min(...gates.grid.map((slot) => slot.at.s)), Math.max(...gates.grid.map((slot) => slot.at.s)));
  return runtime;
}
