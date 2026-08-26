import {
  locateWorldOnGuideCoordinateLocal,
  type GuideCoordinateSource,
} from '../core/guide-coordinate-frame.js';
import type { CourseCoordinate } from '../core/guide-curve.js';
import { wrapAngle } from '../core/math.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import {
  SURFACE_MATERIALS,
  type SurfaceMapReader,
  type SurfaceMaterial,
  type SurfaceType,
} from './surface-map.js';
import type { AutomaticPowertrainState } from './automatic-powertrain.js';

export const VEHICLE_GRAVITY = 9.80665;

export type VehicleContactId = 'FRONT' | 'REAR';
export type VehicleContactPhase = 'AIRBORNE' | 'CONTACT';

/**
 * One longitudinal contact station shared by the reduced car and motorcycle architectures.
 *
 * A car station represents one axle and samples support across its authored half width. A bike
 * station represents one real wheel and therefore uses halfWidth=0. Tire force resolution remains
 * model-specific; this common state owns only support/contact observation and normal load output.
 */
export interface VehicleContactStationState {
  readonly id: VehicleContactId;
  readonly forwardOffset: number;
  readonly halfWidth: number;
  phase: VehicleContactPhase;
  supportAvailable: boolean;
  supportFraction: number;
  groundHeight: number;
  surfaceType: SurfaceType;
  friction: number;
  rollingResistance: number;
  driveScale: number;
  compression: number;
  normalLoad: number;
  wheelAngularSpeed: number;
}

/** Post-assist actuator authority. Digital input intent is deliberately not duplicated here. */
export interface VehicleControlState {
  /** Normalized intent. Player input adapters emit only -1/0/+1; AI may remain continuous. */
  steeringRequest: number;
  actualSteerAngle: number;
  appliedDrive: number;
  appliedFrontBrake: number;
  appliedRearBrake: number;
  tractionControlActive: boolean;
  absActive: boolean;
}

/**
 * Shared world body/contact authority used by both current concrete vehicle solvers.
 *
 * World velocity is authoritative. Longitudinal/lateral speed and resultant speed are derived
 * observations and must never be stored as a second velocity truth.
 */
export interface VehicleDynamicsState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  yawRate: number;
  course: CourseCoordinate;
  sprungPitch: number;
  sprungPitchRate: number;
  sprungRoll: number;
  sprungRollRate: number;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  surfaceType: SurfaceType;
  readonly contacts: [VehicleContactStationState, VehicleContactStationState];
  readonly control: VehicleControlState;
  readonly powertrain: AutomaticPowertrainState;
}

export interface BodyFrameVelocity {
  readonly longitudinal: number;
  readonly lateral: number;
  readonly vertical: number;
}

export interface ReducedContactProfile {
  readonly maxFallSpeed: number;
  readonly contactTolerance: number;
  readonly contactReleaseGap: number;
  readonly supportedPitchTau: number;
  readonly airbornePitchDamping: number;
}

interface SupportProbe {
  readonly available: boolean;
  readonly groundHeight: number;
  readonly material: SurfaceMaterial;
}

export function createVehicleControlState(): VehicleControlState {
  return {
    steeringRequest: 0,
    actualSteerAngle: 0,
    appliedDrive: 0,
    appliedFrontBrake: 0,
    appliedRearBrake: 0,
    tractionControlActive: false,
    absActive: false,
  };
}

export function createReducedContactStations(
  frontOffset: number,
  rearOffset: number,
  halfWidth: number,
  initialSurface: SurfaceMaterial,
  initialHeight: number,
): [VehicleContactStationState, VehicleContactStationState] {
  return [
    createContactStation('FRONT', frontOffset, halfWidth, initialSurface, initialHeight),
    createContactStation('REAR', rearOffset, halfWidth, initialSurface, initialHeight),
  ];
}

export function bodyFrameVelocity(vehicle: VehicleDynamicsState): BodyFrameVelocity {
  const sin = Math.sin(vehicle.yaw);
  const cos = Math.cos(vehicle.yaw);
  return {
    longitudinal: vehicle.velocityX * sin + vehicle.velocityZ * cos,
    lateral: vehicle.velocityX * cos - vehicle.velocityZ * sin,
    vertical: vehicle.velocityY,
  };
}

export function setBodyFrameVelocity(
  vehicle: VehicleDynamicsState,
  longitudinal: number,
  lateral: number,
  vertical = vehicle.velocityY,
): void {
  const sin = Math.sin(vehicle.yaw);
  const cos = Math.cos(vehicle.yaw);
  vehicle.velocityX = sin * longitudinal + cos * lateral;
  vehicle.velocityZ = cos * longitudinal - sin * lateral;
  vehicle.velocityY = vertical;
}

export function vehicleSpeed(vehicle: VehicleDynamicsState): number {
  return Math.hypot(vehicle.velocityX, vehicle.velocityZ);
}

export function vehicleGrounded(vehicle: VehicleDynamicsState): boolean {
  return vehicle.contacts.some((contact) => contact.phase === 'CONTACT');
}

