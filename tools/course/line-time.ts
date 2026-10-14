import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { courseStartGrid } from '../../src/course/compiler/course-rules.js';
import { enumerateCourseRoutes } from '../../src/course/compiler/course-routes.js';
import type { CompiledVehicleDefinition } from '../../src/vehicle/definition-document.js';
import type { RacingLines } from '../../src/content/racing-line.js';
import type { RunVehicle } from '../../src/content/run-vehicle.js';
import { createRunMechanics } from '../../src/race/run-setup.js';
import { compilePlannedDriver, createPlannedDriverWorkspace, plannedNode } from '../../src/race/planned-driver.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { referenceLine } from './reference-driving-policy.js';

/**
 * The time a planned driver at `utilization` takes along `course`'s racing lines `lines` in `vehicle`, by its own speed
 * plan alone: from rest at the last slot of the grid the vehicle starts from, stepping from each node of the plan to
 * the next at the speeds it allows, as a driver that kept its plan exactly would. On a CIRCUIT it is the second lap
 * (from the first finish line crossing to the second), else the sum over every route of the time to its FINISH. The
 * vehicle's dynamics, steering and capacity correction take no part.
 */
export function plannedLineSeconds(
  course: CompiledCourse,
  lines: RacingLines,
  vehicle: RunVehicle,
  catalog: readonly CompiledVehicleDefinition[],
  utilization: number,
): number {
  const { model, limits, speedCap } = createRunMechanics(vehicle);
  const driver = compilePlannedDriver(model, limits, utilization, speedCap, false);
  const grid = courseStartGrid(course.gates, vehicle.vehicleDefinition.listing.form === 'bike');
  const finishes = new Map(
    course.gates.intervals.flatMap((interval) => (interval.finish ? [[interval.section, interval.finish.at.s]] : [])),
  );
  const crossings = course.type === 'CIRCUIT' ? 2 : 1;
  let total = 0;
  for (const route of enumerateCourseRoutes(course.entry, course.type)) {
    const { runtime } = createCourseScene(course.entry, course.gates, catalog);
    const planned = new Map(route.map((link) => [link.from.section, link]));
    const lane = referenceLine(runtime.route, lines, (occurrence) =>
      occurrence.section.fork!.exits.findIndex((exit) => exit.link === planned.get(occurrence.section)),
    );
    const workspace = createPlannedDriverWorkspace();
    const node = { s: 0, distance: 0, speed: 0 };
    const times: number[] = [];
    let s = grid.at(-1)!.at.s,
      speed = 0,
      seconds = 0,
      indexed = 0;
    const stations: number[] = [];
    while (times.length < crossings) {
      runtime.refresh(s, s);
      // The route's planned exit at each fork it reaches.
      for (let last = runtime.route.occurrences.at(-1)!; last.section.fork; last = runtime.route.occurrences.at(-1)!) {
        const link = planned.get(last.section);
        if (!link) throw new RangeError(`${course.id}: no planned exit at ${last.section.id}`);
        runtime.selectSuccessor(link);
        runtime.refresh(s, s);
      }
      // The finish line stations of the occurrences appended since.
      for (const occurrences = runtime.route.occurrences; indexed < occurrences.length; indexed++) {
        const occurrence = occurrences[indexed]!;
        const finish = finishes.get(occurrence.section);
        if (finish !== undefined) stations.push(occurrence.start + finish);
      }
      const next = plannedNode(runtime.readers, s, speed, driver, lane, workspace, runtime.window, true, node);
      const step = next && (2 * next.distance) / (speed + next.speed);
      if (!next || !(step! > 0 && Number.isFinite(step))) throw new RangeError(`${course.id}: the plan stops short`);
      for (const station of stations)
        if (station > s && station <= next.s) times.push(seconds + (step! * (station - s)) / (next.s - s));
      seconds += step!;
      s = next.s;
      speed = next.speed;
    }
    total += course.type === 'CIRCUIT' ? times[1]! - times[0]! : times[0]!;
  }
  return total;
}
