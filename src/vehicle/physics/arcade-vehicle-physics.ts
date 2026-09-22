import { createSurfaceGeometryWorkspace } from './vehicle-dynamics.js';
import { createGuideProjectionWorkspace } from '../../course/geometry/guide-curve.js';
import { createPlanarCoordinateSample } from '../../core/planar-sample.js';
import { type Writable } from '../../core/writable.js';
import { publishVehicleTireObservation } from './vehicle-tire-observation.js';
import { guideCoordinateToWorld } from '../../course/geometry/guide-coordinate-frame.js';
import { clamp, wrapAngle } from '../../core/math.js';
import type { DrivingInput } from '../driving-input.js';
import { createAutomaticPowertrainState, updateAutomaticPowertrain } from './automatic-powertrain.js';
import { createDrivingActuatorState, updateDrivingActuators, type DrivingActuatorState } from './driving-actuator.js';
import { createSteeringLimitWorkspace, limitSteeringInput } from './steering-input-limiter.js';
import {
  createArcadeTireFrictionCalibration,
  type ArcadeTireFrictionCalibrationState,
} from './tire-friction-calibration.js';
import { regularizedTireSlipAngle, type WheelSolveInput } from './tire-wheel.js';
import {
  createArcadeSteeringCalibration,
  steeringAutomaticMax,
  type ArcadeSteeringCalibrationInput,
  type ArcadeSteeringCalibrationState,
} from './vehicle-calibration.js';
import type { VehicleWorld } from './vehicle-contract.js';
import {
  VEHICLE_SUBSTEPS,
  bodyFrameVelocity,
  createVehicleControlState,
  createContactWorkspace,
  deriveContactObservation,
  initializeGuideObservation,
  refreshGuideObservation,
  reorientContactObservation,
  representativeSurfaceType,
  sampleSurfaceGeometryAtCoordinate,
  vehicleSpeed,
  type BodyKinematics,
  type ContactObservation,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';
import { WORLD_UP, add3, cross3, dot3, normalize3, scale3 } from '../../core/vector3.js';
import { drivenWheelOmega, type CompiledArcadeVehicleProfile } from './vehicle-profiles.js';

import {
  UNPROTECTED_TORQUE_POLICY,
  resolveTorqueProtectionPolicy,
  solveProtectedWheelPair,
  createProtectedWheelPairWorkspace,
  type TorqueProtectionPolicy,
} from './torque-protection.js';

/** One authoritative state shape for every compiled vehicle profile. */
export interface ArcadeVehicleState extends VehicleDynamicsState {
  readonly profile: CompiledArcadeVehicleProfile;
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  frontSteerAngle: number;
  /** Sole current runtime authority for the selectable M/D/T steering calibration. */
  readonly steeringCalibration: ArcadeSteeringCalibrationState;
  /** Sole runtime authority for the selected tire characteristic calibration. */
  tireFrictionCalibration: Readonly<ArcadeTireFrictionCalibrationState>;
  frontWheelOmega: number;
  rearWheelOmega: number;
  readonly actuator: DrivingActuatorState;
  readonly torqueProtection: Readonly<TorqueProtectionPolicy>;

  /** Derived-output caches only; the next mechanics solve never consumes them as authority. */
  frontNormalLoad: number;
  rearNormalLoad: number;
  frontGap: number;
  rearGap: number;
  frontSupportAvailable: boolean;
  rearSupportAvailable: boolean;

  readonly speed: number;
  readonly verticalSpeed: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly steerAngle: number;
  readonly supported: boolean;
  readonly sprungPitch: number;
  readonly presentationY: number;
}

interface VehicleSpawnOptions {
  readonly s?: number;
  readonly l?: number;
  readonly initialSpeed?: number;
  readonly steeringCalibration?: ArcadeSteeringCalibrationInput;
  readonly tireFrictionCalibration?: Readonly<ArcadeTireFrictionCalibrationState>;
  readonly torqueProtection?: TorqueProtectionPolicy;
}

export function createArcadeVehicle(
  profile: CompiledArcadeVehicleProfile,
  { guide, height, surfaces }: VehicleWorld,
  {
    s = 45,
    l = 0,
    initialSpeed = 45,
    steeringCalibration = {},
    tireFrictionCalibration,
    torqueProtection = UNPROTECTED_TORQUE_POLICY,
  }: VehicleSpawnOptions = {},
): ArcadeVehicleState {
  const resolvedSteeringCalibration = createArcadeSteeringCalibration(profile, steeringCalibration);
  const resolvedTireFrictionCalibration = createArcadeTireFrictionCalibration(
    tireFrictionCalibration?.front ?? profile.frontStation.tire,
    tireFrictionCalibration?.rear ?? profile.rearStation.tire,
  );
  const coordinate = {
    s,
    l,
    segmentIndex: guideCoordinateToWorld(guide, s, l, createPlanarCoordinateSample()).segmentIndex,
    distanceSquared: 0,
  };
  const surface = sampleSurfaceGeometryAtCoordinate(
    guide,
    height,
    surfaces,
    coordinate,
    createSurfaceGeometryWorkspace(),
  );
  if (!surface.material.supported) throw new Error('vehicle spawn requires supported surface');
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const pitch = surface.gradeAngle;
  const position = add3(surface.point, scale3(surface.normal, profile.desiredCgHeight));
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const frontOmega = initialSpeed / profile.frontStation.rollingRadius;
  const rearOmega = initialSpeed / profile.rearStation.rollingRadius;
  const state = {
    profile,
    x: position.x,
    y: position.y,
    z: position.z,
    velocityX: initialVelocity.x,
    velocityY: initialVelocity.y,
    velocityZ: initialVelocity.z,
    yaw,
    pitch,
    yawRate: 0,
    pitchRate: 0,
    frontSteerAngle: 0,
    steeringCalibration: resolvedSteeringCalibration,
    tireFrictionCalibration: resolvedTireFrictionCalibration,
    frontWheelOmega: frontOmega,
    rearWheelOmega: rearOmega,
    actuator: createDrivingActuatorState(),
    torqueProtection: resolveTorqueProtectionPolicy(torqueProtection),
    course: initializeGuideObservation(guide, position.x, position.z, coordinate.segmentIndex),
    surfaceType: surface.surfaceType,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(profile.powertrain, drivenWheelOmega(profile, frontOmega, rearOmega)),
    frontNormalLoad: 0,
    rearNormalLoad: 0,
    frontGap: 0,
    rearGap: 0,
    frontSupportAvailable: true,
    rearSupportAvailable: true,
  } as ArcadeVehicleState;
  return installArcadeVehicleDerivedAccessors(state);
}

export function updateArcadeVehicle(
  { guide, height, surfaces }: VehicleWorld,
  vehicle: ArcadeVehicleState,
  input: DrivingInput,
  dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('vehicle dt must be finite and > 0');
  const profile = vehicle.profile;
  let workspace = stepWorkspaces.get(vehicle);
  if (!workspace) {
    workspace = createStepWorkspace(vehicle);
    stepWorkspaces.set(vehicle, workspace);
  }
  const velocityBeforeX = vehicle.velocityX,
    velocityBeforeY = vehicle.velocityY,
    velocityBeforeZ = vehicle.velocityZ;
  const substep = dt / VEHICLE_SUBSTEPS;
  const calibration = vehicle.steeringCalibration;
  const automaticMax = steeringAutomaticMax(calibration);
  const steeringResponse = 1 - Math.exp(-substep / profile.steeringResponseTau);
  const steeringRequest = clamp(input.steering, -1, 1);
  let finalFront: ContactObservation | null = null;
  let finalRear: ContactObservation | null = null;

  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    updateDrivingActuators(
      vehicle.actuator,
      input,
      substep,
      profile.actuator,
      vehicle.steeringCalibration.steeringActuatorResponse,
    );
    const body = arcadeBodyKinematics(vehicle, workspace.body);
    const bodyTravelDirection = vehicleBodyTravelDirection(body, profile.steeringLowSpeedRegularization);
    const steeringOffset = vehicle.actuator.steering * vehicle.steeringCalibration.steeringOffsetMax;
    const frontBeforeSteer = deriveContactObservation(
      guide,
      height,
      surfaces,
      body,
      profile.frontStation,
      vehicle.frontSteerAngle,
      vehicle.course.segmentIndex,
      workspace.front,
    );
    const automaticSteer = clamp(bodyTravelDirection, -automaticMax, automaticMax);
    const deliveredOffset = limitSteeringInput(
      automaticSteer,
      steeringOffset,
      body,
      frontBeforeSteer,
      vehicle.tireFrictionCalibration.front,
      workspace.steering,
    );
    const target = clamp(
      automaticSteer + deliveredOffset,
      -calibration.maxRoadWheelSteer,
      calibration.maxRoadWheelSteer,
    );
    vehicle.frontSteerAngle = stepSteeringRack(
      vehicle.frontSteerAngle,
      target,
      steeringResponse,
      calibration.maxRoadWheelSteer,
    );
    const front = reorientContactObservation(frontBeforeSteer, body, vehicle.frontSteerAngle, workspace.front);
    const rear = deriveContactObservation(
      guide,
      height,
      surfaces,
      body,
      profile.rearStation,
      0,
      vehicle.course.segmentIndex,
      workspace.rear,
    );

    const driveTorque = updateAutomaticPowertrain(
      vehicle.powertrain,
      profile.powertrain,
      drivenWheelOmega(profile, vehicle.frontWheelOmega, vehicle.rearWheelOmega),
      vehicle.actuator.throttle,
      substep,
    );
    const frontDriveTorque = driveTorque * profile.frontDriveTorqueFraction;
    const rearDriveTorque = driveTorque - frontDriveTorque;
    const frontBrakeTorque = vehicle.actuator.brake * profile.frontStation.maxBrakeTorque;
    const rearBrakeTorque = vehicle.actuator.brake * profile.rearStation.maxBrakeTorque;
    const frontRequest = workspace.frontRequest;
    frontRequest.omegaPrevious = vehicle.frontWheelOmega;
    frontRequest.inertia = profile.frontStation.wheelInertia;
    frontRequest.rollingRadius = front.effectiveRollingRadius;
    frontRequest.longitudinalVelocity = front.longitudinalVelocity;
    frontRequest.lateralVelocity = front.lateralVelocity;
    frontRequest.normalLoad = front.tireFrameValid ? front.normalLoad : 0;
    frontRequest.gripFactor = front.surface.material.gripFactor;
    frontRequest.characteristics = vehicle.tireFrictionCalibration.front;
    frontRequest.rollingResistance = front.tireFrameValid ? front.surface.material.rollingResistance : 0;
    frontRequest.driveTorque = frontDriveTorque;
    frontRequest.brakeTorque = frontBrakeTorque;
    frontRequest.dt = substep;
    frontRequest.tire = profile.frontStation.tire;
    const rearRequest = workspace.rearRequest;
    rearRequest.omegaPrevious = vehicle.rearWheelOmega;
    rearRequest.inertia = profile.rearStation.wheelInertia;
    rearRequest.rollingRadius = rear.effectiveRollingRadius;
    rearRequest.longitudinalVelocity = rear.longitudinalVelocity;
    rearRequest.lateralVelocity = rear.lateralVelocity;
    rearRequest.normalLoad = rear.tireFrameValid ? rear.normalLoad : 0;
    rearRequest.gripFactor = rear.surface.material.gripFactor;
    rearRequest.characteristics = vehicle.tireFrictionCalibration.rear;
    rearRequest.rollingResistance = rear.tireFrameValid ? rear.surface.material.rollingResistance : 0;
    rearRequest.driveTorque = rearDriveTorque;
    rearRequest.brakeTorque = rearBrakeTorque;
    rearRequest.dt = substep;
    rearRequest.tire = profile.rearStation.tire;
    const resolved = solveProtectedWheelPair(
      profile,
      body,
      front,
      rear,
      frontRequest,
      rearRequest,
      vehicle.torqueProtection,
      workspace.pair,
    );
    const { frontWheel, rearWheel } = resolved;
    vehicle.frontWheelOmega = frontWheel.omega;
    vehicle.rearWheelOmega = rearWheel.omega;

    const { force: totalForce, moment: totalMoment } = resolved.wrench;

    vehicle.velocityX += (totalForce.x / profile.mass) * substep;
    vehicle.velocityY += (totalForce.y / profile.mass) * substep;
    vehicle.velocityZ += (totalForce.z / profile.mass) * substep;
    vehicle.yawRate += (totalMoment.y / profile.yawInertia) * substep;
    vehicle.pitchRate -= (dot3(totalMoment, body.right) / profile.pitchInertia) * substep;
    vehicle.x += vehicle.velocityX * substep;
    vehicle.y += vehicle.velocityY * substep;
    vehicle.z += vehicle.velocityZ * substep;
    vehicle.yaw = wrapAngle(vehicle.yaw + vehicle.yawRate * substep);
    vehicle.pitch = wrapAngle(vehicle.pitch + vehicle.pitchRate * substep);
    refreshGuideObservation(guide, vehicle, workspace.projection);

    // Output-only cache: observers consume one completed outer update, never an inner trial.
    if (step === VEHICLE_SUBSTEPS - 1) {
      vehicle.control.steeringRequest = steeringRequest;
      vehicle.control.steeringActuator = vehicle.actuator.steering;
      vehicle.control.automaticSteerAngle = automaticSteer;
      vehicle.control.requestedSteerOffset = steeringOffset;
      vehicle.control.deliveredSteerOffset = deliveredOffset;
      vehicle.control.targetSteerAngle = automaticSteer + deliveredOffset;
      vehicle.control.throttleActuator = vehicle.actuator.throttle;
      vehicle.control.brakeActuator = vehicle.actuator.brake;
      vehicle.control.actualSteerAngle = vehicle.frontSteerAngle;
      vehicle.control.handwheelAngle = vehicle.frontSteerAngle * profile.steeringRatio;
      vehicle.control.frontSlipAngle =
        front.forceTransmitting && front.tireFrameValid
          ? regularizedTireSlipAngle(
              front.longitudinalVelocity,
              front.lateralVelocity,
              profile.frontStation.tire.lowSpeedRegularization,
            )
          : 0;
      vehicle.control.deliveredDriveTorque =
        driveTorque -
        (frontDriveTorque - resolved.frontInput.driveTorque) -
        (rearDriveTorque - resolved.rearInput.driveTorque);
      vehicle.control.requestedFrontDriveTorque = frontDriveTorque;
      vehicle.control.requestedRearDriveTorque = rearDriveTorque;
      vehicle.control.frontDriveTorque = resolved.frontInput.driveTorque;
      vehicle.control.rearDriveTorque = resolved.rearInput.driveTorque;
      vehicle.control.requestedFrontBrakeTorque = frontBrakeTorque;
      vehicle.control.requestedRearBrakeTorque = rearBrakeTorque;
      vehicle.control.frontBrakeTorque = resolved.frontInput.brakeTorque;
      vehicle.control.rearBrakeTorque = resolved.rearInput.brakeTorque;
      vehicle.control.supportTorqueScale = resolved.supportScale;
      vehicle.control.supportFeasible = resolved.supportFeasible;
      publishVehicleTireObservation(vehicle, front, frontWheel, rear, rearWheel);
      vehicle.control.frontWheelLocked = frontWheel.locked;
      vehicle.control.rearWheelLocked = rearWheel.locked;
      vehicle.control.frontUtilization = Number.isFinite(frontWheel.tire.rho) ? frontWheel.tire.rho : 0;
      vehicle.control.rearUtilization = Number.isFinite(rearWheel.tire.rho) ? rearWheel.tire.rho : 0;
    }

    finalFront = front;
    finalRear = rear;
  }

  if (finalFront && finalRear) {
    updateContactTelemetry(vehicle, finalFront, finalRear);
    vehicle.surfaceType = representativeSurfaceType(workspace.contacts);
  }
  const velocityDelta = workspace.velocityDelta;
  velocityDelta.x = vehicle.velocityX - velocityBeforeX;
  velocityDelta.y = vehicle.velocityY - velocityBeforeY;
  velocityDelta.z = vehicle.velocityZ - velocityBeforeZ;
  const finalBody = arcadeBodyKinematics(vehicle, workspace.body);
  vehicle.longitudinalAcceleration = dot3(velocityDelta, finalBody.forward) / dt;
  vehicle.lateralAcceleration = dot3(velocityDelta, finalBody.right) / dt;
}

