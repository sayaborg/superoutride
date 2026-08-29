import type { DrivingInput } from '../input/driving-input.js';
import { clamp, wrapAngle } from '../core/math.js';
import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { SurfaceMapReader } from './surface-map.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import {
  VEHICLE_GRAVITY,
  VEHICLE_SUBSTEPS,
  bodyFrameVelocity,
  compileSuspensionStation,
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
  type ContactStationProfile,
  type VehicleControlState,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';
import {
  regularizedTireSlipAngle,
  solveWheelOmega,
  validateCompiledTireProfile,
  type CompiledTireProfile,
} from './tire-wheel.js';
import {
  WORLD_UP,
  add3,
  cross3,
  dot3,
  normalize3,
  scale3,
  type Vec3,
} from './vehicle-math3.js';

export interface CarPhysicsProfile {
  readonly mass: number;
  readonly yawInertia: number;
  readonly pitchInertia: number;
  readonly frontAxle: number;
  readonly rearAxle: number;
  readonly desiredCgHeight: number;

  readonly frontRideFrequency: number;
  readonly rearRideFrequency: number;
  readonly frontDampingRatio: number;
  readonly rearDampingRatio: number;
  readonly frontQBump: number;
  readonly rearQBump: number;
  readonly frontQTravel: number;
  readonly rearQTravel: number;
  readonly frontBumpForceMax: number;
  readonly rearBumpForceMax: number;

  readonly wheelRadius: number;
  /** Equivalent rotational inertia of both wheels represented by the front axle station. */
  readonly frontWheelInertia: number;
  /** Equivalent rotational inertia of both wheels represented by the rear axle station. */
  readonly rearWheelInertia: number;

  readonly muRef: number;
  readonly rhoKnee: number;
  readonly lowSpeedRegularization: number;
  readonly frontNormalizedStiffness: number;
  readonly rearNormalizedStiffness: number;

  /** Mechanical road-wheel stop. This is not an ordinary useful-steer limit. */
  readonly maxRoadWheelSteer: number;
  /** Full normalized driver request's steady front-slip equilibrium. */
  readonly assistedSlipAngleMax: number;
  /** Slew rate from digital input toward the requested assisted front-slip angle. */
  readonly assistedSlipAngleRate: number;
  /** Fast overdamped road-wheel self-aligning response time. */
  readonly selfSteerResponseTau: number;
  /** Equivalent handwheel angle / road-wheel angle. */
  readonly steeringRatio: number;
  readonly frontBrakeTorqueMax: number;
  readonly rearBrakeTorqueMax: number;
  /** F = -quadraticDrag * |v_planar| * v_planar, applied at the CG. */
  readonly quadraticDrag: number;
  readonly powertrain: AutomaticPowertrainProfile;
}

export interface CompiledCarPhysicsProfile extends CarPhysicsProfile {
  readonly frontStation: ContactStationProfile;
  readonly rearStation: ContactStationProfile;
}

export const M5_CAR_PROFILE: Readonly<CompiledCarPhysicsProfile> = compileCarPhysicsProfile({
  mass: 1310,
  yawInertia: 2350,
  pitchInertia: 2550,
  frontAxle: 1.16,
  rearAxle: 1.44,
  desiredCgHeight: 0.55,

  frontRideFrequency: 1.8,
  rearRideFrequency: 1.8,
  frontDampingRatio: 0.35,
  rearDampingRatio: 0.35,
  frontQBump: 0.205,
  rearQBump: 0.205,
  // The authored DEV crest/recontact and brake envelope reaches roughly 0.305 m from full
  // extension after canonical static spawn. Keep a finite margin without weakening qTravel
  // rejection or clamping compression/load.
  frontQTravel: 0.32,
  rearQTravel: 0.32,
  frontBumpForceMax: 90_000,
  rearBumpForceMax: 78_000,

  wheelRadius: 0.33,
  frontWheelInertia: 2.2,
  rearWheelInertia: 2.4,

  muRef: 1.35,
  rhoKnee: 0.74,
  lowSpeedRegularization: 1.0,
  frontNormalizedStiffness: 9,
  rearNormalizedStiffness: 10.5,

  maxRoadWheelSteer: 31 * Math.PI / 180,
  assistedSlipAngleMax: 6.5 * Math.PI / 180,
  assistedSlipAngleRate: 24 * Math.PI / 180,
  selfSteerResponseTau: 0.01,
  steeringRatio: 15,
  frontBrakeTorqueMax: 3_070,
  rearBrakeTorqueMax: 1_880,
  quadraticDrag: 0.39,
  powertrain: {
    idleRpm: 850,
    redlineRpm: 7200,
    upshiftRpm: 6500,
    downshiftRpm: 2400,
    shiftDuration: 0.05,
    engineResponseTau: 0.08,
    torqueConverterSlipRpm: 650,
    finalDriveRatio: 3.50,
    efficiency: 0.90,
    gearRatios: [3.10, 2.10, 1.55, 1.18, 0.88, 0.65],
    torqueCurve: [
      { rpm: 850, torqueNewtonMeters: 280 },
      { rpm: 2500, torqueNewtonMeters: 430 },
      { rpm: 4500, torqueNewtonMeters: 500 },
      { rpm: 6500, torqueNewtonMeters: 455 },
      { rpm: 7200, torqueNewtonMeters: 0 },
    ],
  },
});

