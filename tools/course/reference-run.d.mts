import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import type { CourseGround } from '../../src/course/compiler/course-ground.js';
import type { VehicleCatalogEntry } from '../../src/vehicle/vehicle-catalog.js';
import type { VehicleEnvelope } from '../../src/race/envelope-driver.js';

export function courseReferenceRoutes(course: CompiledCourse): CompiledCourse['links'][number][][];
export function runCourseReference(
  course: CompiledCourse,
  ground: CourseGround,
  entry: Readonly<VehicleCatalogEntry>,
  envelope: VehicleEnvelope,
  route: readonly CompiledCourse['links'][number][],
  lapCount: number,
  capture?: boolean,
): {
  links: string[];
  lapCount: number;
  elapsedSeconds: number;
  events: { landmarkId: string; lap: number; timeSeconds: number; intervalSeconds: number }[];
  metrics: { maximumSpeed: number; maximumLateralUtilization: number; distance: number; recoveries: number };
  trace?: {
    timeSeconds: number;
    sectionId: string;
    lap: number;
    s: number;
    l: number;
    speed: number;
    lateralUtilization: number;
  }[];
};
