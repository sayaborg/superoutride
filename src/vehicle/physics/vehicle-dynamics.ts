import {
  createPlanProjectionWorkspace,
  createPlanCoordinateSample,
  type PlanCoordinateReader,
  type PlanCoordinateProjection,
  type PlanProjectionWorkspace,
} from '../../course/geometry/plan-coordinate.js';
import { type Writable } from '../../core/writable.js';
import { SURFACE_MATERIALS } from '../../course/surface-material.js';
import { resetVehicleTireObservation } from './vehicle-tire-observation.js';
import type { ProfileReader } from '../../course/geometry/profile.js';
import type { AutomaticPowertrainState } from './automatic-powertrain.js';
import type { SurfaceMapReader } from '../../course/vehicle-world.js';
import type { SurfaceMaterial, SurfaceType } from '../../course/surface-material.js';
import type { CompiledTireProfile } from './tire-wheel.js';
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

const MIN_PROJECTED_TIRE_DIRECTION_LENGTH = 1e-8;

export const VEHICLE_GRAVITY = 9.80665;
export const VEHICLE_SUBSTEPS = 12;

type VehicleContactId = 'FRONT' | 'REAR';

/** Output cache for presentation/DEV only. Physics never consumes this object as an authority. */
interface VehicleControlState {
  /** Canonical input observation. */
  steeringRequest: number;
  steeringActuator: number;
  automaticSteerAngle: number;
  requestedSteerOffset: number;
  deliveredSteerOffset: number;
  targetSteerAngle: number;
  throttleActuator: number;
  brakeActuator: number;
  actualSteerAngle: number;
  /** HUD-only handwheel angle derived from road-wheel angle and the profile presentation ratio. */
  handwheelAngle: number;
  /** Signed regularized front contact slip angle. Derived telemetry only. */
  frontSlipAngle: number;
  /** Sum of actual delivered station drive torques after protection. */
  deliveredDriveTorque: number;
  requestedFrontDriveTorque: number;
  requestedRearDriveTorque: number;
  frontDriveTorque: number;
  rearDriveTorque: number;
  requestedFrontBrakeTorque: number;
  requestedRearBrakeTorque: number;
  supportTorqueScale: number;
  supportFeasible: boolean;
  frontBrakeTorque: number;
  rearBrakeTorque: number;
  frontWheelLocked: boolean;
  rearWheelLocked: boolean;
  frontUtilization: number;
  rearUtilization: number;
}

/** Shared public world-state fields. `course` is a derived plan coordinate cache, never world authority. */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  course: PlanCoordinateProjection;
  surfaceType: SurfaceType;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  readonly control: VehicleControlState;
  readonly powertrain: AutomaticPowertrainState;
}

interface BodyFrameVelocity {
  readonly longitudinal: number;
  readonly lateral: number;
  readonly vertical: number;
}

interface SuspensionStationProfile {
  readonly springRate: number;
  readonly damping: number;
  readonly qStatic: number;
  readonly qBump: number;
  readonly qTravel: number;
  readonly bumpForceMax: number;
}

export interface ContactStationProfile {
  readonly id: VehicleContactId;
  readonly forwardOffset: number;
  /** CG-to-free-reach distance along body down at maximum suspension extension. */
  readonly freeReachDown: number;
  readonly rollingRadius: number;
  readonly wheelInertia: number;
  readonly maxBrakeTorque: number;
  readonly suspension: SuspensionStationProfile;
  readonly tire: CompiledTireProfile;
}

export interface BodyKinematics {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
  readonly omegaWorld: Vec3;
}

interface SurfaceGeometryObservation {
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
  readonly material: SurfaceMaterial;
  readonly surfaceType: SurfaceType;
}

