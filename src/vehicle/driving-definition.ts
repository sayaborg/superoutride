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
  readonly throttle: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly brake: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly wheelSlip: boolean;
  readonly tire: Readonly<TireCharacteristics>;
}

export interface DrivingDocument extends DrivingDefinition {
  readonly format: 'superoutride.driving-definition';
  readonly version: 3;
  readonly id: 'default';
}