export function vehicleRepresentativeSurface(vehicle: VehicleDynamicsState): SurfaceType {
  const contacts = vehicle.contacts.filter((contact) => contact.phase === 'CONTACT');
  if (contacts.length === 0) return 'VOID';
  return contacts.reduce((worst, contact) => (
    SURFACE_MATERIALS[contact.surfaceType].friction < SURFACE_MATERIALS[worst].friction
      ? contact.surfaceType
      : worst
  ), contacts[0]!.surfaceType);
}

export function aggregateContactMaterial(vehicle: VehicleDynamicsState): SurfaceMaterial {
  const contacts = vehicle.contacts.filter((contact) => contact.phase === 'CONTACT');
  if (contacts.length === 0) return SURFACE_MATERIALS.VOID;
  const weight = 1 / contacts.length;
  return {
    type: vehicleRepresentativeSurface(vehicle),
    supported: true,
    friction: contacts.reduce((sum, contact) => sum + contact.friction * weight, 0),
    rollingResistance: contacts.reduce((sum, contact) => sum + contact.rollingResistance * weight, 0),
    driveScale: contacts.reduce((sum, contact) => sum + contact.driveScale * weight, 0),
  };
}

/** Apply the common world pose integration after a model-specific force/control solve. */
export function integrateWorldPlanarPose(
  guide: GuideCoordinateSource,
  vehicle: VehicleDynamicsState,
  dt: number,
): void {
  vehicle.x += vehicle.velocityX * dt;
  vehicle.z += vehicle.velocityZ * dt;
  vehicle.yaw = wrapAngle(vehicle.yaw + vehicle.yawRate * dt);
  vehicle.course = locateWorldOnGuideCoordinateLocal(
    guide,
    { x: vehicle.x, z: vehicle.z },
    vehicle.course.segmentIndex,
    4,
    false,
  );
}

/**
 * Resolve support availability separately from actual contact, then advance common heave/pitch.
 * A supported surface below an airborne vehicle does not create contact until a station reaches it.
 */
export function updateReducedContactsAndVerticalBody(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: VehicleDynamicsState,
  profile: ReducedContactProfile,
  dt: number,
): void {
  const previousY = vehicle.y;
  const previousPitch = vehicle.sprungPitch;

  for (const station of vehicle.contacts) {
    const support = sampleStationSupport(guide, height, surfaces, vehicle, station);
    station.supportAvailable = support.supportFraction > 0;
    station.supportFraction = support.supportFraction;
    station.groundHeight = support.groundHeight;
    station.surfaceType = support.surface.type;
    station.friction = support.surface.friction;
    station.rollingResistance = support.surface.rollingResistance;
    station.driveScale = support.surface.driveScale;

    const stationY = vehicle.y + Math.sin(vehicle.sprungPitch) * station.forwardOffset;
    const gap = stationY - station.groundHeight;
    const stationVerticalSpeed = vehicle.velocityY
      + Math.cos(vehicle.sprungPitch) * station.forwardOffset * vehicle.sprungPitchRate;
    const retainedContact = station.phase === 'CONTACT'
      && station.supportAvailable
      && gap <= profile.contactReleaseGap;
    const newContact = station.supportAvailable
      && gap <= profile.contactTolerance
      && stationVerticalSpeed <= 0;
    station.phase = retainedContact || newContact ? 'CONTACT' : 'AIRBORNE';
    station.compression = station.phase === 'CONTACT' ? Math.max(0, -gap) : 0;
    if (station.phase === 'AIRBORNE') station.normalLoad = 0;
  }

  const contacting = vehicle.contacts.filter((station) => station.phase === 'CONTACT');
  if (contacting.length === 0) {
    vehicle.velocityY = Math.max(
      vehicle.velocityY - VEHICLE_GRAVITY * dt,
      -profile.maxFallSpeed,
    );
    vehicle.y += vehicle.velocityY * dt;
    vehicle.sprungPitch += vehicle.sprungPitchRate * dt;
    vehicle.sprungPitchRate *= Math.exp(-dt * profile.airbornePitchDamping);
    vehicle.surfaceType = 'VOID';
    return;
  }

  let pitchTarget = vehicle.sprungPitch;
  const front = vehicle.contacts[0];
  const rear = vehicle.contacts[1];
  if (front.phase === 'CONTACT' && rear.phase === 'CONTACT') {
    pitchTarget = Math.atan2(
      front.groundHeight - rear.groundHeight,
      front.forwardOffset - rear.forwardOffset,
    );
  }
  const pitchAlpha = 1 - Math.exp(-dt / Math.max(profile.supportedPitchTau, 1e-4));
  vehicle.sprungPitch += (pitchTarget - vehicle.sprungPitch) * pitchAlpha;
  vehicle.sprungPitchRate = (vehicle.sprungPitch - previousPitch) / Math.max(dt, 1e-6);

  const bodyTargets = contacting.map((station) => (
    station.groundHeight - Math.sin(vehicle.sprungPitch) * station.forwardOffset
  ));
  const bodyTargetY = bodyTargets.reduce((sum, value) => sum + value, 0) / bodyTargets.length;
  vehicle.y = bodyTargetY;
  vehicle.velocityY = (vehicle.y - previousY) / Math.max(dt, 1e-6);
  vehicle.surfaceType = vehicleRepresentativeSurface(vehicle);
}

