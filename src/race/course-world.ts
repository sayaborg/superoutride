import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { ENVELOPE_DRIVER } from './envelope-driver.js';
import { SIM_DT } from './fixed-step.js';
import { createRouteRuntime } from './route-runtime.js';

/** The observer's loading window, supplied by the view that renders the course. */
export interface CourseLoadingWindow {
  readonly cameraDistance: number;
  readonly near: number;
  readonly far: number;
}

/**
 * One graph assembly for driving every course, including a single Section without Links: the
 * Route runtime, loaded for the observer window, the driver lookahead and one fixed step.
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
  // Loading coverage at 240 m/s (864 km/h), not a mechanics speed clamp.
  const maximumStepMeters = 240 * SIM_DT;
  const contactReachMeters = Math.ceil(
    Math.max(
      ...vehicles.flatMap(({ compiledVehicle }) =>
        [compiledVehicle.frontStation, compiledVehicle.rearStation].map((station) =>
          Math.hypot(station.forwardOffset, station.freeReachDown),
        ),
      ),
    ),
  );
  if (
    section.fork &&
    section.fork.lock.s + Math.max(window.far, ENVELOPE_DRIVER.lookahead) + maximumStepMeters >
      section.coordinates.domain.end
  )
    throw new RangeError('Fork parent must cover pre-lock render and driver queries through one fixed step');
  const runtime = createRouteRuntime(section, {
    cameraDistance: window.cameraDistance,
    far: window.far,
    near: window.near,
    maximumStepMeters,
    contactReachMeters,
  });
  runtime.refresh(Math.min(...gates.grid.map((slot) => slot.at.s)), Math.max(...gates.grid.map((slot) => slot.at.s)));
  return runtime;
}
