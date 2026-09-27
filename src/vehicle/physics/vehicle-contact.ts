import type { PlanCoordinateReader } from '../../course/geometry/plan-coordinate.js';
import { type Writable } from '../../core/writable.js';
import type { ProfileReader } from '../../course/geometry/profile.js';
import type { SurfaceMapReader } from '../../course/vehicle-world.js';
import {
  add3,
  cross3,
  dot3,
  magnitude3,
  normalize3,
  rotateAroundAxis,
  scale3,
  sub3,
  WORLD_UP,
  type Vec3,
} from '../../core/vector3.js';
import type { BodyKinematics } from './vehicle-state.js';
import {
  createSurfaceGeometryWorkspace,
  sampleSurfaceGeometryAtCoordinate,
  type SurfaceGeometryObservation,
} from './vehicle-surface-sampling.js';
import { suspensionForce, type CompiledContactStation, type VehicleContactId } from './vehicle-suspension.js';

// Dimensionless projected unit-vector length: normalization gain is limited to 10^8.
// O(eps) projection error can amplify to O(10^-8); smaller directions cannot define a tire frame.
const MIN_PROJECTED_TIRE_DIRECTION_LENGTH = 1e-8;

const vector = () => ({ x: 0, y: 0, z: 0 });

export interface ContactObservation {
  readonly id: VehicleContactId;
  readonly station: CompiledContactStation;
  readonly surface: SurfaceGeometryObservation;
  readonly supportAvailable: boolean;
  readonly withinReach: boolean;
  readonly forceTransmitting: boolean;
  readonly tireFrameValid: boolean;
  readonly wheelForward: Vec3;
  readonly wheelAxis: Vec3;
  readonly reachPoint: Vec3;
  readonly contactPoint: Vec3;
  readonly reachVelocity: Vec3;
  readonly gap: number;
  readonly q: number;
  readonly qDot: number;
  readonly normalLoad: number;
  readonly effectiveRollingRadius: number;
  readonly tireForward: Vec3;
  readonly tireRight: Vec3;
  readonly longitudinalVelocity: number;
  readonly lateralVelocity: number;
}

export function createContactWorkspace(station: CompiledContactStation) {
  const surface = createSurfaceGeometryWorkspace();
  return {
    surface,
    a: vector(),
    b: vector(),
    freeOffset: vector(),
    value: {
      id: station.id,
      station,
      surface: surface.value,
      supportAvailable: false,
      withinReach: false,
      forceTransmitting: false,
      tireFrameValid: false,
      wheelForward: vector(),
      wheelAxis: vector(),
      reachPoint: vector(),
      contactPoint: vector(),
      reachVelocity: vector(),
      gap: 0,
      q: 0,
      qDot: 0,
      normalLoad: 0,
      effectiveRollingRadius: station.rollingRadius,
      tireForward: vector(),
      tireRight: vector(),
      longitudinalVelocity: 0,
      lateralVelocity: 0,
    },
  };
}
type ContactWorkspace = ReturnType<typeof createContactWorkspace>;

/** One ordinary contact solve; reusable storage changes no physical operation. */
export function deriveContactObservation(
  coordinates: PlanCoordinateReader,
  height: ProfileReader,
  surfaces: SurfaceMapReader,
  body: BodyKinematics,
  station: CompiledContactStation,
  suspensionProgression: number,
  steerAngle: number,
  previousS: number,
  workspace: ContactWorkspace,
): ContactObservation {
  const { value: out, a, b, freeOffset } = workspace;
  add3(scale3(body.forward, station.forwardOffset, a), scale3(body.up, -station.freeReachDown, b), freeOffset);
  const reachPoint = add3(body.position, freeOffset, out.reachPoint);
  const coordinate = coordinates.locateLocal(
    reachPoint,
    previousS,
    workspace.surface.value.coordinate,
    workspace.surface.projection,
  );
  if (!coordinate.inDomain) {
    // There is no surface to sample. Clear the borrowed contact from the preceding substep.
    const surface = workspace.surface.value;
    surface.material = null;
    surface.curvature = surface.heightDerivativeByS = surface.gradeAngle = 0;
    surface.offsetMetric = 1;
    scale3(WORLD_UP, 0, surface.point);
    scale3(WORLD_UP, 0, surface.horizontalTangent);
    scale3(WORLD_UP, 0, surface.right);
    scale3(WORLD_UP, 0, surface.tangent);
    scale3(WORLD_UP, 0, surface.normal);
    out.supportAvailable = out.withinReach = out.forceTransmitting = false;
    out.gap = out.q = out.qDot = out.normalLoad = 0;
    out.effectiveRollingRadius = station.rollingRadius;
    Object.assign(out.contactPoint, reachPoint);
    add3(body.velocity, cross3(body.omegaWorld, freeOffset, a), out.reachVelocity);
    contactTireFrame(body, steerAngle, surface, out.reachVelocity, out, a);
    return out;
  }
  sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, coordinate, workspace.surface);
  const surface = workspace.surface.value;
  const reachVelocity = add3(body.velocity, cross3(body.omegaWorld, freeOffset, a), out.reachVelocity);
  const gap = dot3(sub3(reachPoint, surface.point, a), surface.normal);
  const supportAvailable = surface.material !== null;
  const withinReach = supportAvailable && dot3(body.up, surface.normal) > 0 && gap <= 0;
  const q = withinReach ? -gap : 0;
  const qDot = withinReach ? -dot3(reachVelocity, surface.normal) : 0;
  const normalLoad = withinReach ? Math.max(0, suspensionForce(q, qDot, station.suspension, suspensionProgression)) : 0;
  sub3(reachPoint, scale3(surface.normal, gap, a), out.contactPoint);
  out.id = station.id;
  out.station = station;
  out.surface = surface;
  out.supportAvailable = supportAvailable;
  out.withinReach = withinReach;
  out.forceTransmitting = normalLoad > 0;
  out.gap = gap;
  out.q = q;
  out.qDot = qDot;
  out.normalLoad = normalLoad;
  out.effectiveRollingRadius = station.rollingRadius;
  contactTireFrame(body, steerAngle, surface, reachVelocity, out, a);
  return out;
}