/** Shared rack expression; public callers validate once before entering this primitive. */
function stepSteeringRack(current: number, target: number, response: number, maximum: number): number {
  return clamp(current + (target - current) * response, -maximum, maximum);
}

/** Body-CG travel direction in the body-pitch plane; finite and zero at rest. */
function vehicleBodyTravelDirection(body: BodyKinematics, lowSpeedRegularization: number): number {
  if (!(lowSpeedRegularization > 0) || !Number.isFinite(lowSpeedRegularization)) {
    throw new RangeError('vehicle travel-direction regularization must be finite and > 0');
  }
  const longitudinal = dot3(body.velocity, body.forward);
  const lateral = dot3(body.velocity, body.right);
  return Math.atan2(lateral, Math.hypot(longitudinal, lowSpeedRegularization));
}

export function createBodyKinematicsWorkspace() {
  const v = () => ({ x: 0, y: 0, z: 0 });
  return { position: v(), velocity: v(), right: v(), up: v(), forward: v(), omegaWorld: v() };
}
export function arcadeBodyKinematics(
  vehicle: ArcadeVehicleState,
  out: ReturnType<typeof createBodyKinematicsWorkspace>,
): BodyKinematics {
  const sinYaw = Math.sin(vehicle.yaw),
    cosYaw = Math.cos(vehicle.yaw);
  const sinPitch = Math.sin(vehicle.pitch),
    cosPitch = Math.cos(vehicle.pitch);
  const { right, forward, up, omegaWorld } = out;
  right.x = cosYaw;
  right.y = 0;
  right.z = -sinYaw;
  forward.x = sinYaw * cosPitch;
  forward.y = sinPitch;
  forward.z = cosYaw * cosPitch;
  normalize3(forward, forward);
  normalize3(cross3(forward, right, up), up);
  omegaWorld.x = WORLD_UP.x * vehicle.yawRate + right.x * -vehicle.pitchRate;
  omegaWorld.y = WORLD_UP.y * vehicle.yawRate + right.y * -vehicle.pitchRate;
  omegaWorld.z = WORLD_UP.z * vehicle.yawRate + right.z * -vehicle.pitchRate;
  out.position.x = vehicle.x;
  out.position.y = vehicle.y;
  out.position.z = vehicle.z;
  out.velocity.x = vehicle.velocityX;
  out.velocity.y = vehicle.velocityY;
  out.velocity.z = vehicle.velocityZ;
  return out;
}

