import {
  validateAutomaticPowertrainProfile,
  type AutomaticPowertrainProfile,
} from './automatic-powertrain.js';
import type { DrivingActuatorProfile } from './driving-actuator.js';
import {
  validateDrivingActuatorProfile,
  validateSymmetricSteeringActuatorRateProfile,
} from './driving-actuator.js';
import {
  VEHICLE_GRAVITY,
  compileSuspensionStation,
  type ContactStationProfile,
} from './vehicle-dynamics.js';
import {
  validateCompiledTireProfile,
  type CompiledTireProfile,
} from './tire-wheel.js';

export type VehicleProfileId =
  | 'TESTAROSSA'
  | '911_TURBO_3_3'
  | 'CORVETTE_C4'
  | 'GOLF_GTI_16V'
  | 'DELTA_HF_INTEGRALE'
  | 'VFR750R'
  | 'R80_GS_PARIS_DAKAR'
  | 'FXRT_SPORT_GLIDE'
  | 'PX200E_ARCOBALENO';

export type VehiclePresentationFamily = 'CAR' | 'BIKE';

export interface ArcadeVehicleProfile {
  /** Composition/presentation identity. Common mechanics never branches on this value. */
  readonly id: VehicleProfileId;
  /** Generic programmer-art family. It is presentation metadata and is never mechanics input. */
  readonly presentationFamily: VehiclePresentationFamily;
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
  /** Driver-only travel-direction regularization; independent from tire-slip regularization. */
  readonly steeringLowSpeedRegularization: number;
  /** High-frequency yaw-rate feedback gain in seconds. */
  readonly steeringYawTransientGain: number;
  /** Low-pass baseline time constant for the zero-DC yaw washout. */
  readonly steeringYawWashoutTime: number;
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
  /** Maximum automatic travel-direction steering, reserving the full driver offset at the rack. */
  readonly steeringAutomaticMax: number;
}

const DEG = Math.PI / 180;

/**
 * M9.8 common normalized reference tire law. Absolute corner stiffness remains load-derived and
 * wheel radius/inertia remain vehicle-specific. Preset 1 therefore preserves the M9.5 CAR basis.
 */
export const COMMON_SELECTABLE_VEHICLE_TIRE = Object.freeze({
  muRef: 1.35,
  rhoKnee: 0.74,
  lowSpeedRegularization: 1.0,
  frontNormalizedStiffness: 9,
  rearNormalizedStiffness: 10.5,
});

const COMMON_ACTUATOR: Readonly<DrivingActuatorProfile> = Object.freeze({
  steering: Object.freeze({
    applyRate: 1 / 0.375,
    releaseRate: 1 / 0.375,
  }),
  throttle: Object.freeze({ applyRate: 1 / 0.25, releaseRate: 1 / 0.125 }),
  brake: Object.freeze({ applyRate: 1 / 0.15, releaseRate: 1 / 0.10 }),
});

const COMMON_STEERING = Object.freeze({
  maxRoadWheelSteer: 31 * DEG,
  steeringResponseTau: 0.01,
  steeringLowSpeedRegularization: 1.0,
  steeringYawTransientGain: 0.18,
  steeringYawWashoutTime: 0.35,
  steeringRatio: 18,
});

const CAR_STEERING = Object.freeze({
  ...COMMON_STEERING,
  steeringOffsetMax: 9.5 * DEG,
});

const BIKE_STEERING = Object.freeze({
  ...COMMON_STEERING,
  steeringOffsetMax: 9 * DEG,
});