/** Output belongs to this contact's consumer. */
export function reorientContactObservation(
  contact: ContactObservation,
  body: BodyKinematics,
  steerAngle: number,
  workspace: ContactWorkspace,
): ContactObservation {
  const out = workspace.value;
  if (out !== contact)
    Object.assign(out, contact, {
      wheelForward: out.wheelForward,
      wheelAxis: out.wheelAxis,
      tireForward: out.tireForward,
      tireRight: out.tireRight,
    });
  contactTireFrame(body, steerAngle, contact.surface, contact.reachVelocity, out, workspace.a);
  return out;
}

function contactTireFrame(
  body: BodyKinematics,
  steerAngle: number,
  surface: SurfaceGeometryObservation,
  reachVelocity: Vec3,
  out: Pick<
    ContactWorkspace['value'],
    | 'wheelForward'
    | 'wheelAxis'
    | 'tireFrameValid'
    | 'tireForward'
    | 'tireRight'
    | 'longitudinalVelocity'
    | 'lateralVelocity'
  >,
  scratch: Writable<Vec3>,
) {
  // Rotation about the unit up axis orthogonal to forward preserves length; rebuilt from forward every substep.
  rotateAroundAxis(body.forward, body.up, steerAngle, out.wheelForward);
  const wheelForward = out.wheelForward;
  normalize3(cross3(body.up, wheelForward, out.wheelAxis), out.wheelAxis);
  const tireForwardRaw = sub3(
    wheelForward,
    scale3(surface.normal, dot3(wheelForward, surface.normal), scratch),
    scratch,
  );
  const tireFrameValid =
    surface.coordinate.inDomain && magnitude3(tireForwardRaw) > MIN_PROJECTED_TIRE_DIRECTION_LENGTH;
  if (tireFrameValid) {
    normalize3(tireForwardRaw, out.tireForward);
    normalize3(cross3(surface.normal, out.tireForward, out.tireRight), out.tireRight);
  } else {
    out.tireForward.x = surface.tangent.x;
    out.tireForward.y = surface.tangent.y;
    out.tireForward.z = surface.tangent.z;
    out.tireRight.x = surface.right.x;
    out.tireRight.y = surface.right.y;
    out.tireRight.z = surface.right.z;
  }
  out.tireFrameValid = tireFrameValid;
  out.longitudinalVelocity = tireFrameValid ? dot3(reachVelocity, out.tireForward) : 0;
  out.lateralVelocity = tireFrameValid ? dot3(reachVelocity, out.tireRight) : 0;
}

export function contactForceWorld(contact: ContactObservation, tireFx: number, tireFy: number, out = vector()): Vec3 {
  if (!contact.forceTransmitting) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return out;
  }
  out.x =
    contact.surface.normal.x * contact.normalLoad + (contact.tireForward.x * tireFx + contact.tireRight.x * tireFy);
  out.y =
    contact.surface.normal.y * contact.normalLoad + (contact.tireForward.y * tireFx + contact.tireRight.y * tireFy);
  out.z =
    contact.surface.normal.z * contact.normalLoad + (contact.tireForward.z * tireFx + contact.tireRight.z * tireFy);
  return out;
}

export function momentAboutCg(contact: ContactObservation, cg: Vec3, force: Vec3, out = vector()): Vec3 {
  sub3(contact.contactPoint, cg, out);
  return cross3(out, force, out);
}
