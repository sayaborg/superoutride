import { createPlanCoordinateSample } from '../../src/course/geometry/plan-coordinate.js';
import { courseBoundaryAt } from '../../src/course/course-boundaries.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { createSessionVehicle } from '../../src/content/session-vehicle.js';
import { createVehicleModel } from '../../src/vehicle/physics/vehicle-model.js';
import { createVehicle } from '../../src/vehicle/physics/vehicle-physics.js';
import { SIM_DT } from '../../src/race/fixed-step.js';
import { createCourseScene } from '../../src/view/course-scene.js';
import { createRenderMeasurements, type RenderMeasurements } from '../../src/view/renderer.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createLogicalFrame } from '../../src/view/display-scale.js';
import { createVehicleSprites } from '../../src/view/vehicle-sprites.js';
import type { CompiledContent } from './compile-content.js';

/**
 * Views of a compiled course for its authors, free of Node and the DOM: a Section's numeric report and the game's
 * frame at a position. The course command writes them as files; the workbench's compile worker answers queries with
 * them. Arguments outside their domain throw a `RangeError`.
 */

type CompiledSection = CompiledCourse['sections'][number];

export interface CourseReport {
  course: string;
  section: string;
  lengthMeters: number;
  identity: CompiledCourse['identity'];
  boundaries: string[];
  samples: {
    s: number;
    curvaturePerMeter: number;
    heightMeters: number;
    x: number;
    z: number;
    boundaries: (number | null)[];
  }[];
  sprites: { s: number; l: number; asset: string; state: string | null }[];
  environments: { s: number; name: string }[];
  segments: { index: number; kind: string; start: number; end: number }[];
}

/** Stations at most a report samples regularly. */
const REPORT_STATIONS = 4096;

/**
 * A Section's numeric report: plan position, curvature, height and every Boundary's lateral position at each `step`
 * metres and at every geometry, height and Boundary knot station; its sprites, environments and plan segments.
 */
export function courseReport(course: CompiledCourse, section: CompiledSection, step = 10): CourseReport {
  if (!(step >= 0.01 && step <= 100000)) throw new RangeError('Report step must be 0.01 to 100000 m');
  const length = section.coordinates.domain.end;
  if (Math.ceil(length / step) > REPORT_STATIONS) throw new RangeError('Report is limited to 4096 regular stations');
  const stations = [
    ...new Set([
      0,
      length,
      ...Array.from({ length: Math.ceil(length / step) }, (_, i) => i * step),
      ...section.height.knots.map((n) => n.s),
      ...section.segments.flatMap((p) => [p.sStart, p.sEnd]),
      ...section.height.knots.flatMap((n) => [n.s - n.curveLength / 2, n.s + n.curveLength / 2]),
      ...section.boundaries.flatMap((b) => b.vertices.map((k) => k.at.s)),
    ]),
  ].sort((a, b) => a - b);
  const metric = { curvature: 0, offsetMetric: 1 };
  const samples = stations.map((s) => {
    const world = section.coordinates.toWorld(s, 0, createPlanCoordinateSample());
    return {
      s,
      curvaturePerMeter: section.coordinates.metricsAt(s, 0, metric).curvature,
      heightMeters: section.height.sample(s),
      x: world.x,
      z: world.z,
      boundaries: section.boundaries.map((b) =>
        s < b.vertices[0]!.at.s || s > b.vertices.at(-1)!.at.s ? null : courseBoundaryAt(b, s),
      ),
    };
  });
  return {
    course: course.id,
    section: section.id,
    lengthMeters: length,
    identity: course.identity,
    boundaries: section.boundaries.map((b) => b.id),
    samples,
    sprites: section.appearance.sprites.map((p) => ({
      s: p.at.s,
      l: p.l,
      asset: p.instance.asset.image.name,
      state: p.unselectedCarriagewayId,
    })),
    environments: section.appearance.environments.map((e) => ({ s: e.at.s, name: e.name })),
    segments: section.segments.map((p) => ({ index: p.index, kind: p.geometry.kind, start: p.sStart, end: p.sEnd })),
  };
}

/** One rendered frame: the logical frame's RGB555 pixels and where the vehicle stood. */
export interface CourseFrame {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint16Array;
  readonly section: string;
  readonly s: number;
  readonly l: number;
  readonly vehicle: string;
  readonly stats: RenderMeasurements;
}

/**
 * The game's frame of a Section through the product scene and renderer: a catalog vehicle (the first unless named)
 * standing at rest at a position, the camera behind it. With `exit`, the route takes that outgoing Link, its window
 * refreshed through `through` metres. One renderer draws any number of positions on its one scene.
 */
export function createCourseFrameRenderer(
  content: Pick<CompiledContent, 'definitions'>,
  course: CompiledCourse,
  section: CompiledSection,
  {
    vehicle: vehicleId,
    exit,
    through = 0,
  }: { readonly vehicle?: string; readonly exit?: string; readonly through?: number } = {},
) {
  const { definitions } = content;
  const entry = vehicleId
    ? definitions.vehicles.find((e) => e.compiledVehicle.id === vehicleId)
    : definitions.vehicles[0];
  if (!entry) throw new RangeError('Unknown vehicle');
  const sprites = createVehicleSprites(entry);
  const scene = createCourseScene(section, course.gates, definitions.vehicles);
  if (exit !== undefined) {
    const link = section.outgoing.find((candidate) => candidate.id === exit);
    if (!link) throw new RangeError('Exit must name a canonical outgoing Link');
    scene.runtime.selectSuccessor(link);
    scene.runtime.refresh(0, through);
  }
  return {
    render(s: number, l: number): CourseFrame {
      if (!(s >= 0 && s <= section.coordinates.domain.end)) throw new RangeError('s is outside the Section');
      if (!(l >= -1000 && l <= 1000)) throw new RangeError('l must be -1000 to 1000 m');
      const vehicle = createVehicle(
        createVehicleModel(createSessionVehicle(entry, definitions.driving), SIM_DT),
        scene.world,
        { s, l, initialSpeed: 0 },
      );
      const camera = updateCamera(createCameraRig(), scene.world, vehicle, CAMERA_DEFINITION),
        target = createLogicalFrame();
      const stats = createRenderMeasurements();
      scene.render(target, vehicle, camera, sprites.off, [], [], stats);
      return {
        width: target.width,
        height: target.height,
        pixels: target.pixels,
        section: section.id,
        s: vehicle.course.s,
        l: vehicle.course.l,
        vehicle: entry.compiledVehicle.id,
        stats,
      };
    },
  };
}

/** A course's Section by ID, or the entry Section. */
export function courseSection(course: CompiledCourse, id?: string): CompiledSection {
  const section = id === undefined ? course.entry : course.sections.find((candidate) => candidate.id === id);
  if (!section) throw new RangeError('Unknown Section');
  return section;
}