/** 1989 European/ROW five-bolt Ferrari Testarossa reference. */
export const FERRARI_TESTAROSSA_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'TESTAROSSA',
  presentationFamily: 'CAR',
  mass: 1625,
  yawInertia: 3100,
  pitchInertia: 3000,
  frontAxle: 1.530,
  rearAxle: 1.020,
  desiredCgHeight: 0.48,
  frontRideFrequency: 1.75,
  rearRideFrequency: 1.85,
  frontDampingRatio: 0.38,
  rearDampingRatio: 0.40,
  frontQBump: 0.19,
  rearQBump: 0.19,
  frontQTravel: 0.29,
  rearQTravel: 0.29,
  frontBumpForceMax: 100_000,
  rearBumpForceMax: 110_000,
  frontWheelRadius: 0.316,
  rearWheelRadius: 0.331,
  frontWheelInertia: 2.7,
  rearWheelInertia: 3.4,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...CAR_STEERING,
  frontBrakeTorqueMax: 4_800,
  rearBrakeTorqueMax: 3_000,
  quadraticDrag: 0.44,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 1_000,
    redlineRpm: 6_800,
    upshiftRpm: 6_450,
    downshiftRpm: 2_700,
    shiftDuration: 0.12,
    engineResponseTau: 0.09,
    launchCouplingSlipRpm: 850,
    finalDriveRatio: (30 / 27) * (45 / 14),
    efficiency: 0.90,
    gearRatios: [38 / 13, 30 / 16, 27 / 19, 25 / 23, 22 / 27],
    torqueCurve: [
      { rpm: 1_000, torqueNewtonMeters: 270 },
      { rpm: 2_500, torqueNewtonMeters: 405 },
      { rpm: 4_500, torqueNewtonMeters: 470 },
      { rpm: 5_800, torqueNewtonMeters: 455 },
      { rpm: 6_450, torqueNewtonMeters: 420 },
      { rpm: 6_800, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1989 European Porsche 911 Turbo 3.3 with the one-year G50/50 five-speed. */
export const PORSCHE_911_TURBO_3_3_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: '911_TURBO_3_3',
  presentationFamily: 'CAR',
  mass: 1410,
  yawInertia: 2400,
  pitchInertia: 2250,
  frontAxle: 1.409,
  rearAxle: 0.863,
  desiredCgHeight: 0.50,
  frontRideFrequency: 1.85,
  rearRideFrequency: 1.95,
  frontDampingRatio: 0.40,
  rearDampingRatio: 0.42,
  frontQBump: 0.19,
  rearQBump: 0.19,
  frontQTravel: 0.28,
  rearQTravel: 0.28,
  frontBumpForceMax: 82_000,
  rearBumpForceMax: 102_000,
  frontWheelRadius: 0.316,
  rearWheelRadius: 0.314,
  frontWheelInertia: 2.3,
  rearWheelInertia: 3.0,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...CAR_STEERING,
  frontBrakeTorqueMax: 3_450,
  rearBrakeTorqueMax: 2_100,
  quadraticDrag: 0.43,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 900,
    redlineRpm: 6_800,
    upshiftRpm: 6_400,
    downshiftRpm: 2_900,
    shiftDuration: 0.13,
    engineResponseTau: 0.18,
    launchCouplingSlipRpm: 950,
    finalDriveRatio: 37 / 9,
    efficiency: 0.89,
    gearRatios: [3.154, 1.789, 1.269, 0.967, 0.756],
    torqueCurve: [
      { rpm: 900, torqueNewtonMeters: 125 },
      { rpm: 2_000, torqueNewtonMeters: 210 },
      { rpm: 3_000, torqueNewtonMeters: 355 },
      { rpm: 4_000, torqueNewtonMeters: 412 },
      { rpm: 5_500, torqueNewtonMeters: 384 },
      { rpm: 6_400, torqueNewtonMeters: 315 },
      { rpm: 6_800, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1989 US Chevrolet Corvette L98 with ZF six-speed and base pre-facelift chassis. */
export const CHEVROLET_CORVETTE_C4_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'CORVETTE_C4',
  presentationFamily: 'CAR',
  mass: 1565,
  yawInertia: 3000,
  pitchInertia: 2700,
  frontAxle: 1.197,
  rearAxle: 1.246,
  desiredCgHeight: 0.47,
  frontRideFrequency: 1.70,
  rearRideFrequency: 1.75,
  frontDampingRatio: 0.38,
  rearDampingRatio: 0.38,
  frontQBump: 0.20,
  rearQBump: 0.20,
  frontQTravel: 0.30,
  rearQTravel: 0.30,
  frontBumpForceMax: 105_000,
  rearBumpForceMax: 92_000,
  frontWheelRadius: 0.331,
  rearWheelRadius: 0.331,
  frontWheelInertia: 3.0,
  rearWheelInertia: 3.1,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...CAR_STEERING,
  frontBrakeTorqueMax: 3_850,
  rearBrakeTorqueMax: 2_150,
  quadraticDrag: 0.38,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 700,
    redlineRpm: 5_200,
    upshiftRpm: 4_900,
    downshiftRpm: 1_800,
    shiftDuration: 0.12,
    engineResponseTau: 0.10,
    launchCouplingSlipRpm: 700,
    finalDriveRatio: 3.45,
    efficiency: 0.89,
    gearRatios: [2.68, 1.80, 1.29, 1.00, 0.75, 0.50],
    torqueCurve: [
      { rpm: 700, torqueNewtonMeters: 300 },
      { rpm: 1_600, torqueNewtonMeters: 395 },
      { rpm: 3_200, torqueNewtonMeters: 461 },
      { rpm: 4_300, torqueNewtonMeters: 405 },
      { rpm: 4_900, torqueNewtonMeters: 330 },
      { rpm: 5_200, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1988 European non-catalyst three-door Volkswagen Golf GTI 16V with small bumpers. */
export const VOLKSWAGEN_GOLF_GTI_16V_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'GOLF_GTI_16V',
  presentationFamily: 'CAR',
  mass: 1080,
  yawInertia: 1680,
  pitchInertia: 1500,
  frontAxle: 0.941,
  rearAxle: 1.534,
  desiredCgHeight: 0.53,
  frontRideFrequency: 1.60,
  rearRideFrequency: 1.70,
  frontDampingRatio: 0.37,
  rearDampingRatio: 0.39,
  frontQBump: 0.21,
  rearQBump: 0.21,
  frontQTravel: 0.32,
  rearQTravel: 0.32,
  frontBumpForceMax: 75_000,
  rearBumpForceMax: 55_000,
  frontWheelRadius: 0.289,
  rearWheelRadius: 0.289,
  frontWheelInertia: 1.7,
  rearWheelInertia: 1.7,
  frontDriveTorqueFraction: 1,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...CAR_STEERING,
  frontBrakeTorqueMax: 2_350,
  rearBrakeTorqueMax: 1_050,
  quadraticDrag: 0.38,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 900,
    redlineRpm: 6_800,
    upshiftRpm: 6_400,
    downshiftRpm: 2_400,
    shiftDuration: 0.11,
    engineResponseTau: 0.08,
    launchCouplingSlipRpm: 850,
    finalDriveRatio: 3.667,
    efficiency: 0.90,
    gearRatios: [3.455, 2.118, 1.444, 1.129, 0.912],
    torqueCurve: [
      { rpm: 900, torqueNewtonMeters: 88 },
      { rpm: 2_500, torqueNewtonMeters: 135 },
      { rpm: 4_600, torqueNewtonMeters: 168 },
      { rpm: 6_100, torqueNewtonMeters: 160 },
      { rpm: 6_400, torqueNewtonMeters: 145 },
      { rpm: 6_800, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1988 European road-going Lancia Delta HF Integrale 8V, 185 PS. */
export const LANCIA_DELTA_HF_INTEGRALE_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'DELTA_HF_INTEGRALE',
  presentationFamily: 'CAR',
  mass: 1290,
  yawInertia: 1980,
  pitchInertia: 1800,
  frontAxle: 1.064,
  rearAxle: 1.411,
  desiredCgHeight: 0.55,
  frontRideFrequency: 1.70,
  rearRideFrequency: 1.80,
  frontDampingRatio: 0.40,
  rearDampingRatio: 0.42,
  frontQBump: 0.21,
  rearQBump: 0.21,
  frontQTravel: 0.32,
  rearQTravel: 0.32,
  frontBumpForceMax: 85_000,
  rearBumpForceMax: 70_000,
  frontWheelRadius: 0.298,
  rearWheelRadius: 0.298,
  frontWheelInertia: 2.1,
  rearWheelInertia: 2.1,
  frontDriveTorqueFraction: 0.47,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...CAR_STEERING,
  frontBrakeTorqueMax: 2_950,
  rearBrakeTorqueMax: 1_600,
  quadraticDrag: 0.39,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 900,
    redlineRpm: 6_500,
    upshiftRpm: 6_100,
    downshiftRpm: 2_600,
    shiftDuration: 0.12,
    engineResponseTau: 0.15,
    launchCouplingSlipRpm: 950,
    finalDriveRatio: 56 / 18,
    efficiency: 0.88,
    gearRatios: [3.5, 2.176, 1.524, 1.156, 0.917],
    torqueCurve: [
      { rpm: 900, torqueNewtonMeters: 135 },
      { rpm: 2_000, torqueNewtonMeters: 220 },
      { rpm: 3_500, torqueNewtonMeters: 304 },
      { rpm: 5_300, torqueNewtonMeters: 247 },
      { rpm: 6_100, torqueNewtonMeters: 200 },
      { rpm: 6_500, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1988 export/ROW full-power Honda VFR750R using the factory RC30 six-speed ratios. */
export const HONDA_VFR750R_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'VFR750R',
  presentationFamily: 'BIKE',
  mass: 276,
  yawInertia: 180,
  pitchInertia: 205,
  frontAxle: 0.719,
  rearAxle: 0.691,
  desiredCgHeight: 0.72,
  frontRideFrequency: 2.00,
  rearRideFrequency: 2.10,
  frontDampingRatio: 0.42,
  rearDampingRatio: 0.44,
  frontQBump: 0.20,
  rearQBump: 0.20,
  frontQTravel: 0.45,
  rearQTravel: 0.45,
  frontBumpForceMax: 18_000,
  rearBumpForceMax: 17_000,
  frontWheelRadius: 0.300,
  rearWheelRadius: 0.331,
  frontWheelInertia: 0.47,
  rearWheelInertia: 0.72,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...BIKE_STEERING,
  frontBrakeTorqueMax: 700,
  rearBrakeTorqueMax: 300,
  quadraticDrag: 0.24,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 1_200,
    redlineRpm: 12_000,
    upshiftRpm: 11_300,
    downshiftRpm: 4_500,
    shiftDuration: 0.10,
    engineResponseTau: 0.06,
    launchCouplingSlipRpm: 1_200,
    finalDriveRatio: 1.939 * 2.5,
    efficiency: 0.92,
    gearRatios: [2.400, 1.941, 1.631, 1.434, 1.291, 1.192],
    torqueCurve: [
      { rpm: 1_200, torqueNewtonMeters: 34 },
      { rpm: 4_000, torqueNewtonMeters: 55 },
      { rpm: 7_000, torqueNewtonMeters: 71 },
      { rpm: 9_500, torqueNewtonMeters: 70 },
      { rpm: 11_300, torqueNewtonMeters: 65 },
      { rpm: 12_000, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1985 European road BMW R 80 G/S Paris-Dakar with the 32-litre tank. */
export const BMW_R80_GS_PARIS_DAKAR_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'R80_GS_PARIS_DAKAR',
  presentationFamily: 'BIKE',
  mass: 280,
  yawInertia: 215,
  pitchInertia: 260,
  frontAxle: 0.776,
  rearAxle: 0.689,
  desiredCgHeight: 0.82,
  frontRideFrequency: 1.65,
  rearRideFrequency: 1.75,
  frontDampingRatio: 0.38,
  rearDampingRatio: 0.40,
  frontQBump: 0.24,
  rearQBump: 0.22,
  frontQTravel: 0.38,
  rearQTravel: 0.35,
  frontBumpForceMax: 18_000,
  rearBumpForceMax: 18_000,
  frontWheelRadius: 0.343,
  rearWheelRadius: 0.330,
  frontWheelInertia: 0.62,
  rearWheelInertia: 0.82,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...BIKE_STEERING,
  frontBrakeTorqueMax: 720,
  rearBrakeTorqueMax: 430,
  quadraticDrag: 0.36,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 950,
    redlineRpm: 7_000,
    upshiftRpm: 6_500,
    downshiftRpm: 2_300,
    shiftDuration: 0.13,
    engineResponseTau: 0.10,
    launchCouplingSlipRpm: 900,
    finalDriveRatio: 1.5 * 3.36,
    efficiency: 0.88,
    gearRatios: [2.60, 1.67, 1.26, 1.00, 0.84],
    torqueCurve: [
      { rpm: 950, torqueNewtonMeters: 35 },
      { rpm: 2_500, torqueNewtonMeters: 52 },
      { rpm: 4_000, torqueNewtonMeters: 58 },
      { rpm: 5_500, torqueNewtonMeters: 56 },
      { rpm: 6_500, torqueNewtonMeters: 54 },
      { rpm: 7_000, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1988 US Harley-Davidson FXRT Sport Glide with Evolution 1340 power. */
export const HARLEY_DAVIDSON_FXRT_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'FXRT_SPORT_GLIDE',
  presentationFamily: 'BIKE',
  mass: 380,
  yawInertia: 285,
  pitchInertia: 340,
  frontAxle: 0.802,
  rearAxle: 0.684,
  desiredCgHeight: 0.68,
  frontRideFrequency: 1.55,
  rearRideFrequency: 1.60,
  frontDampingRatio: 0.38,
  rearDampingRatio: 0.40,
  frontQBump: 0.22,
  rearQBump: 0.22,
  frontQTravel: 0.34,
  rearQTravel: 0.34,
  frontBumpForceMax: 24_000,
  rearBumpForceMax: 23_000,
  frontWheelRadius: 0.286,
  rearWheelRadius: 0.320,
  frontWheelInertia: 0.75,
  rearWheelInertia: 1.10,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...BIKE_STEERING,
  frontBrakeTorqueMax: 1_000,
  rearBrakeTorqueMax: 650,
  quadraticDrag: 0.46,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 850,
    redlineRpm: 5_200,
    upshiftRpm: 4_800,
    downshiftRpm: 1_700,
    shiftDuration: 0.14,
    engineResponseTau: 0.12,
    launchCouplingSlipRpm: 750,
    finalDriveRatio: 1.54 * 2.19,
    efficiency: 0.87,
    gearRatios: [3.21, 2.21, 1.60, 1.23, 1.00],
    torqueCurve: [
      { rpm: 850, torqueNewtonMeters: 62 },
      { rpm: 2_000, torqueNewtonMeters: 84 },
      { rpm: 3_500, torqueNewtonMeters: 94 },
      { rpm: 4_500, torqueNewtonMeters: 86 },
      { rpm: 4_800, torqueNewtonMeters: 78 },
      { rpm: 5_200, torqueNewtonMeters: 0 },
    ],
  },
});

/** 1985 Italian/European full-power Vespa PX 200 E Arcobaleno, frame type VSX1T. */
export const VESPA_PX200E_ARCOBALENO_VEHICLE_PROFILE = compileArcadeVehicleProfile({
  id: 'PX200E_ARCOBALENO',
  presentationFamily: 'BIKE',
  mass: 190,
  yawInertia: 98,
  pitchInertia: 108,
  frontAxle: 0.704,
  rearAxle: 0.531,
  desiredCgHeight: 0.67,
  frontRideFrequency: 1.50,
  rearRideFrequency: 1.55,
  frontDampingRatio: 0.36,
  rearDampingRatio: 0.38,
  frontQBump: 0.22,
  rearQBump: 0.22,
  frontQTravel: 0.34,
  rearQTravel: 0.34,
  frontBumpForceMax: 9_000,
  rearBumpForceMax: 10_000,
  frontWheelRadius: 0.216,
  rearWheelRadius: 0.216,
  frontWheelInertia: 0.14,
  rearWheelInertia: 0.20,
  frontDriveTorqueFraction: 0,
  ...COMMON_SELECTABLE_VEHICLE_TIRE,
  ...BIKE_STEERING,
  frontBrakeTorqueMax: 260,
  rearBrakeTorqueMax: 180,
  quadraticDrag: 0.31,
  actuator: COMMON_ACTUATOR,
  powertrain: {
    idleRpm: 900,
    redlineRpm: 6_500,
    upshiftRpm: 6_000,
    downshiftRpm: 2_500,
    shiftDuration: 0.18,
    engineResponseTau: 0.11,
    launchCouplingSlipRpm: 1_100,
    finalDriveRatio: 1,
    efficiency: 0.84,
    gearRatios: [14.47, 10.28, 7.31, 5.36],
    torqueCurve: [
      { rpm: 900, torqueNewtonMeters: 7 },
      { rpm: 2_000, torqueNewtonMeters: 12 },
      { rpm: 4_000, torqueNewtonMeters: 16 },
      { rpm: 5_700, torqueNewtonMeters: 15 },
      { rpm: 6_000, torqueNewtonMeters: 13 },
      { rpm: 6_500, torqueNewtonMeters: 0 },
    ],
  },
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
    profile.steeringLowSpeedRegularization,
    profile.steeringYawWashoutTime,
  ];
  if (positive.some((value) => !(value > 0) || !Number.isFinite(value))) {
    throw new RangeError('vehicle mass/inertia/geometry/wheel/tire/steering values must be finite and > 0');
  }
  if (profile.presentationFamily !== 'CAR' && profile.presentationFamily !== 'BIKE') {
    throw new RangeError('vehicle presentation family must be CAR or BIKE');
  }
  if (!(profile.rhoKnee > 0 && profile.rhoKnee < 1)) {
    throw new RangeError('vehicle tire rhoKnee must lie in (0,1)');
  }
  if (!(profile.maxRoadWheelSteer < Math.PI / 2 && profile.steeringOffsetMax < Math.PI / 2)) {
    throw new RangeError('vehicle steering angles must lie below pi/2');
  }
  if (!(profile.steeringOffsetMax < profile.maxRoadWheelSteer)) {
    throw new RangeError('vehicle steering offset must remain below the mechanical road-wheel limit');
  }
  if (!(profile.steeringYawTransientGain >= 0)
    || !Number.isFinite(profile.steeringYawTransientGain)) {
    throw new RangeError('vehicle yaw transient gain must be finite and >= 0');
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
  validateSymmetricSteeringActuatorRateProfile(profile.actuator.steering);
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
  return Object.freeze({
    ...profile,
    frontStation,
    rearStation,
    steeringAutomaticMax: profile.maxRoadWheelSteer - profile.steeringOffsetMax,
  });
}

/** One reduced driveline observation for the single automatic-shifted powertrain state. */
export function drivenWheelOmega(
  profile: Pick<ArcadeVehicleProfile, 'frontDriveTorqueFraction'>,
  frontWheelOmega: number,
  rearWheelOmega: number,
): number {
  return frontWheelOmega * profile.frontDriveTorqueFraction
    + rearWheelOmega * (1 - profile.frontDriveTorqueFraction);
}