export function copyCommonVehicleDynamicsState(
  target: VehicleDynamicsState,
  source: VehicleDynamicsState,
): void {
  target.x = source.x;
  target.y = source.y;
  target.z = source.z;
  target.yaw = source.yaw;
  target.velocityX = source.velocityX;
  target.velocityY = source.velocityY;
  target.velocityZ = source.velocityZ;
  target.yawRate = source.yawRate;
  target.course = { ...source.course };
  target.sprungPitch = source.sprungPitch;
  target.sprungPitchRate = source.sprungPitchRate;
  target.sprungRoll = source.sprungRoll;
  target.sprungRollRate = source.sprungRollRate;
  target.longitudinalAcceleration = source.longitudinalAcceleration;
  target.lateralAcceleration = source.lateralAcceleration;
  target.surfaceType = source.surfaceType;
  for (let i = 0; i < target.contacts.length; i += 1) {
    copyContact(target.contacts[i]!, source.contacts[i]!);
  }
  Object.assign(target.control, source.control);
  Object.assign(target.powertrain, source.powertrain);
}

export function resetVehicleControlState(vehicle: VehicleDynamicsState): void {
  Object.assign(vehicle.control, createVehicleControlState());
}

function createContactStation(
  id: VehicleContactId,
  forwardOffset: number,
  halfWidth: number,
  material: SurfaceMaterial,
  groundHeight: number,
): VehicleContactStationState {
  return {
    id,
    forwardOffset,
    halfWidth,
    phase: material.supported ? 'CONTACT' : 'AIRBORNE',
    supportAvailable: material.supported,
    supportFraction: material.supported ? 1 : 0,
    groundHeight,
    surfaceType: material.type,
    friction: material.friction,
    rollingResistance: material.rollingResistance,
    driveScale: material.driveScale,
    compression: 0,
    normalLoad: 0,
    wheelAngularSpeed: 0,
  };
}

function sampleStationSupport(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: VehicleDynamicsState,
  station: VehicleContactStationState,
): { supportFraction: number; groundHeight: number; surface: SurfaceMaterial } {
  const lateralOffsets = station.halfWidth > 1e-6
    ? [-station.halfWidth, station.halfWidth]
    : [0];
  const probes = lateralOffsets.map((lateralOffset) => sampleSupportProbe(
    guide,
    height,
    surfaces,
    vehicle,
    station.forwardOffset,
    lateralOffset,
  ));
  const supported = probes.filter((probe) => probe.available);
  if (supported.length === 0) {
    return { supportFraction: 0, groundHeight: vehicle.y, surface: SURFACE_MATERIALS.VOID };
  }
  const inverse = 1 / supported.length;
  const representative = supported.reduce((worst, probe) => (
    probe.material.friction < worst.material.friction ? probe : worst
  ), supported[0]!);
  return {
    supportFraction: supported.length / probes.length,
    groundHeight: supported.reduce((sum, probe) => sum + probe.groundHeight * inverse, 0),
    surface: {
      type: representative.material.type,
      supported: true,
      friction: supported.reduce((sum, probe) => sum + probe.material.friction * inverse, 0),
      rollingResistance: supported.reduce(
        (sum, probe) => sum + probe.material.rollingResistance * inverse,
        0,
      ),
      driveScale: supported.reduce((sum, probe) => sum + probe.material.driveScale * inverse, 0),
    },
  };
}

function sampleSupportProbe(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: VehicleDynamicsState,
  forwardOffset: number,
  lateralOffset: number,
): SupportProbe {
  const sin = Math.sin(vehicle.yaw);
  const cos = Math.cos(vehicle.yaw);
  const point = {
    x: vehicle.x + sin * forwardOffset + cos * lateralOffset,
    z: vehicle.z + cos * forwardOffset - sin * lateralOffset,
  };
  const coordinate = locateWorldOnGuideCoordinateLocal(
    guide,
    point,
    vehicle.course.segmentIndex,
    5,
    false,
  );
  const sample = surfaces.sample(coordinate.s, coordinate.l);
  return {
    available: sample.material.supported,
    groundHeight: height.samplePhysics(coordinate.s),
    material: sample.material,
  };
}

function copyContact(
  target: VehicleContactStationState,
  source: VehicleContactStationState,
): void {
  target.phase = source.phase;
  target.supportAvailable = source.supportAvailable;
  target.supportFraction = source.supportFraction;
  target.groundHeight = source.groundHeight;
  target.surfaceType = source.surfaceType;
  target.friction = source.friction;
  target.rollingResistance = source.rollingResistance;
  target.driveScale = source.driveScale;
  target.compression = source.compression;
  target.normalLoad = source.normalLoad;
  target.wheelAngularSpeed = source.wheelAngularSpeed;
}
