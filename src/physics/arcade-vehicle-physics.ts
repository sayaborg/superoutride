import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
} from './automatic-powertrain.js';
import {
  createDrivingActuatorState,
  updateDrivingActuators,
  type DrivingActuatorState,
} from './driving-actuator.js';
import type { SurfaceMapReader } from './surface-map.js';
import {
  VEHICLE_GRAVITY,
  VEHICLE_SUBSTEPS,
  bodyFrameVelocity,
  contactForceWorld,
  createVehicleControlState,
  deriveContactObservation,
  initializeGuideObservation,
  momentAboutCg,
  refreshGuideObservation,
  representativeSurfaceType,
  sampleSurfaceGeometryAtCoordinate,
  vehicleSpeed,
  type BodyKinematics,
  type ContactObservation,
  type VehicleControlState,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';
import {
  regularizedTireSlipAngle,
  solveWheelOmega,
} from './tire-wheel.js';
import {
  WORLD_UP,
  add3,
  cross3,
  dot3,
  normalize3,
  scale3,
} from './vehicle-math3.js';
import {
  drivenWheelOmega,
  type CompiledArcadeVehicleProfile,
} from './vehicle-profiles.js';
import {
  assertArcadeSteeringAngleCalibration,
  createArcadeSteeringCalibration,
  steeringAutomaticMax,
  type ArcadeSteeringCalibrationInput,
  type ArcadeSteeringCalibrationState,
} from './vehicle-calibration.js';
import {
  createArcadeTireFrictionCalibration,
  type ArcadeTireFrictionCalibrationInput,
  type ArcadeTireFrictionCalibrationState,
} from './tire-friction-calibration.js';

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
  readonly tireFrictionCalibration: ArcadeTireFrictionCalibrationState;
  frontWheelOmega: number;
  rearWheelOmega: number;
  readonly actuator: DrivingActuatorState;

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

export function createArcadeVehicle(
  profile: CompiledArcadeVehicleProfile,
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  s = 45,
  l = 0,
  initialSpeed = 45,
  steeringCalibration: ArcadeSteeringCalibrationInput = {},
  tireFrictionCalibration: ArcadeTireFrictionCalibrationInput = {},
): ArcadeVehicleState {
  const resolvedSteeringCalibration = createArcadeSteeringCalibration(
    profile,
    steeringCalibration,
  );
  const resolvedTireFrictionCalibration = createArcadeTireFrictionCalibration(
    tireFrictionCalibration,
  );
  const coordinate = { s, l, segmentIndex: locateSegmentIndex(guide, s), distanceSquared: 0 };
  const surface = sampleSurfaceGeometryAtCoordinate(guide, height, surfaces, coordinate);
  if (!surface.material.supported) throw new Error('vehicle spawn requires supported surface');
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const pitch = surface.gradeAngle;
  const position = add3(surface.point, scale3(surface.normal, profile.desiredCgHeight));
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const frontOmega = initialSpeed / profile.frontWheelRadius;
  const rearOmega = initialSpeed / profile.rearWheelRadius;
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
    course: initializeGuideObservation(guide, position.x, position.z),
    surfaceType: surface.surfaceType,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(
      profile.powertrain,
      drivenWheelOmega(profile, frontOmega, rearOmega),
    ),
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
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  vehicle: ArcadeVehicleState,
  input: DrivingInput,
  dt: number,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('vehicle dt must be finite and > 0');
  const profile = vehicle.profile;
  const velocityBefore = { x: vehicle.velocityX, y: vehicle.velocityY, z: vehicle.velocityZ };
  const substep = dt / VEHICLE_SUBSTEPS;
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
    const steeringRequest = clamp(input.steering, -1, 1);
    const bodyBeforeSteer = arcadeBodyKinematics(vehicle);
    const bodyTravelDirection = vehicleBodyTravelDirection(
      bodyBeforeSteer,
      profile.steeringLowSpeedRegularization,
    );
    const steeringOffset = vehicle.actuator.steering
      * vehicle.steeringCalibration.steeringOffsetMax;
    vehicle.frontSteerAngle = stepTravelDirectionSteering(
      vehicle.frontSteerAngle,
      steeringOffset,
      bodyTravelDirection,
      vehicle.steeringCalibration,
      substep,
      profile,
    );
    const body = arcadeBodyKinematics(vehicle);
    const front = deriveContactObservation(
      guide,
      height,
      surfaces,
      body,
      profile.frontStation,
      vehicle.frontSteerAngle,
      vehicle.course.segmentIndex,
    );
    const rear = deriveContactObservation(
      guide,
      height,
      surfaces,
      body,
      profile.rearStation,
      0,
      vehicle.course.segmentIndex,
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
    const frontBrakeTorque = vehicle.actuator.brake * profile.frontBrakeTorqueMax;
    const rearBrakeTorque = vehicle.actuator.brake * profile.rearBrakeTorqueMax;
    const frontWheel = solveWheelOmega({
      omegaPrevious: vehicle.frontWheelOmega,
      inertia: profile.frontWheelInertia,
      rollingRadius: front.effectiveRollingRadius,
      longitudinalVelocity: front.longitudinalVelocity,
      lateralVelocity: front.lateralVelocity,
      normalLoad: front.tireFrameValid ? front.normalLoad : 0,
      gripFactor: front.surface.material.gripFactor,
      referenceFrictionMultiplier:
        vehicle.tireFrictionCalibration.referenceFrictionMultiplier,
      linearStiffnessMultiplier:
        vehicle.tireFrictionCalibration.linearStiffnessMultiplier,
      slidingFrictionRatio:
        vehicle.tireFrictionCalibration.slidingFrictionRatio,
      rollingResistance: front.tireFrameValid ? front.surface.material.rollingResistance : 0,
      driveTorque: frontDriveTorque,
      brakeTorque: frontBrakeTorque,
      dt: substep,
      tire: profile.frontStation.tire,
    });
    const rearWheel = solveWheelOmega({
      omegaPrevious: vehicle.rearWheelOmega,
      inertia: profile.rearWheelInertia,
      rollingRadius: rear.effectiveRollingRadius,
      longitudinalVelocity: rear.longitudinalVelocity,
      lateralVelocity: rear.lateralVelocity,
      normalLoad: rear.tireFrameValid ? rear.normalLoad : 0,
      gripFactor: rear.surface.material.gripFactor,
      referenceFrictionMultiplier:
        vehicle.tireFrictionCalibration.referenceFrictionMultiplier,
      linearStiffnessMultiplier:
        vehicle.tireFrictionCalibration.linearStiffnessMultiplier,
      slidingFrictionRatio:
        vehicle.tireFrictionCalibration.slidingFrictionRatio,
      rollingResistance: rear.tireFrameValid ? rear.surface.material.rollingResistance : 0,
      driveTorque: rearDriveTorque,
      brakeTorque: rearBrakeTorque,
      dt: substep,
      tire: profile.rearStation.tire,
    });
    vehicle.frontWheelOmega = frontWheel.omega;
    vehicle.rearWheelOmega = rearWheel.omega;

    const frontForce = contactForceWorld(front, frontWheel.tire.fx, frontWheel.tire.fy);
    const rearForce = contactForceWorld(rear, rearWheel.tire.fx, rearWheel.tire.fy);
    const planarVelocity = { x: vehicle.velocityX, y: 0, z: vehicle.velocityZ };
    const planarSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
    const aeroForce = scale3(planarVelocity, -profile.quadraticDrag * planarSpeed);
    const gravity = { x: 0, y: -profile.mass * VEHICLE_GRAVITY, z: 0 };
    const totalForce = add3(add3(frontForce, rearForce), add3(aeroForce, gravity));
    const contactMoment = add3(
      momentAboutCg(front, body.position, frontForce),
      momentAboutCg(rear, body.position, rearForce),
    );
    // The reduced model keeps wheel-speed angular-momentum magnitude reaction in its available
    // pitch/yaw projections. It has no independent roll/crown/gyro authority.
    const wheelReaction = add3(
      scale3(front.wheelAxis, -profile.frontWheelInertia * frontWheel.omegaDot),
      scale3(rear.wheelAxis, -profile.rearWheelInertia * rearWheel.omegaDot),
    );
    const totalMoment = add3(contactMoment, wheelReaction);

    vehicle.velocityX += totalForce.x / profile.mass * substep;
    vehicle.velocityY += totalForce.y / profile.mass * substep;
    vehicle.velocityZ += totalForce.z / profile.mass * substep;
    vehicle.yawRate += totalMoment.y / profile.yawInertia * substep;
    vehicle.pitchRate -= dot3(totalMoment, body.right) / profile.pitchInertia * substep;
    vehicle.x += vehicle.velocityX * substep;
    vehicle.y += vehicle.velocityY * substep;
    vehicle.z += vehicle.velocityZ * substep;
    vehicle.yaw = wrapAngle(vehicle.yaw + vehicle.yawRate * substep);
    vehicle.pitch = wrapAngle(vehicle.pitch + vehicle.pitchRate * substep);
    refreshGuideObservation(guide, vehicle);

    vehicle.control.steeringRequest = steeringRequest;
    vehicle.control.steeringActuator = vehicle.actuator.steering;
    vehicle.control.throttleActuator = vehicle.actuator.throttle;
    vehicle.control.brakeActuator = vehicle.actuator.brake;
    vehicle.control.actualSteerAngle = vehicle.frontSteerAngle;
    vehicle.control.handwheelAngle = vehicle.frontSteerAngle * profile.steeringRatio;
    vehicle.control.frontSlipAngle = front.forceTransmitting && front.tireFrameValid
      ? regularizedTireSlipAngle(
        front.longitudinalVelocity,
        front.lateralVelocity,
        profile.lowSpeedRegularization,
      )
      : 0;
    vehicle.control.deliveredDriveTorque = driveTorque;
    vehicle.control.frontBrakeTorque = frontBrakeTorque;
    vehicle.control.rearBrakeTorque = rearBrakeTorque;
    vehicle.control.frontWheelLocked = frontWheel.locked;
    vehicle.control.rearWheelLocked = rearWheel.locked;
    vehicle.control.frontUtilization = Number.isFinite(frontWheel.tire.rho) ? frontWheel.tire.rho : 0;
    vehicle.control.rearUtilization = Number.isFinite(rearWheel.tire.rho) ? rearWheel.tire.rho : 0;

    finalFront = front;
    finalRear = rear;
  }

  if (finalFront && finalRear) {
    updateContactTelemetry(vehicle, finalFront, finalRear);
    vehicle.surfaceType = representativeSurfaceType([finalFront, finalRear]);
  }
  const velocityDelta = {
    x: vehicle.velocityX - velocityBefore.x,
    y: vehicle.velocityY - velocityBefore.y,
    z: vehicle.velocityZ - velocityBefore.z,
  };
  const finalBody = arcadeBodyKinematics(vehicle);
  vehicle.longitudinalAcceleration = dot3(velocityDelta, finalBody.forward) / dt;
  vehicle.lateralAcceleration = dot3(velocityDelta, finalBody.right) / dt;
}

export function stepTravelDirectionSteering(
  roadWheelAngle: number,
  steeringOffset: number,
  bodyTravelDirection: number,
  calibration: ArcadeSteeringCalibrationState,
  dt: number,
  profile: Pick<CompiledArcadeVehicleProfile, 'steeringResponseTau'>,
): number {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('vehicle steering dt must be finite and > 0');
  if (![roadWheelAngle, steeringOffset, bodyTravelDirection].every(Number.isFinite)) {
    throw new RangeError('vehicle steering inputs must be finite');
  }
  assertArcadeSteeringAngleCalibration(calibration);
  const target = travelDirectionSteeringTarget(
    steeringOffset,
    bodyTravelDirection,
    calibration,
  );
  const response = 1 - Math.exp(-dt / profile.steeringResponseTau);
  return clamp(
    roadWheelAngle + (target - roadWheelAngle) * response,
    -calibration.maxRoadWheelSteer,
    calibration.maxRoadWheelSteer,
  );
}

export function travelDirectionSteeringTarget(
  steeringOffset: number,
  bodyTravelDirection: number,
  calibration: ArcadeSteeringCalibrationState,
): number {
  if (![steeringOffset, bodyTravelDirection].every(Number.isFinite)) {
    throw new RangeError('vehicle steering target inputs must be finite');
  }
  assertArcadeSteeringAngleCalibration(calibration);
  const automaticMax = steeringAutomaticMax(calibration);
  const automaticSteer = clamp(
    bodyTravelDirection,
    -automaticMax,
    automaticMax,
  );
  return clamp(
    automaticSteer + steeringOffset,
    -calibration.maxRoadWheelSteer,
    calibration.maxRoadWheelSteer,
  );
}

/** Body-CG travel direction in the body-pitch plane; finite and zero at rest. */
export function vehicleBodyTravelDirection(
  body: BodyKinematics,
  lowSpeedRegularization: number,
): number {
  if (!(lowSpeedRegularization > 0) || !Number.isFinite(lowSpeedRegularization)) {
    throw new RangeError('vehicle travel-direction regularization must be finite and > 0');
  }
  const longitudinal = dot3(body.velocity, body.forward);
  const lateral = dot3(body.velocity, body.right);
  return Math.atan2(
    lateral,
    Math.sqrt(longitudinal * longitudinal + lowSpeedRegularization ** 2),
  );
}

function arcadeBodyKinematics(vehicle: ArcadeVehicleState): BodyKinematics {
  const right = { x: Math.cos(vehicle.yaw), y: 0, z: -Math.sin(vehicle.yaw) };
  const forward = normalize3({
    x: Math.sin(vehicle.yaw) * Math.cos(vehicle.pitch),
    y: Math.sin(vehicle.pitch),
    z: Math.cos(vehicle.yaw) * Math.cos(vehicle.pitch),
  }, { x: Math.sin(vehicle.yaw), y: 0, z: Math.cos(vehicle.yaw) });
  const up = normalize3(cross3(forward, right), WORLD_UP);
  const omegaWorld = add3(
    scale3(WORLD_UP, vehicle.yawRate),
    scale3(right, -vehicle.pitchRate),
  );
  return {
    position: { x: vehicle.x, y: vehicle.y, z: vehicle.z },
    velocity: { x: vehicle.velocityX, y: vehicle.velocityY, z: vehicle.velocityZ },
    right,
    up,
    forward,
    omegaWorld,
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

function installArcadeVehicleDerivedAccessors(
  vehicle: ArcadeVehicleState,
): ArcadeVehicleState {
  Object.defineProperties(vehicle, {
    speed: { enumerable: true, get: () => vehicleSpeed(vehicle) },
    verticalSpeed: { enumerable: true, get: () => vehicle.velocityY },
    longitudinalSpeed: {
      enumerable: true,
      get: () => {
        const body = arcadeBodyKinematics(vehicle);
        return bodyFrameVelocity(vehicle, body.forward, body.right).longitudinal;
      },
    },
    lateralSpeed: {
      enumerable: true,
      get: () => {
        const body = arcadeBodyKinematics(vehicle);
        return bodyFrameVelocity(vehicle, body.forward, body.right).lateral;
      },
    },
    steerAngle: { enumerable: true, get: () => vehicle.frontSteerAngle },
    supported: {
      enumerable: true,
      get: () => vehicle.frontNormalLoad > 0 || vehicle.rearNormalLoad > 0,
    },
    sprungPitch: { enumerable: true, get: () => vehicle.pitch },
    presentationY: {
      enumerable: true,
      get: () => vehicle.y - vehicle.profile.desiredCgHeight,
    },
  });
  return vehicle;
}

function locateSegmentIndex(guide: GuideCoordinateSource, s: number): number {
  const curve = 'guide' in guide ? guide.guide : guide;
  for (const segment of curve.segments) {
    if (s >= segment.sStart - 1e-9 && s <= segment.sEnd + 1e-9) return segment.index;
  }
  throw new RangeError('vehicle spawn s is outside Guide');
}

export type { VehicleControlState };
