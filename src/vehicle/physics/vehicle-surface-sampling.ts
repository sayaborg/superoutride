import {
  createPlanProjectionWorkspace,
  createPlanCoordinateSample,
  type PlanCoordinateReader,
  type PlanCoordinateProjection,
} from '../../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../../course/geometry/profile.js';
import type { SurfaceMapReader } from '../../course/vehicle-world.js';
import type { SurfaceMaterial } from '../../course/surface-material.js';
import { add3, normalize3, scale3, WORLD_UP, type Vec3 } from '../../core/vector3.js';

export interface SurfaceGeometryObservation {
  readonly coordinate: PlanCoordinateProjection;
  readonly point: Vec3;
  readonly horizontalTangent: Vec3;
  readonly right: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly curvature: number;
  readonly offsetMetric: number;
  readonly heightDerivativeByS: number;
  readonly gradeAngle: number;
  readonly material: SurfaceMaterial | null;
}

const vector = () => ({ x: 0, y: 0, z: 0 });

/** Private per-consumer temporaries; only value is the ordinary observation. */
export function createSurfaceGeometryWorkspace() {
  return {
    value: {
      coordinate: { s: 0, l: 0, inDomain: false },
      point: vector(),
      horizontalTangent: vector(),
      right: vector(),
      tangent: vector(),
      normal: vector(),
      curvature: 0,
      offsetMetric: 1,
      heightDerivativeByS: 0,
      gradeAngle: 0,
      material: null as SurfaceMaterial | null,
    },
    planSample: createPlanCoordinateSample(),
    projection: createPlanProjectionWorkspace(),
    height: { y: 0, dYdS: 0 },
    metrics: { curvature: 0, offsetMetric: 1 },
    a: vector(),
    b: vector(),
  };
}

export function sampleSurfaceGeometryAtCoordinate(
  coordinates: PlanCoordinateReader,
  height: ProfileReader,
  surfaces: SurfaceMapReader,
  coordinate: PlanCoordinateProjection,
  workspace: ReturnType<typeof createSurfaceGeometryWorkspace>,
): SurfaceGeometryObservation {
  const out = workspace.value;
  const planSample = coordinates.toWorld(coordinate.s, coordinate.l, workspace.planSample);
  const { curvature, offsetMetric } = coordinates.metricsAt(coordinate.s, coordinate.l, workspace.metrics);
  const heightSample = height.sampleDifferential(coordinate.s, workspace.height);
  const heightDerivativeByS = heightSample.dYdS;
  const horizontalTangent = out.horizontalTangent,
    right = out.right;
  horizontalTangent.x = Math.sin(planSample.heading);
  horizontalTangent.y = 0;
  horizontalTangent.z = Math.cos(planSample.heading);
  right.x = Math.cos(planSample.heading);
  right.y = 0;
  right.z = -Math.sin(planSample.heading);
  normalize3(
    add3(
      scale3(horizontalTangent, offsetMetric, workspace.a),
      scale3(WORLD_UP, heightDerivativeByS, workspace.b),
      workspace.a,
    ),
    out.tangent,
  );
  normalize3(
    add3(
      scale3(horizontalTangent, -heightDerivativeByS, workspace.a),
      scale3(WORLD_UP, offsetMetric, workspace.b),
      workspace.a,
    ),
    out.normal,
  );
  const material = surfaces.sample(coordinate.s, coordinate.l);
  out.coordinate = coordinate;
  out.point.x = planSample.x;
  out.point.y = heightSample.y;
  out.point.z = planSample.z;
  out.curvature = curvature;
  out.offsetMetric = offsetMetric;
  out.heightDerivativeByS = heightDerivativeByS;
  out.gradeAngle = Math.atan2(heightDerivativeByS, offsetMetric);
  out.material = material;
  return out;
}
