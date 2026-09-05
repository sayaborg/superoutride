import {
  guideCoordinateCurve,
  guideCoordinateLateralOrigin,
  guideCoordinateToWorld,
  locateWorldOnGuideCoordinateGlobal,
  locateWorldOnGuideCoordinateLocal,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import { sampleGuideCurve, type CourseCoordinate } from '../core/guide-curve.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { AutomaticPowertrainState } from './automatic-powertrain.js';
import type { CompiledTireProfile } from './tire-wheel.js';
import type { SurfaceMapReader, SurfaceMaterial, SurfaceType } from './surface-map.js';
import {
  WORLD_UP,
  add3,
  cross3,
  dot3,
  magnitude3,
  normalize3,
  rotateAroundAxis,
  scale3,
  sub3,
  type Vec3,
} from './vehicle-math3.js';

export const VEHICLE_GRAVITY = 9.80665;
export const VEHICLE_SUBSTEPS = 12;

export type VehicleContactId = 'FRONT' | 'REAR';

/** Output cache for HUD/DEV only. Physics never consumes this object as an authority. */
export interface VehicleControlState {
  /** Canonical input observation. */
  steeringRequest: number;
  steeringActuator: number;
  throttleActuator: number;
  brakeActuator: number;
  actualSteerAngle: number;
  /** HUD-only handwheel angle derived from road-wheel angle and the profile presentation ratio. */
  handwheelAngle: number;
  /** Signed regularized front contact slip angle. Derived telemetry only. */
  frontSlipAngle: number;
  /** Total torque delivered by the powertrain before profile-authored station distribution. */
  deliveredDriveTorque: number;
  frontBrakeTorque: number;
  rearBrakeTorque: number;
  frontWheelLocked: boolean;
  rearWheelLocked: boolean;
  frontUtilization: number;
  rearUtilization: number;
}

/** Shared public world-state fields. `course` is a derived Guide cache, never world authority. */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  course: CourseCoordinate;
  surfaceType: SurfaceType;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  readonly control: VehicleControlState;
  readonly powertrain: AutomaticPowertrainState;
}

export interface BodyFrameVelocity {
  readonly longitudinal: number;
  readonly lateral: number;
  readonly vertical: number;
}