const stepWorkspaces = new WeakMap<ArcadeVehicleState, ReturnType<typeof createStepWorkspace>>();
function createStepWorkspace(vehicle: ArcadeVehicleState) {
  const front = createContactWorkspace(vehicle.profile.frontStation),
    rear = createContactWorkspace(vehicle.profile.rearStation);
  const request = (tire: WheelSolveInput['tire']): Writable<WheelSolveInput> => ({
    omegaPrevious: 0,
    inertia: 1,
    rollingRadius: 1,
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    normalLoad: 0,
    gripFactor: 0,
    rollingResistance: 0,
    driveTorque: 0,
    brakeTorque: 0,
    dt: 1,
    tire,
  });
  const frontRequest = request(vehicle.profile.frontStation.tire),
    rearRequest = request(vehicle.profile.rearStation.tire);
  return {
    projection: createGuideProjectionWorkspace(),
    velocityDelta: { x: 0, y: 0, z: 0 },
    body: createBodyKinematicsWorkspace(),
    steering: createSteeringLimitWorkspace(),
    front,
    rear,
    contacts: [front.value, rear.value],
    frontRequest,
    rearRequest,
    pair: createProtectedWheelPairWorkspace(frontRequest, rearRequest),
  };
}

function updateContactTelemetry(
  vehicle: ArcadeVehicleState,
  front: ContactObservation,
  rear: ContactObservation,
): void {
  vehicle.frontNormalLoad = front.normalLoad;
  vehicle.rearNormalLoad = rear.normalLoad;
  vehicle.frontGap = front.gap;
  vehicle.rearGap = rear.gap;
  vehicle.frontSupportAvailable = front.supportAvailable;
  vehicle.rearSupportAvailable = rear.supportAvailable;
}

