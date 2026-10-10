import type { TireCharacteristics } from './physics/tire-friction-calibration.js';
import type { SteeringReference } from './physics/vehicle-calibration.js';

/** Saved-form game-wide design data; no converted angles, rates or force-law coefficients. */
export interface DrivingDefinition {
  readonly maxRoadWheelSteerDegrees: number;
  readonly steeringTraversalSeconds: number;
  readonly steeringReference: SteeringReference;
  /** The fraction of the front tire's lateral force bound that full steering input reaches. */
  readonly steeringUtilization: number;
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
  /**
   * ARCADE rival pace: the driving utilization a rival following its pace schedule varies within, and the time
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

export interface DrivingDocument extends DrivingDefinition {
  readonly format: 'superoutride.driving-definition';
  readonly version: 17;
}