export interface SuspensionStationProfile {
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

export interface SurfaceGeometryObservation {
  readonly coordinate: CourseCoordinate;
  readonly point: Vec3;
  readonly horizontalTangent: Vec3;
  readonly right: Vec3;
  readonly tangent: Vec3;
  readonly normal: Vec3;
  readonly curvature: number;
  readonly metric: number;
  readonly offsetMetric: number;
  readonly heightDerivativeByPlanArc: number;
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

class VehicleOutsideModelError extends Error {
  constructor(readonly contactId: VehicleContactId, readonly compression: number, readonly travel: number) {
    super(`${contactId} suspension compression ${compression} reached/exceeded qTravel ${travel}`);
    this.name = 'VehicleOutsideModelError';
  }
}

export function createVehicleControlState(): VehicleControlState {
  return {
    steeringRequest: 0,
    steeringActuator: 0,
    throttleActuator: 0,
    brakeActuator: 0,
    actualSteerAngle: 0,
    handwheelAngle: 0,
    frontSlipAngle: 0,
    deliveredDriveTorque: 0,
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
}

export function vehicleSpeed(vehicle: VehicleDynamicsState): number {
  return Math.hypot(vehicle.velocityX, vehicle.velocityZ);
}

export function bodyFrameVelocity(
  vehicle: VehicleDynamicsState,
  forward: Vec3,
  right: Vec3,
): BodyFrameVelocity {
  const velocity = { x: vehicle.velocityX, y: vehicle.velocityY, z: vehicle.velocityZ };
  return {
    longitudinal: dot3(velocity, forward),
    lateral: dot3(velocity, right),
    vertical: vehicle.velocityY,
  };
}

export function refreshGuideObservation(
  guide: GuideCoordinateSource,
  vehicle: VehicleDynamicsState,
): void {
  const world = { x: vehicle.x, z: vehicle.z };
  const curve = guideCoordinateCurve(guide);
  const previous = vehicle.course.segmentIndex;
  let coordinate: CourseCoordinate;
  if (Number.isInteger(previous) && previous >= 0 && previous < curve.segments.length) {
    try {
      coordinate = locateWorldOnGuideCoordinateLocal(guide, world, previous, 5, false);
    } catch {
      coordinate = locateWorldOnGuideCoordinateGlobal(guide, world, false);
    }
  } else {
    coordinate = locateWorldOnGuideCoordinateGlobal(guide, world, false);
  }
  vehicle.course = coordinate;
}

function sampleSurfaceGeometryAtWorld(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  point: Vec3,
  previousSegmentIndex: number,
): SurfaceGeometryObservation {
  const curve = guideCoordinateCurve(guide);
  let coordinate: CourseCoordinate;
  if (previousSegmentIndex >= 0 && previousSegmentIndex < curve.segments.length) {
    try {
      coordinate = locateWorldOnGuideCoordinateLocal(
        guide,
        { x: point.x, z: point.z },
        previousSegmentIndex,
        5,
        false,
      );
    } catch {
      coordinate = locateWorldOnGuideCoordinateGlobal(guide, { x: point.x, z: point.z }, false);
    }
  } else {
    coordinate = locateWorldOnGuideCoordinateGlobal(guide, { x: point.x, z: point.z }, false);
  }
  return sampleSurfaceGeometryAtCoordinate(guide, height, surfaces, coordinate);
}

export function sampleSurfaceGeometryAtCoordinate(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  coordinate: CourseCoordinate,
): SurfaceGeometryObservation {
  const curve = guideCoordinateCurve(guide);
  const guideSample = sampleGuideCurve(curve, coordinate.s);
  const segment = curve.segments[guideSample.segmentIndex]!;
  let curvature = 0;
  let metric = 1;
  if (segment.kind === 'arc') {
    const corner = curve.corners[segment.cornerIndex]!;
    curvature = Math.sign(corner.turn) / corner.radius;
    metric = corner.mu;
  }
  const worldL = coordinate.l + guideCoordinateLateralOrigin(guide);
  const offsetMetric = 1 - curvature * worldL;
  if (!(offsetMetric > 0)) {
    throw new RangeError('surface offset metric A=1-kappa*l must remain > 0');
  }
  const heightSample = height.samplePhysicsDifferential(coordinate.s);
  const heightDerivativeByPlanArc = heightSample.dYdS / metric;
  const horizontalTangent = {
    x: Math.sin(guideSample.heading),
    y: 0,
    z: Math.cos(guideSample.heading),
  };
  const right = {
    x: Math.cos(guideSample.heading),
    y: 0,
    z: -Math.sin(guideSample.heading),
  };
  const tangent = normalize3(add3(
    scale3(horizontalTangent, offsetMetric),
    scale3(WORLD_UP, heightDerivativeByPlanArc),
  ), horizontalTangent);
  const normal = normalize3(add3(
    scale3(horizontalTangent, -heightDerivativeByPlanArc),
    scale3(WORLD_UP, offsetMetric),
  ), WORLD_UP);
  const plan = guideCoordinateToWorld(guide, coordinate.s, coordinate.l);
  const sample = surfaces.sample(coordinate.s, coordinate.l);
  return {
    coordinate,
    point: { x: plan.x, y: heightSample.y, z: plan.z },
    horizontalTangent,
    right,
    tangent,
    normal,
    curvature,
    metric,
    offsetMetric,
    heightDerivativeByPlanArc,
    gradeAngle: Math.atan2(heightDerivativeByPlanArc, offsetMetric),
    material: sample.material,
    surfaceType: sample.type,
  };
}

/**
 * One ordinary derived contact solve for every vehicle profile. Surface normal is frozen within
 * the substep and both stations use their authored rolling radius directly.
 */
export function deriveContactObservation(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  body: BodyKinematics,
  station: ContactStationProfile,
  steerAngle: number,
  previousSegmentIndex: number,
): ContactObservation {
  const isFront = station.id === 'FRONT';
  const wheelForward = isFront
    ? normalize3(rotateAroundAxis(body.forward, body.up, steerAngle), body.forward)
    : body.forward;
  const wheelAxis = normalize3(cross3(body.up, wheelForward), body.right);

  const freeOffset = add3(
    scale3(body.forward, station.forwardOffset),
    scale3(body.up, -station.freeReachDown),
  );
  const freePoint = add3(body.position, freeOffset);
  const surface = sampleSurfaceGeometryAtWorld(
    guide,
    height,
    surfaces,
    freePoint,
    previousSegmentIndex,
  );

  const reachPoint = freePoint;
  const reachVelocity = add3(
    body.velocity,
    cross3(body.omegaWorld, freeOffset),
  );
  const gap = dot3(sub3(reachPoint, surface.point), surface.normal);
  const supportAvailable = surface.material.supported;
  // Wheel support is one-sided. A flipped body cannot stand on its inverted suspension rays.
  const withinReach = supportAvailable && dot3(body.up, surface.normal) > 0 && gap <= 0;
  const q = withinReach ? -gap : 0;
  if (q >= station.suspension.qTravel) {
    throw new VehicleOutsideModelError(station.id, q, station.suspension.qTravel);
  }
  const qDot = withinReach ? -dot3(reachVelocity, surface.normal) : 0;
  const bumpForce = bumpStopForce(q, station.suspension);
  const normalLoad = withinReach
    ? Math.max(0, station.suspension.springRate * q + station.suspension.damping * qDot + bumpForce)
    : 0;
  const contactPoint = sub3(reachPoint, scale3(surface.normal, gap));

  const tireForwardRaw = sub3(wheelForward, scale3(surface.normal, dot3(wheelForward, surface.normal)));
  const tireFrameValid = magnitude3(tireForwardRaw) > 1e-8;
  const tireForward = tireFrameValid ? normalize3(tireForwardRaw, surface.tangent) : surface.tangent;
  const tireRight = tireFrameValid
    ? normalize3(cross3(surface.normal, tireForward), surface.right)
    : surface.right;
  const longitudinalVelocity = tireFrameValid ? dot3(reachVelocity, tireForward) : 0;
  const lateralVelocity = tireFrameValid ? dot3(reachVelocity, tireRight) : 0;

  return {
    id: station.id,
    profile: station,
    surface,
    supportAvailable,
    withinReach,
    forceTransmitting: normalLoad > 0,
    tireFrameValid,
    wheelForward,
    wheelAxis,
    reachPoint,
    contactPoint,
    reachVelocity,
    gap,
    q,
    qDot,
    normalLoad,
    effectiveRollingRadius: station.rollingRadius,
    tireForward,
    tireRight,
    longitudinalVelocity,
    lateralVelocity,
  };
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

export function contactForceWorld(
  contact: ContactObservation,
  tireFx: number,
  tireFy: number,
): Vec3 {
  if (!contact.forceTransmitting) return { x: 0, y: 0, z: 0 };
  return add3(
    scale3(contact.surface.normal, contact.normalLoad),
    add3(scale3(contact.tireForward, tireFx), scale3(contact.tireRight, tireFy)),
  );
}

export function momentAboutCg(contact: ContactObservation, cg: Vec3, force: Vec3): Vec3 {
  return cross3(sub3(contact.contactPoint, cg), force);
}

export function representativeSurfaceType(contacts: readonly ContactObservation[]): SurfaceType {
  const loaded = contacts.filter((contact) => contact.forceTransmitting);
  if (loaded.length === 0) return 'VOID';
  return loaded.reduce((worst, contact) => (
    contact.surface.material.gripFactor < worst.surface.material.gripFactor ? contact : worst
  ), loaded[0]!).surface.surfaceType;
}

export function initializeGuideObservation(
  guide: GuideCoordinateSource,
  x: number,
  z: number,
): CourseCoordinate {
  return locateWorldOnGuideCoordinateGlobal(guide, { x, z }, false);
}

function bumpStopForce(q: number, suspension: SuspensionStationProfile): number {
  if (q <= suspension.qBump || !(suspension.bumpForceMax > 0)) return 0;
  const x = (q - suspension.qBump) / (suspension.qTravel - suspension.qBump);
  const t = Math.max(0, Math.min(1, x));
  const smooth = t * t * (3 - 2 * t);
  return suspension.bumpForceMax * smooth;
}