import { assertReferenceFrictionMultiplier } from './tire-wheel.js';

export interface ArcadeTireFrictionCalibrationInput {
  readonly referenceFrictionMultiplier?: number;
}

export interface ArcadeTireFrictionCalibrationState {
  referenceFrictionMultiplier: number;
}

export interface ArcadeTireFrictionCalibrationOwner {
  readonly tireFrictionCalibration: ArcadeTireFrictionCalibrationState;
}

export function createArcadeTireFrictionCalibration(
  input: ArcadeTireFrictionCalibrationInput = {},
): ArcadeTireFrictionCalibrationState {
  const referenceFrictionMultiplier = input.referenceFrictionMultiplier ?? 1;
  assertReferenceFrictionMultiplier(referenceFrictionMultiplier);
  return { referenceFrictionMultiplier };
}

export function setArcadeVehicleReferenceFrictionMultiplier(
  vehicle: ArcadeTireFrictionCalibrationOwner,
  multiplier: number,
): void {
  assertReferenceFrictionMultiplier(multiplier);
  vehicle.tireFrictionCalibration.referenceFrictionMultiplier = multiplier;
}
