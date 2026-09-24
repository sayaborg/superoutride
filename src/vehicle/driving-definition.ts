import type { TireCharacteristics } from './physics/tire-friction-calibration.js';

/** Saved-form game-wide design data; no converted angles, rates or force-law coefficients. */
export interface DrivingDefinition {
  readonly automaticSteering: 'travel-direction';
  readonly maxRoadWheelSteerDegrees: number;
  readonly steeringOffsetDegrees: number;
  readonly steeringTraversalSeconds: number;
  readonly throttle: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly brake: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly wheelSlip: boolean;
  readonly tire: Readonly<TireCharacteristics>;
}

export const DRIVING_DEFINITION: Readonly<DrivingDefinition> = Object.freeze({
  automaticSteering: 'travel-direction',
  maxRoadWheelSteerDegrees: 65,
  steeringOffsetDegrees: 20,
  steeringTraversalSeconds: 0.3,
  throttle: Object.freeze({ applySeconds: 0.25, releaseSeconds: 0.125 }),
  brake: Object.freeze({ applySeconds: 0.15, releaseSeconds: 0.1 }),
  wheelSlip: true,
  tire: Object.freeze({ gripX: 5.0, peakSlipX: 0.2, gripY: 2.5, peakSlipY: 0.1, knee: 0.74 }),
});

export interface DrivingDocument extends DrivingDefinition {
  readonly format: 'superoutride.driving-definition';
  readonly version: 1;
  readonly id: 'default';
}
