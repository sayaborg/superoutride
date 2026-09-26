import type { TireCharacteristics } from './physics/tire-friction-calibration.js';

/** Saved-form game-wide design data; no converted angles, rates or force-law coefficients. */
export interface DrivingDefinition {
  readonly automaticSteering: 'travel-direction';
  readonly maxRoadWheelSteerDegrees: number;
  readonly steeringOffsetDegrees: number;
  readonly steeringTraversalSeconds: number;
  readonly fuelCutRedlineMargin: number;
  readonly idleFrictionMeanEffectivePressureBar: number;
  readonly redlineFrictionMeanEffectivePressureBar: number;
  readonly drivelineEfficiency: number;
  readonly engineInertiaKilogramSquareMetersPerLitre: number;
  readonly clutchLockIdleMargin: number;
  readonly clutchCapacityFactor: number;
  /** Suspension stiffness at full travel as a multiple of the ride spring rate; 1 is linear. */
  readonly suspensionProgression: number;
  /** Game-wide pitch protection limit, both directions, relative to the road line under the wheels. */
  readonly pitchLimitDegrees: number;
  readonly throttle: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly brake: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly wheelSlip: boolean;
  readonly tire: Readonly<TireCharacteristics>;
}

export interface DrivingDocument extends DrivingDefinition {
  readonly format: 'superoutride.driving-definition';
  readonly version: 8;
  readonly id: string;
}
