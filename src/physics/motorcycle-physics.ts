import type { DrivingInput } from '../input/driving-input.js';
import { guideCoordinateToWorld, type GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import { clamp } from '../core/math.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { M5CarState } from './car-physics.js';
import { ensureM5DerivedAccessors } from './car-physics.js';
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
  copyCommonVehicleDynamicsState,
  createReducedContactStations,
  createVehicleControlState,
  integrateWorldPlanarPose,
  setBodyFrameVelocity,
  updateReducedContactsAndVerticalBody,
  vehicleGrounded,
  type VehicleDynamicsState,
} from './vehicle-dynamics.js';

export interface MotorcyclePhysicsProfile {
  mass: number;
  wheelbase: number;
  frontWeightFraction: number;
  maxBank: number;
  bankTau: number;
  yawTau: number;
  steeringTau: number;
  gripBankScale: number;
  lowSpeedBankReference: number;
  lowSpeedBankMinimum: number;
  maxDriveForce: number;
  maxBrakeForce: number;
  topSpeed: number;
  aeroDrag: number;
  frontBrakeFraction: number;
  lateralGripScale: number;
  looseFrictionReference: number;
  looseSlipScale: number;
  looseSlipTau: number;
  airborneBankTau: number;
  airborneLateralDamping: number;
  airborneYawDamping: number;
  airborneWheelSpinDamping: number;
  sprungRollMax: number;
  powertrain: AutomaticPowertrainProfile;
  maxFallSpeed: number;
  contactTolerance: number;
  contactReleaseGap: number;
  supportedPitchTau: number;
  airbornePitchDamping: number;
}

export const M5_BIKE_PROFILE: Readonly<MotorcyclePhysicsProfile> = {
  mass: 285,
  wheelbase: 1.52,
  frontWeightFraction: 0.47,
  maxBank: 52 * Math.PI / 180,
  bankTau: 0.20,
  yawTau: 0.13,
  steeringTau: 0.08,
  gripBankScale: 0.95,
  lowSpeedBankReference: 12,
  lowSpeedBankMinimum: 0.25,
  maxDriveForce: 3300,
  maxBrakeForce: 5200,
  topSpeed: 90,
  aeroDrag: 0.24,
  frontBrakeFraction: 0.72,
  lateralGripScale: 0.95,
  looseFrictionReference: 1.05,
  looseSlipScale: 0.06,
  looseSlipTau: 0.20,
  airborneBankTau: 0.45,
  airborneLateralDamping: 0.05,
  airborneYawDamping: 0.08,
  airborneWheelSpinDamping: 0.10,
  sprungRollMax: 0.55,
  powertrain: {
    idleRpm: 1200,
    redlineRpm: 12000,
    upshiftRpm: 10500,
    downshiftRpm: 4200,
    shiftDuration: 0.10,
    engineResponseTau: 0.06,
    torqueConverterSlipRpm: 900,
    finalDriveRatio: 3.0,
    drivenWheelRadius: 0.31,
    efficiency: 0.92,
    gearRatios: [2.50, 1.80, 1.40, 1.15, 1.00, 0.88],
    torqueCurve: [
      { rpm: 1200, torqueNewtonMeters: 75 },
      { rpm: 4500, torqueNewtonMeters: 125 },
      { rpm: 8000, torqueNewtonMeters: 150 },
      { rpm: 10500, torqueNewtonMeters: 138 },
      { rpm: 12000, torqueNewtonMeters: 0 },
    ],
  },
  maxFallSpeed: 55,
  contactTolerance: 0.035,
  contactReleaseGap: 0.45,
  supportedPitchTau: 0.09,
  airbornePitchDamping: 0.7,
};

/** Bike and car share body/contact shape, but neither concrete model inherits the other's solver. */
export interface M5BikeState extends VehicleDynamicsState {
  speed: number;
  verticalSpeed: number;
  longitudinalSpeed: number;
  lateralSpeed: number;
  steerAngle: number;
  supported: boolean;
  bankAngle: number;
  bankRate: number;
}