const derivedWorkspaces = new WeakMap<ArcadeVehicleState, ReturnType<typeof createBodyKinematicsWorkspace>>();
// Shared accessor functions retain identical public descriptors and a common object layout across actors.
const derivedProperties: PropertyDescriptorMap = {
  speed: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return vehicleSpeed(this);
    },
  },
  verticalSpeed: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return this.velocityY;
    },
  },
  longitudinalSpeed: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      const body = arcadeBodyKinematics(this, derivedWorkspaces.get(this)!);
      return bodyFrameVelocity(this, body.forward, body.right).longitudinal;
    },
  },
  lateralSpeed: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      const body = arcadeBodyKinematics(this, derivedWorkspaces.get(this)!);
      return bodyFrameVelocity(this, body.forward, body.right).lateral;
    },
  },
  steerAngle: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return this.frontSteerAngle;
    },
  },
  supported: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return this.frontNormalLoad > 0 || this.rearNormalLoad > 0;
    },
  },
  sprungPitch: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return this.pitch;
    },
  },
  presentationY: {
    enumerable: true,
    get(this: ArcadeVehicleState) {
      return this.y - this.profile.desiredCgHeight;
    },
  },
};
function installArcadeVehicleDerivedAccessors(vehicle: ArcadeVehicleState): ArcadeVehicleState {
  derivedWorkspaces.set(vehicle, createBodyKinematicsWorkspace());
  Object.defineProperties(vehicle, derivedProperties);
  return vehicle;
}
