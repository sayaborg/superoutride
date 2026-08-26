import type { DrivingInput } from '../input/driving-input.js';
import { guideCoordinateToWorld, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { clamp } from '../core/math.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { SurfaceMapReader } from './surface-map.js';
import {
  createAutomaticPowertrainState,
  updateAutomaticPowertrain,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import {
  VEHICLE_GRAVITY,
  aggregateContactMaterial,
  bodyFrameVelocity,
  createReducedContactStations,
  createVehicleControlState,
  integrateWorldPlanarPose,
  setBodyFrameVelocity,
  updateReducedContactsAndVerticalBody,
  vehicleGrounded,
  vehicleSpeed,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';

export interface CarPhysicsProfile {
  mass: number;
  bodyWidth: number;
  trackWidth: number;
  yawInertia: number;
  frontAxle: number;
  rearAxle: number;
  frontCornerStiffness: number;
  rearCornerStiffness: number;
  maxSteer: number;
  steeringTau: number;
  lowSpeedThreshold: number;
  rackMinimumRatio: number;
  rackReferenceSpeed: number;
  frontSlipUtilization: number;
  optimalFrontSlipMin: number;
  optimalFrontSlipMax: number;
  maxDriveForce: number;
  maxBrakeForce: number;
  topSpeed: number;
  aeroDrag: number;
  rollingSpeedEpsilon: number;
  frontDriveFraction: number;
  frontBrakeFraction: number;
  rearTractionScale: number;
  lowSpeedYawTau: number;
  lowSpeedLateralTau: number;
  maxLateralSpeed: number;
  maxYawRate: number;
  airborneLateralDamping: number;
  airborneYawDamping: number;
  airborneWheelSpinDamping: number;
  sprungRollRadiansPerG: number;
  sprungRollTau: number;
  powertrain: AutomaticPowertrainProfile;
  maxFallSpeed: number;
  contactTolerance: number;
  contactReleaseGap: number;
  supportedPitchTau: number;
  airbornePitchDamping: number;
}

export const M5_CAR_PROFILE: Readonly<CarPhysicsProfile> = {
  mass: 1320,
  bodyWidth: 2.0,
  trackWidth: 1.62,
  yawInertia: 2350,
  frontAxle: 1.16,
  rearAxle: 1.44,
  frontCornerStiffness: 78000,
  rearCornerStiffness: 86000,
  maxSteer: 31 * Math.PI / 180,
  steeringTau: 0.10,
  lowSpeedThreshold: 3,
  rackMinimumRatio: 0.16,
  rackReferenceSpeed: 24,
  frontSlipUtilization: 1.6,
  optimalFrontSlipMin: 3.5 * Math.PI / 180,
  optimalFrontSlipMax: 10 * Math.PI / 180,
  maxDriveForce: 7600,
  maxBrakeForce: 15000,
  topSpeed: 82,
  aeroDrag: 0.39,
  rollingSpeedEpsilon: 0.25,
  frontDriveFraction: 0.35,
  frontBrakeFraction: 0.62,
  rearTractionScale: 1.16,
  lowSpeedYawTau: 0.11,
  lowSpeedLateralTau: 0.08,
  maxLateralSpeed: 45,
  maxYawRate: 2.5,
  airborneLateralDamping: 0.05,
  airborneYawDamping: 0.08,
  airborneWheelSpinDamping: 0.12,
  sprungRollRadiansPerG: 0.16,
  sprungRollTau: 0.18,
  powertrain: {
    idleRpm: 850,
    redlineRpm: 7200,
    upshiftRpm: 6500,
    downshiftRpm: 2400,
    shiftDuration: 0.05,
    engineResponseTau: 0.08,
    torqueConverterSlipRpm: 650,
    finalDriveRatio: 3.50,
    drivenWheelRadius: 0.33,
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
  maxFallSpeed: 55,
  contactTolerance: 0.04,
  contactReleaseGap: 0.60,
  supportedPitchTau: 0.11,
  airbornePitchDamping: 0.9,
};

/** M7 body state. The final six properties are derived migration accessors, not stored state. */
export interface M5CarState extends VehicleDynamicsState {
  speed: number;
  verticalSpeed: number;
  longitudinalSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  supported: boolean;
}

export function createM5Car(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  s = 45,
  l = 0,
): M5CarState {
  const sample = guideCoordinateToWorld(guide, s, l);
  const surface = surfaces.sample(sample.s, l);
  const initialSpeed = 45;
  const groundHeight = height.samplePhysics(sample.s);
  const state = {
    x: sample.x,
    y: groundHeight,
    z: sample.z,
    yaw: sample.heading,
    velocityX: Math.sin(sample.heading) * initialSpeed,
    velocityY: 0,
    velocityZ: Math.cos(sample.heading) * initialSpeed,
    yawRate: 0,
    course: { s: sample.s, l, segmentIndex: sample.segmentIndex, distanceSquared: 0 },
    sprungPitch: 0,
    sprungPitchRate: 0,
    sprungRoll: 0,
    sprungRollRate: 0,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    surfaceType: surface.type,
    contacts: createReducedContactStations(
      M5_CAR_PROFILE.frontAxle,
      -M5_CAR_PROFILE.rearAxle,
      M5_CAR_PROFILE.trackWidth * 0.5,
      surface.material,
      groundHeight,
    ),
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(M5_CAR_PROFILE.powertrain, initialSpeed),
  } as M5CarState;
  return installDerivedM5Accessors(state);
}

export function updateM5Car(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  car: M5CarState,
  input: DrivingInput,
  dt: number,
  profile: CarPhysicsProfile = M5_CAR_PROFILE,
): void {
  const velocityBefore = bodyFrameVelocity(car);
  const material = aggregateContactMaterial(car);
  car.control.steeringRequest = clamp(input.steering, -1, 1);
  updateGripLimitedSteering(car, material.friction, dt, profile);

  if (vehicleGrounded(car)) integrateGroundDynamics(car, input, material, dt, profile);
  else integrateUnsupportedPlanar(car, input, dt, profile);

  integrateWorldPlanarPose(guide, car, dt);
  updateReducedContactsAndVerticalBody(guide, height, surfaces, car, {
    maxFallSpeed: profile.maxFallSpeed,
    contactTolerance: profile.contactTolerance,
    contactReleaseGap: profile.contactReleaseGap,
    supportedPitchTau: profile.supportedPitchTau,
    airbornePitchDamping: profile.airbornePitchDamping,
  }, dt);

  const velocityAfter = bodyFrameVelocity(car);
  car.longitudinalAcceleration = (velocityAfter.longitudinal - velocityBefore.longitudinal)
    / Math.max(dt, 1e-6);
  const previousRoll = car.sprungRoll;
  const rollTarget = clamp(car.lateralAcceleration / VEHICLE_GRAVITY, -1.2, 1.2)
    * profile.sprungRollRadiansPerG;
  car.sprungRoll += (rollTarget - car.sprungRoll)
    * (1 - Math.exp(-dt / profile.sprungRollTau));
  car.sprungRollRate = (car.sprungRoll - previousRoll) / Math.max(dt, 1e-6);
}

function updateGripLimitedSteering(
  car: M5CarState,
  mu: number,
  dt: number,
  profile: CarPhysicsProfile,
): void {
  const { longitudinal: u } = bodyFrameVelocity(car);
  const frontNormal = profile.mass * VEHICLE_GRAVITY * profile.rearAxle
    / (profile.frontAxle + profile.rearAxle);
  const optimalSlip = clamp(
    mu * frontNormal / profile.frontCornerStiffness * profile.frontSlipUtilization,
    profile.optimalFrontSlipMin,
    profile.optimalFrontSlipMax,
  );
  const rackEnvelope = profile.rackMinimumRatio
    + (1 - profile.rackMinimumRatio) / (1 + (Math.abs(u) / profile.rackReferenceSpeed) ** 2);
  const request = car.control.steeringRequest * profile.maxSteer * rackEnvelope;
  const limited = Math.abs(u) < profile.lowSpeedThreshold
    ? request
    : clamp(request, -optimalSlip, optimalSlip);
  // Neutral returns to zero. No automatic countersteer authority is introduced here.
  const target = car.control.steeringRequest === 0 ? 0 : limited;
  car.control.actualSteerAngle += (target - car.control.actualSteerAngle)
    * (1 - Math.exp(-dt / Math.max(profile.steeringTau, 1e-4)));
}

function integrateGroundDynamics(
  car: M5CarState,
  input: DrivingInput,
  material: ReturnType<typeof aggregateContactMaterial>,
  dt: number,
  profile: CarPhysicsProfile,
): void {
  const m = profile.mass;
  const a = profile.frontAxle;
  const b = profile.rearAxle;
  const wheelbase = a + b;
  const { longitudinal: u, lateral: v } = bodyFrameVelocity(car);
  const driveRequested = clamp(updateAutomaticPowertrain(
    car.powertrain,
    profile.powertrain,
    u,
    input.throttle ? 1 : 0,
    dt,
  ) * material.driveScale, 0, profile.maxDriveForce);
  const brakeDirection = u > 0.15 ? -1 : u < -0.15 ? 1 : 0;
  const brakeRequested = input.brake ? profile.maxBrakeForce * brakeDirection : 0;
  const drag = -profile.aeroDrag * u * Math.abs(u);
  const rolling = Math.abs(u) > profile.rollingSpeedEpsilon
    ? -Math.sign(u) * material.rollingResistance * m * VEHICLE_GRAVITY
    : 0;
  const fzFront = m * VEHICLE_GRAVITY * b / wheelbase;
  const fzRear = m * VEHICLE_GRAVITY * a / wheelbase;
  car.contacts[0].normalLoad = fzFront;
  car.contacts[1].normalLoad = fzRear;

  const driveFront = driveRequested * profile.frontDriveFraction;
  const driveRear = driveRequested * (1 - profile.frontDriveFraction);
  const brakeFront = brakeRequested * profile.frontBrakeFraction;
  const brakeRear = brakeRequested * (1 - profile.frontBrakeFraction);
  const passiveFront = (drag + rolling) * (fzFront / (m * VEHICLE_GRAVITY));
  const passiveRear = (drag + rolling) * (fzRear / (m * VEHICLE_GRAVITY));
  const frontLimit = material.friction * fzFront;
  const rearLimit = material.friction * fzRear * profile.rearTractionScale;
  const fxFront = clamp(driveFront + brakeFront + passiveFront, -frontLimit, frontLimit);
  const fxRear = clamp(driveRear + brakeRear + passiveRear, -rearLimit, rearLimit);

  const frontActuator = fxFront - passiveFront;
  const rearActuator = fxRear - passiveRear;
  const driveApplied = Math.max(0, frontActuator) + Math.max(0, rearActuator);
  car.control.appliedDrive = driveRequested > 0 ? clamp(driveApplied / driveRequested, 0, 1) : 0;
  car.control.appliedFrontBrake = brakeFront < 0 ? clamp(frontActuator / brakeFront, 0, 1) : 0;
  car.control.appliedRearBrake = brakeRear < 0 ? clamp(rearActuator / brakeRear, 0, 1) : 0;
  car.control.tractionControlActive = driveRequested > 0 && car.control.appliedDrive < 0.999;
  car.control.absActive = brakeRequested !== 0
    && Math.min(car.control.appliedFrontBrake, car.control.appliedRearBrake) < 0.999;
  const wheelAngularSpeed = u / profile.powertrain.drivenWheelRadius;
  car.contacts[0].wheelAngularSpeed = wheelAngularSpeed;
  car.contacts[1].wheelAngularSpeed = wheelAngularSpeed;

  if (Math.abs(u) < profile.lowSpeedThreshold) {
    car.yawRate += (u / wheelbase * Math.tan(car.control.actualSteerAngle) - car.yawRate)
      * (1 - Math.exp(-dt / profile.lowSpeedYawTau));
    const nextU = Math.max(0, u + (fxFront + fxRear) / m * dt);
    setBodyFrameVelocity(car, nextU, v * Math.exp(-dt / profile.lowSpeedLateralTau));
    car.lateralAcceleration = nextU * car.yawRate;
    return;
  }

  const uForSlip = Math.max(Math.abs(u), profile.lowSpeedThreshold);
  const alphaFront = Math.atan2(v + a * car.yawRate, uForSlip) - car.control.actualSteerAngle;
  const alphaRear = Math.atan2(v - b * car.yawRate, uForSlip);
  const fyFrontLimit = Math.sqrt(Math.max(0, frontLimit ** 2 - fxFront ** 2));
  const fyRearLimit = Math.sqrt(Math.max(0, rearLimit ** 2 - fxRear ** 2));
  const fyFront = clamp(-profile.frontCornerStiffness * alphaFront, -fyFrontLimit, fyFrontLimit);
  const fyRear = clamp(-profile.rearCornerStiffness * alphaRear, -fyRearLimit, fyRearLimit);
  const fy = fyFront + fyRear;
  // World velocity is authoritative. Do not also apply rotating-body-frame Coriolis terms;
  // the next body observation derives them once from the updated yaw and unchanged world vector.
  let nextU = u + (fxFront + fxRear) / m * dt;
  let nextV = v + fy / m * dt;
  car.yawRate += (a * fyFront - b * fyRear) / profile.yawInertia * dt;
  if (nextU < 0) {
    nextU = 0;
    if (input.brake) nextV *= 0.9;
  }
  setBodyFrameVelocity(car, nextU, clamp(nextV, -profile.maxLateralSpeed, profile.maxLateralSpeed));
  car.yawRate = clamp(car.yawRate, -profile.maxYawRate, profile.maxYawRate);
  car.lateralAcceleration = fy / m;
}

function integrateUnsupportedPlanar(
  car: M5CarState,
  input: DrivingInput,
  dt: number,
  profile: CarPhysicsProfile,
): void {
  const body = bodyFrameVelocity(car);
  updateAutomaticPowertrain(
    car.powertrain,
    profile.powertrain,
    body.longitudinal,
    input.throttle ? 1 : 0,
    dt,
  );
  const dragAccel = profile.aeroDrag * body.longitudinal * Math.abs(body.longitudinal) / profile.mass;
  setBodyFrameVelocity(
    car,
    body.longitudinal - Math.sign(body.longitudinal) * dragAccel * dt,
    body.lateral * Math.exp(-dt * profile.airborneLateralDamping),
  );
  car.yawRate *= Math.exp(-dt * profile.airborneYawDamping);
  for (const contact of car.contacts) {
    contact.wheelAngularSpeed *= Math.exp(-dt * profile.airborneWheelSpinDamping);
  }
  car.lateralAcceleration = 0;
  car.control.appliedDrive = 0;
  car.control.appliedFrontBrake = 0;
  car.control.appliedRearBrake = 0;
  car.control.tractionControlActive = input.throttle;
  car.control.absActive = input.brake;
}

function installDerivedM5Accessors<T extends VehicleDynamicsState>(state: T): T & M5CarState {
  Object.defineProperties(state, {
    speed: {
      enumerable: true,
      get: () => vehicleSpeed(state),
      set: () => { /* derived observation */ },
    },
    verticalSpeed: {
      enumerable: true,
      get: () => state.velocityY,
      set: (value: number) => { state.velocityY = value; },
    },
    longitudinalSpeed: {
      enumerable: true,
      get: () => bodyFrameVelocity(state).longitudinal,
      set: (value: number) => {
        const current = bodyFrameVelocity(state);
        setBodyFrameVelocity(state, value, current.lateral);
      },
    },
    lateralSpeed: {
      enumerable: true,
      get: () => bodyFrameVelocity(state).lateral,
      set: (value: number) => {
        const current = bodyFrameVelocity(state);
        setBodyFrameVelocity(state, current.longitudinal, value);
      },
    },
    steerAngle: {
      enumerable: true,
      get: () => state.control.actualSteerAngle,
      set: (value: number) => { state.control.actualSteerAngle = value; },
    },
    supported: {
      enumerable: true,
      get: () => vehicleGrounded(state),
      set: (value: boolean) => {
        for (const contact of state.contacts) contact.phase = value ? 'CONTACT' : 'AIRBORNE';
      },
    },
  });
  return state as T & M5CarState;
}

export function ensureM5DerivedAccessors<T extends VehicleDynamicsState>(state: T): T & M5CarState {
  return Object.prototype.hasOwnProperty.call(state, 'longitudinalSpeed')
    ? state as T & M5CarState
    : installDerivedM5Accessors(state);
}