export function createM5Bike(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  s = 45,
  l = 0,
): M5BikeState {
  const p = guideCoordinateToWorld(guide, s, l);
  const surface = surfaces.sample(p.s, l);
  const speed = 45;
  const groundHeight = height.samplePhysics(p.s);
  const frontOffset = M5_BIKE_PROFILE.wheelbase * (1 - M5_BIKE_PROFILE.frontWeightFraction);
  const rearOffset = -M5_BIKE_PROFILE.wheelbase * M5_BIKE_PROFILE.frontWeightFraction;
  const state = {
    x: p.x,
    y: groundHeight,
    z: p.z,
    yaw: p.heading,
    velocityX: Math.sin(p.heading) * speed,
    velocityY: 0,
    velocityZ: Math.cos(p.heading) * speed,
    yawRate: 0,
    course: { s: p.s, l, segmentIndex: p.segmentIndex, distanceSquared: 0 },
    sprungPitch: 0,
    sprungPitchRate: 0,
    sprungRoll: 0,
    sprungRollRate: 0,
    longitudinalAcceleration: 0,
    lateralAcceleration: 0,
    surfaceType: surface.type,
    contacts: createReducedContactStations(frontOffset, rearOffset, 0, surface.material, groundHeight),
    control: createVehicleControlState(),
    powertrain: createAutomaticPowertrainState(M5_BIKE_PROFILE.powertrain, speed),
    bankAngle: 0,
    bankRate: 0,
  } as M5BikeState;
  return ensureM5DerivedAccessors(state) as M5BikeState;
}

export function updateM5Bike(
  guide: GuideCoordinateSource,
  height: HeightProfileReader,
  surfaces: SurfaceMapReader,
  bike: M5BikeState,
  input: DrivingInput,
  dt: number,
  profile: MotorcyclePhysicsProfile = M5_BIKE_PROFILE,
): void {
  const material = aggregateContactMaterial(bike);
  const before = bodyFrameVelocity(bike);
  const speed = Math.max(0, before.longitudinal);
  bike.control.steeringRequest = clamp(input.steering, -1, 1);

  if (vehicleGrounded(bike)) {
    const gripBankLimit = Math.atan(material.friction * profile.gripBankScale);
    const availableBank = Math.min(profile.maxBank, gripBankLimit);
    const bankTarget = bike.control.steeringRequest * availableBank
      * clamp(speed / profile.lowSpeedBankReference, profile.lowSpeedBankMinimum, 1);
    const previousBank = bike.bankAngle;
    bike.bankAngle += (bankTarget - bike.bankAngle)
      * (1 - Math.exp(-dt / Math.max(profile.bankTau, 1e-4)));
    bike.bankRate = (bike.bankAngle - previousBank) / Math.max(dt, 1e-6);
    integrateBikeGroundDynamics(bike, input, material, dt, profile);
  } else {
    const previousBank = bike.bankAngle;
    bike.bankAngle += -bike.bankAngle * (1 - Math.exp(-dt / profile.airborneBankTau));
    bike.bankRate = (bike.bankAngle - previousBank) / Math.max(dt, 1e-6);
    setBodyFrameVelocity(
      bike,
      before.longitudinal - Math.sign(before.longitudinal)
        * (profile.aeroDrag * before.longitudinal * Math.abs(before.longitudinal) / profile.mass) * dt,
      before.lateral * Math.exp(-dt * profile.airborneLateralDamping),
    );
    bike.yawRate *= Math.exp(-dt * profile.airborneYawDamping);
    for (const contact of bike.contacts) {
      contact.wheelAngularSpeed *= Math.exp(-dt * profile.airborneWheelSpinDamping);
    }
    updateAutomaticPowertrain(
      bike.powertrain,
      profile.powertrain,
      before.longitudinal,
      input.throttle ? 1 : 0,
      dt,
    );
    bike.lateralAcceleration = 0;
    resetAppliedControls(bike);
  }

  integrateWorldPlanarPose(guide, bike, dt);
  const frontOffset = profile.wheelbase * (1 - profile.frontWeightFraction);
  const rearOffset = -profile.wheelbase * profile.frontWeightFraction;
  updateReducedContactsAndVerticalBody(guide, height, surfaces, bike, {
    maxFallSpeed: profile.maxFallSpeed,
    contactTolerance: profile.contactTolerance,
    contactReleaseGap: profile.contactReleaseGap,
    supportedPitchTau: profile.supportedPitchTau,
    airbornePitchDamping: profile.airbornePitchDamping,
  }, dt);

  const after = bodyFrameVelocity(bike);
  bike.longitudinalAcceleration = (after.longitudinal - before.longitudinal) / Math.max(dt, 1e-6);
  const previousRoll = bike.sprungRoll;
  bike.sprungRoll = clamp(bike.bankAngle / profile.maxBank, -1, 1) * profile.sprungRollMax;
  bike.sprungRollRate = (bike.sprungRoll - previousRoll) / Math.max(dt, 1e-6);
}

