export interface ArcadeTireFrictionCalibrationInput {
  readonly referenceFrictionMultiplier?: number;
  readonly linearStiffnessMultiplier?: number;
}

export interface ArcadeTireFrictionCalibrationState {
  referenceFrictionMultiplier: number;
  linearStiffnessMultiplier: number;
}

export interface ArcadeTireFrictionCalibrationOwner {
  readonly tireFrictionCalibration: ArcadeTireFrictionCalibrationState;
}

export function createArcadeTireFrictionCalibration(
  input: ArcadeTireFrictionCalibrationInput = {},
): ArcadeTireFrictionCalibrationState {
  const referenceFrictionMultiplier = input.referenceFrictionMultiplier ?? 1;
  const linearStiffnessMultiplier = input.linearStiffnessMultiplier ?? 1;
  assertReferenceFrictionMultiplier(referenceFrictionMultiplier);
  assertLinearStiffnessMultiplier(linearStiffnessMultiplier);
  return { referenceFrictionMultiplier, linearStiffnessMultiplier };
}

export function setArcadeVehicleTireFrictionCalibration(
  vehicle: ArcadeTireFrictionCalibrationOwner,
  calibration: Readonly<ArcadeTireFrictionCalibrationInput>,
): void {
  const resolved = createArcadeTireFrictionCalibration(calibration);
  vehicle.tireFrictionCalibration.referenceFrictionMultiplier =
    resolved.referenceFrictionMultiplier;
  vehicle.tireFrictionCalibration.linearStiffnessMultiplier =
    resolved.linearStiffnessMultiplier;
}

export function assertReferenceFrictionMultiplier(multiplier: number): void {
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
    throw new RangeError('tire reference-friction multiplier must be finite and > 0');
  }
}

export function assertLinearStiffnessMultiplier(multiplier: number): void {
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
    throw new RangeError('tire linear-stiffness multiplier must be finite and > 0');
  }
}
