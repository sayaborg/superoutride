import type { TireCharacteristics } from './physics/tire-friction-calibration.js';
import type { SteeringReference } from './steering-rule.js';

/** Saved-form game-wide design data; no converted angles, rates or force-law coefficients. */
export interface DrivingDefinition {
  readonly maxRoadWheelSteerDegrees: number;
  readonly steeringTraversalSeconds: number;
  /** The default steering rule's reference position. */
  readonly steeringReference: SteeringReference;
  /** The default steering rule's fraction of the front tire's lateral force bound that full steering input reaches. */
  readonly steeringUtilization: number;
  /** Fuel cut enters above this multiple of redline. */
  readonly fuelCutEnterRedlineRatio: number;
  /** Fuel cut clears at or below this multiple of redline. */
  readonly fuelCutClearRedlineRatio: number;
  readonly idleFrictionMeanEffectivePressureBar: number;
  readonly redlineFrictionMeanEffectivePressureBar: number;
  readonly drivelineEfficiency: number;
  readonly engineInertiaKilogramSquareMetersPerLitre: number;
  readonly clutchLockIdleMargin: number;
  readonly clutchCapacityFactor: number;
  /** Game-wide pitch protection limit, both directions, relative to the road line under the wheels. */
  readonly pitchLimitDegrees: number;
  readonly throttle: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly brake: Readonly<{ applySeconds: number; releaseSeconds: number }>;
  readonly wheelSlip: boolean;
  readonly tire: Readonly<TireCharacteristics>;
  /**
   * RACE rival pace: the driving utilization a rival following its pace schedule varies within, and the time
   * constant in seconds of its response.
   */
  readonly rivalPace: Readonly<{
    minimumUtilization: number;
    maximumUtilization: number;
    minimumSpeedFraction: number;
    bandSeconds: number;
    responseSeconds: number;
  }>;
  /**
   * The game-wide body contact spring-damper between vehicles, and against walls and course limits: natural frequency
   * in hertz and damping ratio; `barrierFriction` scales a wall's push into the friction that slows a vehicle scraping
   * along it.
   */
  readonly bodyContact: Readonly<{ frequencyHertz: number; dampingRatio: number; barrierFriction: number }>;
}

export const DRIVING_DOCUMENT_FORMAT = 'superoutride.driving-definition';
export const DRIVING_DOCUMENT_VERSION = 20;

export interface DrivingDocument extends DrivingDefinition {
  readonly format: typeof DRIVING_DOCUMENT_FORMAT;
  readonly version: typeof DRIVING_DOCUMENT_VERSION;
}