function integrateBikeGroundDynamics(
  bike: M5BikeState,
  input: DrivingInput,
  material: ReturnType<typeof aggregateContactMaterial>,
  dt: number,
  profile: MotorcyclePhysicsProfile,
): void {
  const body = bodyFrameVelocity(bike);
  const speed = Math.max(0, body.longitudinal);
  const driveRequested = clamp(updateAutomaticPowertrain(
    bike.powertrain,
    profile.powertrain,
    speed,
    input.throttle ? 1 : 0,
    dt,
  ) * material.driveScale, 0, profile.maxDriveForce);
  const brakeRequested = input.brake ? profile.maxBrakeForce : 0;
  const passive = profile.aeroDrag * speed ** 2
    + material.rollingResistance * profile.mass * VEHICLE_GRAVITY;
  const frontNormal = profile.mass * VEHICLE_GRAVITY * profile.frontWeightFraction;
  const rearNormal = profile.mass * VEHICLE_GRAVITY - frontNormal;
  bike.contacts[0].normalLoad = frontNormal;
  bike.contacts[1].normalLoad = rearNormal;

  const frontBrakeRequested = brakeRequested * profile.frontBrakeFraction;
  const rearBrakeRequested = brakeRequested * (1 - profile.frontBrakeFraction);
  const rearDriveApplied = Math.min(driveRequested, material.friction * rearNormal);
  const frontBrakeApplied = Math.min(frontBrakeRequested, material.friction * frontNormal);
  const rearBrakeCapacity = Math.max(0, material.friction * rearNormal - rearDriveApplied);
  const rearBrakeApplied = Math.min(rearBrakeRequested, rearBrakeCapacity);
  bike.control.appliedDrive = driveRequested > 0 ? rearDriveApplied / driveRequested : 0;
  bike.control.appliedFrontBrake = frontBrakeRequested > 0 ? frontBrakeApplied / frontBrakeRequested : 0;
  bike.control.appliedRearBrake = rearBrakeRequested > 0 ? rearBrakeApplied / rearBrakeRequested : 0;
  bike.control.tractionControlActive = driveRequested > 0 && bike.control.appliedDrive < 0.999;
  bike.control.absActive = brakeRequested > 0
    && Math.min(bike.control.appliedFrontBrake, bike.control.appliedRearBrake) < 0.999;
  const wheelAngularSpeed = speed / profile.powertrain.drivenWheelRadius;
  bike.contacts[0].wheelAngularSpeed = wheelAngularSpeed;
  bike.contacts[1].wheelAngularSpeed = wheelAngularSpeed;

  const fx = rearDriveApplied - frontBrakeApplied - rearBrakeApplied - passive;
  const nextSpeed = Math.max(0, speed + fx / profile.mass * dt);
  const gripLat = material.friction * VEHICLE_GRAVITY * profile.lateralGripScale;
  bike.lateralAcceleration = clamp(VEHICLE_GRAVITY * Math.tan(bike.bankAngle), -gripLat, gripLat);
  const yawTarget = bike.lateralAcceleration / Math.max(nextSpeed, 3);
  bike.yawRate += (yawTarget - bike.yawRate)
    * (1 - Math.exp(-dt / Math.max(profile.yawTau, 1e-4)));
  const loose = 1 - clamp(material.friction / profile.looseFrictionReference, 0, 1);
  const lateralTarget = -bike.control.steeringRequest * loose * nextSpeed * profile.looseSlipScale;
  const nextLateral = body.lateral + (lateralTarget - body.lateral)
    * (1 - Math.exp(-dt / profile.looseSlipTau));
  setBodyFrameVelocity(bike, nextSpeed, nextLateral);

  const steerTarget = Math.atan(profile.wheelbase * bike.yawRate / Math.max(nextSpeed, 3));
  bike.control.actualSteerAngle += (steerTarget - bike.control.actualSteerAngle)
    * (1 - Math.exp(-dt / Math.max(profile.steeringTau, 1e-4)));
}

function resetAppliedControls(bike: M5BikeState): void {
  bike.control.appliedDrive = 0;
  bike.control.appliedFrontBrake = 0;
  bike.control.appliedRearBrake = 0;
  bike.control.tractionControlActive = false;
  bike.control.absActive = false;
}

export function adoptM5BikeKinematics(target: M5BikeState, source: M5CarState): void {
  copyCommonVehicleDynamicsState(target, source);
  target.bankAngle = clamp(source.sprungRoll / M5_BIKE_PROFILE.sprungRollMax, -1, 1)
    * M5_BIKE_PROFILE.maxBank;
  target.bankRate = 0;
}

export function adoptM5CarKinematics(target: M5CarState, source: M5BikeState): void {
  copyCommonVehicleDynamicsState(target, source);
  target.frontLateralForce = 0;
  target.rearLateralForce = 0;
  target.sprungRoll = source.sprungRoll;
}