export interface ContactObservation {
  readonly id: VehicleContactId;
  readonly profile: ContactStationProfile;
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

export class VehicleOutsideModelError extends Error {
  constructor(
    readonly contactId: VehicleContactId,
    readonly compression: number,
    readonly travel: number,
  ) {
    super(`${contactId} suspension compression ${compression} reached/exceeded qTravel ${travel}`);
    this.name = 'VehicleOutsideModelError';
  }
}

export function createVehicleControlState(): VehicleControlState {
  return {
    steeringRequest: 0,
    steeringActuator: 0,
    automaticSteerAngle: 0,
    requestedSteerOffset: 0,
    deliveredSteerOffset: 0,
    targetSteerAngle: 0,
    throttleActuator: 0,
    brakeActuator: 0,
    actualSteerAngle: 0,
    handwheelAngle: 0,
    frontSlipAngle: 0,
    deliveredDriveTorque: 0,
    requestedFrontDriveTorque: 0,
    requestedRearDriveTorque: 0,
    frontDriveTorque: 0,
    rearDriveTorque: 0,
    requestedFrontBrakeTorque: 0,
    requestedRearBrakeTorque: 0,
    supportTorqueScale: 1,
    supportFeasible: true,
    frontBrakeTorque: 0,
    rearBrakeTorque: 0,
    frontWheelLocked: false,
    rearWheelLocked: false,
    frontUtilization: 0,
    rearUtilization: 0,
  };
}

export function resetVehicleControlState(vehicle: VehicleDynamicsState): void {
  Object.assign(vehicle.control, createVehicleControlState());
  resetVehicleTireObservation(vehicle);
}

export function vehicleSpeed(vehicle: VehicleDynamicsState): number {
  return Math.hypot(vehicle.velocityX, vehicle.velocityZ);
}

export function bodyFrameVelocity(vehicle: VehicleDynamicsState, forward: Vec3, right: Vec3): BodyFrameVelocity {
  const velocity = { x: vehicle.velocityX, y: vehicle.velocityY, z: vehicle.velocityZ };
  return {
    longitudinal: dot3(velocity, forward),
    lateral: dot3(velocity, right),
    vertical: vehicle.velocityY,
  };
}

export function refreshPlanCoordinateObservation(
  coordinates: PlanCoordinateReader,
  vehicle: VehicleDynamicsState,
  workspace: PlanProjectionWorkspace,
): void {
  vehicle.course = coordinates.locateLocal(vehicle, vehicle.course.s, vehicle.course, workspace);
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
      material: SURFACE_MATERIALS.VOID,
      surfaceType: 'VOID' as SurfaceType,
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
  const sample = surfaces.sample(coordinate.s, coordinate.l);
  out.coordinate = coordinate;
  out.point.x = planSample.x;
  out.point.y = heightSample.y;
  out.point.z = planSample.z;
  out.curvature = curvature;
  out.offsetMetric = offsetMetric;
  out.heightDerivativeByS = heightDerivativeByS;
  out.gradeAngle = Math.atan2(heightDerivativeByS, offsetMetric);
  out.material = sample.material;
  out.surfaceType = sample.type;
  return out;
}

export function createContactWorkspace(station: ContactStationProfile) {
  const surface = createSurfaceGeometryWorkspace();
  return {
    surface,
    a: vector(),
    b: vector(),
    freeOffset: vector(),
    value: {
      id: station.id,
      profile: station,
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
  station: ContactStationProfile,
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
    surface.material = SURFACE_MATERIALS.VOID;
    surface.surfaceType = 'VOID';
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
    contactTireFrame(body, station, steerAngle, surface, out.reachVelocity, out, a);
    return out;
  }
  sampleSurfaceGeometryAtCoordinate(coordinates, height, surfaces, coordinate, workspace.surface);
  const surface = workspace.surface.value;
  const reachVelocity = add3(body.velocity, cross3(body.omegaWorld, freeOffset, a), out.reachVelocity);
  const gap = dot3(sub3(reachPoint, surface.point, a), surface.normal);
  const supportAvailable = surface.material.supported;
  const withinReach = supportAvailable && dot3(body.up, surface.normal) > 0 && gap <= 0;
  const q = withinReach ? -gap : 0;
  if (q >= station.suspension.qTravel) throw new VehicleOutsideModelError(station.id, q, station.suspension.qTravel);
  const qDot = withinReach ? -dot3(reachVelocity, surface.normal) : 0;
  const bumpForce = bumpStopForce(q, station.suspension);
  const normalLoad = withinReach
    ? Math.max(0, station.suspension.springRate * q + station.suspension.damping * qDot + bumpForce)
    : 0;
  sub3(reachPoint, scale3(surface.normal, gap, a), out.contactPoint);
  out.id = station.id;
  out.profile = station;
  out.surface = surface;
  out.supportAvailable = supportAvailable;
  out.withinReach = withinReach;
  out.forceTransmitting = normalLoad > 0;
  out.gap = gap;
  out.q = q;
  out.qDot = qDot;
  out.normalLoad = normalLoad;
  out.effectiveRollingRadius = station.rollingRadius;
  contactTireFrame(body, station, steerAngle, surface, reachVelocity, out, a);
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
  contactTireFrame(body, contact.profile, steerAngle, contact.surface, contact.reachVelocity, out, workspace.a);
  return out;
}

function contactTireFrame(
  body: BodyKinematics,
  station: ContactStationProfile,
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
  if (station.id === 'FRONT')
    normalize3(rotateAroundAxis(body.forward, body.up, steerAngle, out.wheelForward), out.wheelForward);
  else {
    out.wheelForward.x = body.forward.x;
    out.wheelForward.y = body.forward.y;
    out.wheelForward.z = body.forward.z;
  }
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

export function compileSuspensionStation(
  staticLoad: number,
  rideFrequency: number,
  dampingRatio: number,
  qBump: number,
  qTravel: number,
  bumpForceMax: number,
): SuspensionStationProfile {
  if (![staticLoad, rideFrequency, dampingRatio, qBump, qTravel, bumpForceMax].every(Number.isFinite)) {
    throw new RangeError('suspension inputs must be finite');
  }
  if (!(staticLoad > 0)) throw new RangeError('static station load must be > 0');
  if (!(rideFrequency > 0)) throw new RangeError('ride frequency must be > 0');
  if (!(dampingRatio >= 0)) throw new RangeError('damping ratio must be >= 0');
  const effectiveMass = staticLoad / VEHICLE_GRAVITY;
  const omega = 2 * Math.PI * rideFrequency;
  const springRate = omega ** 2 * effectiveMass;
  const damping = 2 * dampingRatio * Math.sqrt(springRate * effectiveMass);
  const qStatic = staticLoad / springRate;
  if (!(qStatic > 0 && qStatic < qBump && qBump < qTravel)) {
    throw new RangeError('suspension requires 0 < qStatic < qBump < qTravel');
  }
  if (!(bumpForceMax >= 0)) throw new RangeError('bumpForceMax must be >= 0');
  return Object.freeze({ springRate, damping, qStatic, qBump, qTravel, bumpForceMax });
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

export function representativeSurfaceType(contacts: readonly ContactObservation[]): SurfaceType {
  let worst: ContactObservation | null = null;
  for (const contact of contacts)
    if (
      contact.forceTransmitting &&
      (!worst || contact.surface.material.gripFactor < worst.surface.material.gripFactor)
    )
      worst = contact;
  return worst?.surface.surfaceType ?? 'VOID';
}

/** Reproject the reconstructed CG near its known placement; overlapping charts are not interchangeable. */
export function initializePlanCoordinateObservation(
  coordinates: PlanCoordinateReader,
  x: number,
  z: number,
  previousS: number,
): PlanCoordinateProjection {
  return coordinates.locateLocal({ x, z }, previousS, { s: 0, l: 0, inDomain: false }, createPlanProjectionWorkspace());
}

function bumpStopForce(q: number, suspension: SuspensionStationProfile): number {
  if (q <= suspension.qBump || !(suspension.bumpForceMax > 0)) return 0;
  const x = (q - suspension.qBump) / (suspension.qTravel - suspension.qBump);
  const t = Math.max(0, Math.min(1, x));
  const smooth = t * t * (3 - 2 * t);
  return suspension.bumpForceMax * smooth;
}
