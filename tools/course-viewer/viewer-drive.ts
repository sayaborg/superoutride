import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CompiledSection } from '../../src/course/compiler/course-graph.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { CompiledLane } from '../../src/course/course-lanes.js';
import { createCourseRoute, routeSectionS, type RouteOccurrence } from '../../src/course/course-route.js';
import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { createCourseForkField, roomy } from '../../src/race/course-fork-field.js';
import { PATH_OFFSET, pathOffsetAt, type LaneIntent } from '../../src/race/lane-following.js';
import { createRouteCrossSections } from '../../src/race/route-cross-sections.js';

/**
 * The viewer's drive: one car going along a lane of the Route, the camera riding on it. The car keeps to its lane's
 * centre as the race carries a driver's lane along the Route (`createCourseForkField`'s `carry` and `targetL`: across
 * each seam the lane continues), at each fork taking the first exit as the course map does; where its lane ends ahead
 * (narrower than the car, or a seam it does not continue across) it moves to the lane beside it that continues, as a
 * driver's path offset moves, by a cosine blend over `max(PATH_OFFSET.blendLeast, speed · PATH_OFFSET.blendSeconds)`.
 */

/** Metres: the car's width; a lane narrower than it ends for it. */
export const CAR_WIDTH = 1.8;
/** Metres along the road over which the car's heading is read from its lateral's change. */
const HEADING_STEP = 0.5;

/** A car's place: its route station, its lane's intent and, while it moves to another lane, the blend toward it. */
export interface Car {
  s: number;
  readonly intent: LaneIntent;
  blend: { readonly from: number; readonly to: number; readonly at: number; readonly length: number } | null;
}

/** Where a car stands: its occurrence, its native station and lateral, its world point, heading and grade. */
export interface CarPose {
  readonly occurrence: RouteOccurrence;
  readonly s: number;
  readonly l: number;
  /** World x and z (not relative to the layout's origin) and the road's height there. */
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** World yaw, along its lane. */
  readonly heading: number;
  /** dY/ds of the road there. */
  readonly grade: number;
}

// A Section's lanes, left to right, medians not counted: the race's lane indices.
const lanesOf = (section: CompiledSection): CompiledLane[] =>
  section.lanes.elements.flatMap((element) => (element.kind === 'lane' ? [element.lane] : []));

export function createDrive(course: CompiledCourse) {
  // The Route, taking each fork's first exit, extended as the car goes (lap after lap on a circuit).
  const builder = createCourseRoute(course.entry);
  const { route } = builder;
  const extend = (s: number) => {
    while (route.end < s) {
      const outgoing = route.occurrences.at(-1)!.section.outgoing;
      if (!outgoing.length) break;
      builder.select(outgoing[0]!);
    }
  };
  const forks = createCourseForkField(route, createRouteCrossSections(route, course, null), builder.select);
  const sample = createPlanCoordinateSample();
  const firstExit = () => 0;
  // The occurrence at route station s, and its native station.
  const place = (s: number) => {
    extend(s);
    const occurrence = route.at(Math.min(route.end, Math.max(0, s)))!;
    return { occurrence, at: Math.min(occurrence.end - occurrence.start, Math.max(0, routeSectionS(occurrence, s))) };
  };
  // The car's route lateral at route station s.
  const lateral = (car: Car, s: number) => forks.targetL(s, car.intent) + (car.blend ? pathOffsetAt(car.blend, s) : 0);

  return Object.freeze({
    /** Where the Route ends (a circuit's never), once extended through `s`. */
    end(s: number): number | null {
      extend(s);
      return route.terminal;
    },
    /** The lanes at route station s: each its index, its centre's native lateral and its width. */
    lanesAt(s: number) {
      const { occurrence, at } = place(s);
      return lanesOf(occurrence.section).map((lane, index) => ({
        index,
        l: courseBoundaryAt(lane.center, at),
        width: courseBoundaryAt(lane.width, at),
      }));
    },
    /** The lane at route station s nearest the centreline that has room for the car (or any, where none has). */
    nearestLane(s: number): number {
      const lanes = this.lanesAt(s).filter((lane) => roomy(lane.width));
      const fitting = lanes.filter((lane) => roomy(lane.width, CAR_WIDTH));
      const candidates = fitting.length ? fitting : lanes;
      return candidates.reduce((best, lane) => (Math.abs(lane.l) < Math.abs(best.l) ? lane : best)).index;
    },
    /** A car at route station s in lane `lane` (an index of `lanesAt(s)`). */
    car(s: number, lane: number): Car {
      extend(s);
      return { s, intent: { lane, at: s, exit: firstExit, width: CAR_WIDTH }, blend: null };
    },
    /**
     * The car moved `distance` metres on, carrying its lane, at `speed` metres a second (for its blends); false where
     * the Route has ended.
     */
    advance(car: Car, distance: number, speed: number): boolean {
      const length = Math.max(PATH_OFFSET.blendLeast, speed * PATH_OFFSET.blendSeconds);
      const next = car.s + distance;
      extend(next + length);
      const terminal = route.terminal;
      car.s = terminal === null ? next : Math.min(next, terminal);
      forks.carry(car.intent, car.s);
      if (car.blend && car.s >= car.blend.at + car.blend.length) car.blend = null;
      // Its lane ending within a blend's length ahead: move to the lane beside it that continues.
      const end = car.blend ? null : forks.laneEnd(car.s, car.s + length, car.intent);
      if (end && end.merge !== null) {
        const from = lateral(car, car.s);
        car.intent.lane = end.merge;
        car.intent.at = car.s;
        car.blend = { from: from - forks.targetL(car.s, car.intent), to: 0, at: car.s, length };
      }
      return terminal === null || car.s < terminal;
    },
    /** Where the car stands now. */
    pose(car: Car): CarPose {
      const { occurrence, at } = place(car.s);
      const section = occurrence.section;
      const l = lateral(car, car.s) + occurrence.lateralOrigin;
      const world = transformPlanarPoint(occurrence.worldFromSection, section.coordinates.toWorld(at, l, sample));
      const native = section.coordinates.toWorld(at, 0, sample).heading;
      // Its heading turns from the road's by the slope of its lateral along it.
      const drift = (lateral(car, car.s + HEADING_STEP) - lateral(car, car.s)) / HEADING_STEP;
      return {
        occurrence,
        s: at,
        l,
        x: world.x,
        z: world.z,
        y: section.height.sample(at),
        heading: native + occurrence.rotation + Math.atan(drift),
        grade: section.height.sampleDifferential(at).dYdS,
      };
    },
  });
}

export type Drive = ReturnType<typeof createDrive>;
