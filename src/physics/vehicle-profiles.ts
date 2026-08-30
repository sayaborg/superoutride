import {
  validateAutomaticPowertrainProfile,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import type { DrivingActuatorProfile } from './driving-actuator.js';
import { validateDrivingActuatorProfile } from './driving-actuator.js';
import {
  VEHICLE_GRAVITY,
  compileSuspensionStation,
  type ContactStationProfile,
} from './vehicle-dynamics.js';
import {
  validateCompiledTireProfile,
  type CompiledTireProfile,
} from './tire-wheel.js';

export type VehicleProfileId = 'FR' | 'MR' | 'RR' | 'AWD' | 'BIKE1' | 'BIKE2';

export interface ArcadeVehicleProfile {
  /** Composition/presentation identity. Common mechanics never branches on this value. */
  readonly id: VehicleProfileId;
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

  readonly frontWheelRadius: number;
  readonly rearWheelRadius: number;
  readonly frontWheelInertia: number;
  readonly rearWheelInertia: number;
  /** Fixed share of total powertrain torque sent to the front station; the remainder drives rear. */
  readonly frontDriveTorqueFraction: number;

  readonly muRef: number;
  readonly rhoKnee: number;
  readonly lowSpeedRegularization: number;
  readonly frontNormalizedStiffness: number;
  readonly rearNormalizedStiffness: number;

  readonly maxRoadWheelSteer: number;
  readonly steeringOffsetMax: number;
  readonly steeringResponseTau: number;
  readonly steeringYawPreviewTime: number;
  /** HUD-only handwheel presentation conversion; never consumed by mechanics. */
  readonly steeringRatio: number;
  readonly frontBrakeTorqueMax: number;
  readonly rearBrakeTorqueMax: number;
  readonly quadraticDrag: number;
  readonly actuator: DrivingActuatorProfile;
  readonly powertrain: AutomaticPowertrainProfile;
}

export interface CompiledArcadeVehicleProfile extends ArcadeVehicleProfile {
  readonly frontStation: ContactStationProfile;
  readonly rearStation: ContactStationProfile;
}

const COMMON_ACTUATOR: Readonly<DrivingActuatorProfile> = Object.freeze({
  steering: Object.freeze({
    applyRate: (24 * Math.PI / 180) / (15 * Math.PI / 180),
    releaseRate: (60 * Math.PI / 180) / (15 * Math.PI / 180),
  }),
  throttle: Object.freeze({ applyRate: 1 / 0.25, releaseRate: 1 / 0.125 }),
  brake: Object.freeze({ applyRate: 1 / 0.15, releaseRate: 1 / 0.10 }),
});

const CAR_PROFILE_AUTHORING: ArcadeVehicleProfile = {
  id: 'FR',
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
  frontQTravel: 0.32,
  rearQTravel: 0.32,
  frontBumpForceMax: 90_000,
  rearBumpForceMax: 78_000,
  frontWheelRadius: 0.33,
  rearWheelRadius: 0.33,
  frontWheelInertia: 2.2,
  rearWheelInertia: 2.4,
  frontDriveTorqueFraction: 0,
  muRef: 1.35,
  rhoKnee: 0.74,
  lowSpeedRegularization: 1.0,
  frontNormalizedStiffness: 9,
  rearNormalizedStiffness: 10.5,
  maxRoadWheelSteer: 31 * Math.PI / 180,
  steeringOffsetMax: 15 * Math.PI / 180,
  steeringResponseTau: 0.01,
  steeringYawPreviewTime: 0.12,
  steeringRatio: 18,
  frontBrakeTorqueMax: 3_070,
  rearBrakeTorqueMax: 1_880,
  quadraticDrag: 0.39,
  actuator: COMMON_ACTUATOR,
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
};

/** Provisional front-engine, rear-drive reference profile. */
export const FR_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile({ ...CAR_PROFILE_AUTHORING, id: 'FR' });

/** Provisional mid-engine, rear-drive profile: only distribution/inertia differ from FR. */
export const MR_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile({
    ...CAR_PROFILE_AUTHORING,
    id: 'MR',
    yawInertia: 2100,
    pitchInertia: 2350,
    frontAxle: 1.34,
    rearAxle: 1.26,
  });

/** Provisional rear-engine, rear-drive profile: only distribution/inertia differ from FR. */
export const RR_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile({
    ...CAR_PROFILE_AUTHORING,
    id: 'RR',
    yawInertia: 2200,
    pitchInertia: 2300,
    frontAxle: 1.55,
    rearAxle: 1.05,
  });

/** AWD shares the FR package and changes only fixed front/rear drive-torque distribution. */
export const AWD_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile({
    ...CAR_PROFILE_AUTHORING,
    id: 'AWD',
    frontDriveTorqueFraction: 0.5,
  });

const BIKE_PROFILE_AUTHORING: ArcadeVehicleProfile = {
  id: 'BIKE1',
  mass: 400,
  yawInertia: 500,
  pitchInertia: 500,
  frontAxle: 0.90,
  rearAxle: 1.10,
  desiredCgHeight: 0.55,
  frontRideFrequency: 1.8,
  rearRideFrequency: 1.8,
  frontDampingRatio: 0.35,
  rearDampingRatio: 0.35,
  frontQBump: 0.205,
  rearQBump: 0.205,
  frontQTravel: 0.32,
  rearQTravel: 0.32,
  frontBumpForceMax: 30_000,
  rearBumpForceMax: 26_000,
  frontWheelRadius: 0.300,
  rearWheelRadius: 0.335,
  frontWheelInertia: 0.47,
  rearWheelInertia: 0.72,
  frontDriveTorqueFraction: 0,
  muRef: 1.25,
  rhoKnee: 0.80,
  lowSpeedRegularization: 1.0,
  frontNormalizedStiffness: 9,
  rearNormalizedStiffness: 10.5,
  maxRoadWheelSteer: 31 * Math.PI / 180,
  steeringOffsetMax: 15 * Math.PI / 180,
  steeringResponseTau: 0.01,
  steeringYawPreviewTime: 0.12,
  steeringRatio: 18,
  frontBrakeTorqueMax: 1_300,
  rearBrakeTorqueMax: 600,
  quadraticDrag: 0.39,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 1200,
    redlineRpm: 12000,
    upshiftRpm: 10500,
    downshiftRpm: 4200,
    shiftDuration: 0.10,
    engineResponseTau: 0.06,
    torqueConverterSlipRpm: 900,
    finalDriveRatio: 3.0,
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
};

export const BIKE1_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile(BIKE_PROFILE_AUTHORING);

/** Provisional lighter bike; shared engine/tire package, distinct distribution and body inertia. */
export const BIKE2_VEHICLE_PROFILE: Readonly<CompiledArcadeVehicleProfile> =
  compileArcadeVehicleProfile({
    ...BIKE_PROFILE_AUTHORING,
    id: 'BIKE2',
    mass: 300,
    yawInertia: 340,
    pitchInertia: 360,
    frontAxle: 1.00,
    rearAxle: 1.00,
  });

export function compileArcadeVehicleProfile(
  profile: ArcadeVehicleProfile,
): Readonly<CompiledArcadeVehicleProfile> {
  const positive = [
    profile.mass,
    profile.yawInertia,
    profile.pitchInertia,
    profile.frontAxle,
    profile.rearAxle,
    profile.desiredCgHeight,
    profile.frontWheelRadius,
    profile.rearWheelRadius,
    profile.frontWheelInertia,
    profile.rearWheelInertia,
    profile.muRef,
    profile.lowSpeedRegularization,
    profile.frontNormalizedStiffness,
    profile.rearNormalizedStiffness,
    profile.maxRoadWheelSteer,
    profile.steeringOffsetMax,
    profile.steeringResponseTau,
  ];
  if (positive.some((value) => !(value > 0) || !Number.isFinite(value))) {
    throw new RangeError('vehicle mass/inertia/geometry/wheel/tire/steering values must be finite and > 0');
  }
  if (!(profile.rhoKnee > 0 && profile.rhoKnee < 1)) {
    throw new RangeError('vehicle tire rhoKnee must lie in (0,1)');
  }
  if (!(profile.maxRoadWheelSteer < Math.PI / 2 && profile.steeringOffsetMax < Math.PI / 2)) {
    throw new RangeError('vehicle steering angles must lie below pi/2');
  }
  if (!(profile.steeringYawPreviewTime >= 0) || !Number.isFinite(profile.steeringYawPreviewTime)) {
    throw new RangeError('vehicle yaw preview must be finite and >= 0');
  }
  if (!(profile.steeringRatio >= 0) || !Number.isFinite(profile.steeringRatio)) {
    throw new RangeError('vehicle steering ratio must be finite and >= 0');
  }
  if (!(profile.frontBrakeTorqueMax >= 0 && profile.rearBrakeTorqueMax >= 0)
    || ![profile.frontBrakeTorqueMax, profile.rearBrakeTorqueMax].every(Number.isFinite)) {
    throw new RangeError('vehicle brake torques must be finite and >= 0');
  }
  if (!(profile.frontDriveTorqueFraction >= 0 && profile.frontDriveTorqueFraction <= 1)
    || !Number.isFinite(profile.frontDriveTorqueFraction)) {
    throw new RangeError('vehicle front drive torque fraction must be finite and lie in [0,1]');
  }
  if (!(profile.quadraticDrag >= 0) || !Number.isFinite(profile.quadraticDrag)) {
    throw new RangeError('vehicle quadratic drag must be finite and >= 0');
  }
  validateDrivingActuatorProfile(profile.actuator);
  validateAutomaticPowertrainProfile(profile.powertrain);

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
    rollingRadius: profile.frontWheelRadius,
    wheelInertia: profile.frontWheelInertia,
    maxBrakeTorque: profile.frontBrakeTorqueMax,
    suspension: frontSuspension,
    tire: frontTire,
  });
  const rearStation: ContactStationProfile = Object.freeze({
    id: 'REAR',
    forwardOffset: -profile.rearAxle,
    freeReachDown: profile.desiredCgHeight + rearSuspension.qStatic,
    rollingRadius: profile.rearWheelRadius,
    wheelInertia: profile.rearWheelInertia,
    maxBrakeTorque: profile.rearBrakeTorqueMax,
    suspension: rearSuspension,
    tire: rearTire,
  });
  return Object.freeze({ ...profile, frontStation, rearStation });
}

/** One reduced driveline observation for the single automatic powertrain state. */
export function drivenWheelOmega(
  profile: Pick<ArcadeVehicleProfile, 'frontDriveTorqueFraction'>,
  frontWheelOmega: number,
  rearWheelOmega: number,
): number {
  return frontWheelOmega * profile.frontDriveTorqueFraction
    + rearWheelOmega * (1 - profile.frontDriveTorqueFraction);
}