export interface M5CarState extends VehicleDynamicsState {
  readonly kind: 'CAR';
  yaw: number;
  pitch: number;
  yawRate: number;
  pitchRate: number;
  frontSteerAngle: number;
  assistedSlipAngleCommand: number;
  frontWheelOmega: number;
  rearWheelOmega: number;

  /** Derived-output cache only; never consumed by the next physics solve. */
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
  readonly sprungRoll: number;
  readonly presentationY: number;
}

export function compileCarPhysicsProfile(profile: CarPhysicsProfile): Readonly<CompiledCarPhysicsProfile> {
  if (!(profile.mass > 0)) throw new RangeError('CAR mass must be > 0');
  if (!(profile.yawInertia > 0 && profile.pitchInertia > 0)) throw new RangeError('CAR inertias must be > 0');
  if (!(profile.frontAxle > 0 && profile.rearAxle > 0)) throw new RangeError('CAR axle distances must be > 0');
  if (!(profile.desiredCgHeight > 0)) throw new RangeError('CAR CG height must be > 0');
  if (!(profile.frontNormalizedStiffness < profile.rearNormalizedStiffness)) {
    throw new RangeError('CAR baseline requires positive understeer gradient: kFront < kRear');
  }
  if (!(profile.wheelRadius > 0 && profile.frontWheelInertia > 0 && profile.rearWheelInertia > 0)) {
    throw new RangeError('CAR wheel radius/inertias must be > 0');
  }
  if (!(profile.maxRoadWheelSteer > 0 && profile.maxRoadWheelSteer < Math.PI / 2)) {
    throw new RangeError('CAR mechanical road-wheel steer must lie in (0, pi/2)');
  }
  if (!(profile.assistedSlipAngleMax > 0 && profile.assistedSlipAngleMax < Math.PI / 2)) {
    throw new RangeError('CAR assisted slip angle must lie in (0, pi/2)');
  }
  if (!(profile.assistedSlipAngleRate > 0 && Number.isFinite(profile.assistedSlipAngleRate))) {
    throw new RangeError('CAR assisted slip angle rate must be finite and > 0');
  }
  if (!(profile.selfSteerResponseTau > 0 && Number.isFinite(profile.selfSteerResponseTau))) {
    throw new RangeError('CAR self-steer response time must be finite and > 0');
  }
  if (!(profile.steeringRatio > 0 && Number.isFinite(profile.steeringRatio))) {
    throw new RangeError('CAR steering ratio must be finite and > 0');
  }
  if (!(profile.frontBrakeTorqueMax >= 0 && profile.rearBrakeTorqueMax >= 0)) {
    throw new RangeError('CAR brake torques must be >= 0');
  }
  if (!(profile.quadraticDrag >= 0)) throw new RangeError('CAR quadratic drag must be >= 0');

  const wheelbase = profile.frontAxle + profile.rearAxle;
  const frontStaticLoad = profile.mass * VEHICLE_GRAVITY * profile.rearAxle / wheelbase;
  const rearStaticLoad = profile.mass * VEHICLE_GRAVITY * profile.frontAxle / wheelbase;
  const frontSuspension = compileSuspensionStation(
    frontStaticLoad,
    profile.frontRideFrequency,
    profile.frontDampingRatio,
    profile.frontQBump,
    profile.frontQTravel,
    profile.frontBumpForceMax,
  );
  const rearSuspension = compileSuspensionStation(
    rearStaticLoad,
    profile.rearRideFrequency,
    profile.rearDampingRatio,
    profile.rearQBump,
    profile.rearQTravel,
    profile.rearBumpForceMax,
  );
  const frontTire: CompiledTireProfile = Object.freeze({
    muRef: profile.muRef,
    normalizedStiffness: profile.frontNormalizedStiffness,
    cornerStiffness: profile.frontNormalizedStiffness * frontStaticLoad,
    rhoKnee: profile.rhoKnee,
    lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  const rearTire: CompiledTireProfile = Object.freeze({
    muRef: profile.muRef,
    normalizedStiffness: profile.rearNormalizedStiffness,
    cornerStiffness: profile.rearNormalizedStiffness * rearStaticLoad,
    rhoKnee: profile.rhoKnee,
    lowSpeedRegularization: profile.lowSpeedRegularization,
  });
  validateCompiledTireProfile(frontTire);
  validateCompiledTireProfile(rearTire);

  const frontStation: ContactStationProfile = Object.freeze({
    id: 'FRONT',
    forwardOffset: profile.frontAxle,
    freeReachDown: profile.desiredCgHeight + frontSuspension.qStatic,
    rollingRadius: profile.wheelRadius,
    crownRadius: 0,
    wheelInertia: profile.frontWheelInertia,
    maxBrakeTorque: profile.frontBrakeTorqueMax,
    suspension: frontSuspension,
    tire: frontTire,
  });
  const rearStation: ContactStationProfile = Object.freeze({
    id: 'REAR',
    forwardOffset: -profile.rearAxle,
    freeReachDown: profile.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: profile.wheelRadius,
    crownRadius: 0,
    wheelInertia: profile.rearWheelInertia,
    maxBrakeTorque: profile.rearBrakeTorqueMax,
    suspension: rearSuspension,
    tire: rearTire,
  });
  return Object.freeze({ ...profile, frontStation, rearStation });
}

export function createM5Car(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  s = 45,
  l = 0,
  initialSpeed = 45,
  profile: CompiledCarPhysicsProfile = M5_CAR_PROFILE,
): M5CarState {
  const surfaceCoordinate = { s, l, segmentIndex: 0, distanceSquared: 0 };
  const surface = sampleSurfaceGeometryAtCoordinate(
    guide,
    height,
    surfaces,
    { ...surfaceCoordinate, segmentIndex: locateSegmentIndex(guide, s) },
  );
  if (!surface.material.supported) throw new Error('CAR spawn requires supported surface');
  const yaw = Math.atan2(surface.horizontalTangent.x, surface.horizontalTangent.z);
  const pitch = surface.gradeAngle;
  const position = add3(surface.point, scale3(surface.normal, profile.desiredCgHeight));
  const initialVelocity = scale3(surface.tangent, initialSpeed);
  const omega = initialSpeed / profile.wheelRadius;
  const state = {
    kind: 'CAR',
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
    assistedSlipAngleCommand: 0,
    frontWheelOmega: omega,
    rearWheelOmega: omega,
    course: initializeGuideObservation(guide, position.x, position.z),
    surfaceType: surface.surfaceType,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(profile.powertrain, omega),
    frontNormalLoad: 0,
    rearNormalLoad: 0,
    frontGap: 0,
    rearGap: 0,
    frontSupportAvailable: true,
    rearSupportAvailable: true,
  } as M5CarState;
  return installCarDerivedAccessors(state, profile);
}

export function updateM5Car(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  car: M5CarState,
  input: DrivingInput,
  dt: number,
  profile: CompiledCarPhysicsProfile = M5_CAR_PROFILE,
): void {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('CAR dt must be finite and > 0');
  const velocityBefore = { x: car.velocityX, y: car.velocityY, z: car.velocityZ };
  const substep = dt / VEHICLE_SUBSTEPS;
  let finalFront: ContactObservation | null = null;
  let finalRear: ContactObservation | null = null;
  let finalFrontFx = 0;
  let finalFrontFy = 0;
  let finalRearFx = 0;
  let finalRearFy = 0;

  for (let step = 0; step < VEHICLE_SUBSTEPS; step += 1) {
    const bodyBeforeSteer = carBodyKinematics(car);
    const frontBefore = deriveContactObservation(
      guide, height, surfaces, bodyBeforeSteer, profile.frontStation,
      car.frontSteerAngle, 0, car.course.segmentIndex,
    );
    const steeringRequest = clamp(input.steering, -1, 1);
    const previousSteer = car.frontSteerAngle;
    const observedFrontSlip = frontBefore.forceTransmitting && frontBefore.tireFrameValid
      ? regularizedTireSlipAngle(
        frontBefore.longitudinalVelocity,
        frontBefore.lateralVelocity,
        profile.lowSpeedRegularization,
      )
      : 0;
    car.assistedSlipAngleCommand = stepCarAssistedSlipAngleCommand(
      car.assistedSlipAngleCommand,
      steeringRequest,
      substep,
      profile,
    );
    car.frontSteerAngle = stepCarSelfSteering(
      car.frontSteerAngle,
      car.assistedSlipAngleCommand,
      observedFrontSlip,
      substep,
      profile,
    );
    const steerRate = (car.frontSteerAngle - previousSteer) / substep;

    const body = carBodyKinematics(car);
    const front = deriveContactObservation(
      guide, height, surfaces, body, profile.frontStation,
      car.frontSteerAngle, steerRate, car.course.segmentIndex,
    );
    const rear = deriveContactObservation(
      guide, height, surfaces, body, profile.rearStation,
      0, 0, car.course.segmentIndex,
    );

    const driveTorque = updateAutomaticPowertrain(
      car.powertrain,
      profile.powertrain,
      car.rearWheelOmega,
      input.throttle ? 1 : 0,
      substep,
    );
    const frontBrakeTorque = input.brake ? profile.frontBrakeTorqueMax : 0;
    const rearBrakeTorque = input.brake ? profile.rearBrakeTorqueMax : 0;

    const frontWheel = solveWheelOmega({
      omegaPrevious: car.frontWheelOmega,
      inertia: profile.frontWheelInertia,
      rollingRadius: front.effectiveRollingRadius,
      longitudinalVelocity: front.longitudinalVelocity,
      lateralVelocity: front.lateralVelocity,
      normalLoad: front.tireFrameValid ? front.normalLoad : 0,
      gripFactor: front.surface.material.gripFactor,
      rollingResistance: front.tireFrameValid ? front.surface.material.rollingResistance : 0,
      driveTorque: 0,
      brakeTorque: frontBrakeTorque,
      dt: substep,
      tire: profile.frontStation.tire,
    });
    const rearWheel = solveWheelOmega({
      omegaPrevious: car.rearWheelOmega,
      inertia: profile.rearWheelInertia,
      rollingRadius: rear.effectiveRollingRadius,
      longitudinalVelocity: rear.longitudinalVelocity,
      lateralVelocity: rear.lateralVelocity,
      normalLoad: rear.tireFrameValid ? rear.normalLoad : 0,
      gripFactor: rear.surface.material.gripFactor,
      rollingResistance: rear.tireFrameValid ? rear.surface.material.rollingResistance : 0,
      driveTorque,
      brakeTorque: rearBrakeTorque,
      dt: substep,
      tire: profile.rearStation.tire,
    });

    car.frontWheelOmega = frontWheel.omega;
    car.rearWheelOmega = rearWheel.omega;

    const frontForce = contactForceWorld(front, frontWheel.tire.fx, frontWheel.tire.fy);
    const rearForce = contactForceWorld(rear, rearWheel.tire.fx, rearWheel.tire.fy);
    const planarVelocity = { x: car.velocityX, y: 0, z: car.velocityZ };
    const planarSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
    const aeroForce = scale3(planarVelocity, -profile.quadraticDrag * planarSpeed);
    const gravity = { x: 0, y: -profile.mass * VEHICLE_GRAVITY, z: 0 };
    const totalForce = add3(add3(frontForce, rearForce), add3(aeroForce, gravity));

    const cg = body.position;
    const contactMoment = add3(
      momentAboutCg(front, cg, frontForce),
      momentAboutCg(rear, cg, rearForce),
    );
    // Phase 9 final audit closure: wheel spin angular-momentum magnitude change belongs to the
    // body+wheel balance. CAR has no roll DOF, so only the allowed pitch projection is integrated.
    const wheelReaction = add3(
      scale3(front.wheelAxis, -profile.frontWheelInertia * frontWheel.omegaDot),
      scale3(rear.wheelAxis, -profile.rearWheelInertia * rearWheel.omegaDot),
    );
    const totalMoment = add3(contactMoment, wheelReaction);

    car.velocityX += totalForce.x / profile.mass * substep;
    car.velocityY += totalForce.y / profile.mass * substep;
    car.velocityZ += totalForce.z / profile.mass * substep;
    car.yawRate += totalMoment.y / profile.yawInertia * substep;
    // `pitch` is nose-up-positive, while positive right-axis rotation is nose-down under the
    // repository's +Z-forward/+X-right convention. Project the physical moment with the matching
    // sign so suspension load transfer damps displacement instead of reinforcing it.
    car.pitchRate -= dot3(totalMoment, body.right) / profile.pitchInertia * substep;
    car.x += car.velocityX * substep;
    car.y += car.velocityY * substep;
    car.z += car.velocityZ * substep;
    car.yaw = wrapAngle(car.yaw + car.yawRate * substep);
    car.pitch = wrapAngle(car.pitch + car.pitchRate * substep);
    refreshGuideObservation(guide, car);

    car.control.steeringRequest = steeringRequest;
    car.control.actualSteerAngle = car.frontSteerAngle;
    car.control.handwheelAngle = car.frontSteerAngle * profile.steeringRatio;
    car.control.frontSlipAngle = front.forceTransmitting && front.tireFrameValid
      ? regularizedTireSlipAngle(
        front.longitudinalVelocity,
        front.lateralVelocity,
        profile.lowSpeedRegularization,
      )
      : 0;
    car.control.requestedDriveTorque = driveTorque;
    car.control.frontBrakeTorque = frontBrakeTorque;
    car.control.rearBrakeTorque = rearBrakeTorque;
    car.control.frontWheelLocked = frontWheel.locked;
    car.control.rearWheelLocked = rearWheel.locked;
    car.control.frontUtilization = Number.isFinite(frontWheel.tire.rho) ? frontWheel.tire.rho : 0;
    car.control.rearUtilization = Number.isFinite(rearWheel.tire.rho) ? rearWheel.tire.rho : 0;

    finalFront = front;
    finalRear = rear;
    finalFrontFx = frontWheel.tire.fx;
    finalFrontFy = frontWheel.tire.fy;
    finalRearFx = rearWheel.tire.fx;
    finalRearFy = rearWheel.tire.fy;
  }

  if (finalFront && finalRear) {
    updateCarContactTelemetry(car, finalFront, finalRear);
    car.surfaceType = representativeSurfaceType([finalFront, finalRear]);
  }
  const velocityDelta = {
    x: car.velocityX - velocityBefore.x,
    y: car.velocityY - velocityBefore.y,
    z: car.velocityZ - velocityBefore.z,
  };
  const finalBody = carBodyKinematics(car);
  car.longitudinalAcceleration = dot3(velocityDelta, finalBody.forward) / dt;
  car.lateralAcceleration = dot3(velocityDelta, finalBody.right) / dt;
  void finalFrontFx;
  void finalFrontFy;
  void finalRearFx;
  void finalRearFy;
}

/**
 * Digital input slews one assisted-slip command. This is the input-device response; it is not a
 * second road-wheel-angle authority.
 */
export function stepCarAssistedSlipAngleCommand(
  assistedSlipAngleCommand: number,
  steeringRequest: number,
  dt: number,
  profile: Pick<CompiledCarPhysicsProfile,
    'assistedSlipAngleMax' | 'assistedSlipAngleRate'>,
): number {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError('CAR assisted-slip command dt must be finite and > 0');
  }
  if (![assistedSlipAngleCommand, steeringRequest].every(Number.isFinite)) {
    throw new RangeError('CAR assisted-slip command inputs must be finite');
  }
  const target = clamp(steeringRequest, -1, 1) * profile.assistedSlipAngleMax;
  const maximumChange = profile.assistedSlipAngleRate * dt;
  return assistedSlipAngleCommand + clamp(
    target - assistedSlipAngleCommand,
    -maximumChange,
    maximumChange,
  );
}

/**
 * Fast overdamped virtual rack balance. The separately slew-limited command makes a short digital
 * press small without forcing road-wheel self-alignment to lag behind the vehicle response.
 */
export function stepCarSelfSteering(
  roadWheelAngle: number,
  assistedSlipAngleCommand: number,
  observedFrontSlipAngle: number,
  dt: number,
  profile: Pick<CompiledCarPhysicsProfile,
    'selfSteerResponseTau' | 'maxRoadWheelSteer'>,
): number {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('CAR self-steer dt must be finite and > 0');
  if (![roadWheelAngle, assistedSlipAngleCommand, observedFrontSlipAngle].every(Number.isFinite)) {
    throw new RangeError('CAR self-steer inputs must be finite');
  }
  const steerRate = (assistedSlipAngleCommand - observedFrontSlipAngle)
    / profile.selfSteerResponseTau;
  return clamp(
    roadWheelAngle + steerRate * dt,
    -profile.maxRoadWheelSteer,
    profile.maxRoadWheelSteer,
  );
}

function carBodyKinematics(car: M5CarState): BodyKinematics {
  const right = { x: Math.cos(car.yaw), y: 0, z: -Math.sin(car.yaw) };
  const forward = normalize3({
    x: Math.sin(car.yaw) * Math.cos(car.pitch),
    y: Math.sin(car.pitch),
    z: Math.cos(car.yaw) * Math.cos(car.pitch),
  }, { x: Math.sin(car.yaw), y: 0, z: Math.cos(car.yaw) });
  const up = normalize3(cross3(forward, right), WORLD_UP);
  const omegaWorld = add3(scale3(WORLD_UP, car.yawRate), scale3(right, -car.pitchRate));
  return {
    position: { x: car.x, y: car.y, z: car.z },
    velocity: { x: car.velocityX, y: car.velocityY, z: car.velocityZ },
    right,
    up,
    forward,
    omegaWorld,
  };
}

function updateCarContactTelemetry(
  car: M5CarState,
  front: ContactObservation,
  rear: ContactObservation,
): void {
  car.frontNormalLoad = front.normalLoad;
  car.rearNormalLoad = rear.normalLoad;
  car.frontGap = front.gap;
  car.rearGap = rear.gap;
  car.frontSupportAvailable = front.supportAvailable;
  car.rearSupportAvailable = rear.supportAvailable;
}

function installCarDerivedAccessors(
  car: M5CarState,
  profile: CompiledCarPhysicsProfile,
): M5CarState {
  Object.defineProperties(car, {
    speed: { enumerable: true, get: () => vehicleSpeed(car) },
    verticalSpeed: { enumerable: true, get: () => car.velocityY },
    longitudinalSpeed: {
      enumerable: true,
      get: () => {
        const body = carBodyKinematics(car);
        return bodyFrameVelocity(car, body.forward, body.right).longitudinal;
      },
    },
    lateralSpeed: {
      enumerable: true,
      get: () => {
        const body = carBodyKinematics(car);
        return bodyFrameVelocity(car, body.forward, body.right).lateral;
      },
    },
    steerAngle: { enumerable: true, get: () => car.frontSteerAngle },
    supported: { enumerable: true, get: () => car.frontNormalLoad > 0 || car.rearNormalLoad > 0 },
    sprungPitch: { enumerable: true, get: () => car.pitch },
    sprungRoll: { enumerable: true, get: () => 0 },
    presentationY: { enumerable: true, get: () => car.y - profile.desiredCgHeight },
  });
  return car;
}

function locateSegmentIndex(guide: GuideCoordinateSource, s: number): number {
  const curve = 'guide' in guide ? guide.guide : guide;
  return sampleSurfaceSegmentIndex(curve.segments, s);
}

function sampleSurfaceSegmentIndex(
  segments: readonly { readonly sStart: number; readonly sEnd: number; readonly index: number }[],
  s: number,
): number {
  for (const segment of segments) {
    if (s >= segment.sStart - 1e-9 && s <= segment.sEnd + 1e-9) return segment.index;
  }
  throw new RangeError('CAR spawn s is outside Guide');
}

export function ensureM5DerivedAccessors<T extends M5CarState>(state: T): T {
  return installCarDerivedAccessors(state, M5_CAR_PROFILE) as T;
}

export type { VehicleControlState };
