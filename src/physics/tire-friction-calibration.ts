export interface ArcadeTireFrictionCalibrationInput {
  readonly referenceFrictionMultiplier?: number;
  readonly linearStiffnessMultiplier?: number;
  readonly slidingFrictionRatio?: number;
}

export interface ArcadeTireFrictionCalibrationState {
  referenceFrictionMultiplier: number;
  linearStiffnessMultiplier: number;
  slidingFrictionRatio: number;
}

export interface ArcadeTireFrictionCalibrationOwner {
  readonly tireFrictionCalibration: ArcadeTireFrictionCalibrationState;
}

export function createArcadeTireFrictionCalibration(
  input: ArcadeTireFrictionCalibrationInput = {},
): ArcadeTireFrictionCalibrationState {
  const referenceFrictionMultiplier = input.referenceFrictionMultiplier ?? 1;
  const linearStiffnessMultiplier = input.linearStiffnessMultiplier ?? 1;
  const slidingFrictionRatio = input.slidingFrictionRatio ?? 1;
  assertReferenceFrictionMultiplier(referenceFrictionMultiplier);
  assertLinearStiffnessMultiplier(linearStiffnessMultiplier);
  assertSlidingFrictionRatio(slidingFrictionRatio);
  return { referenceFrictionMultiplier, linearStiffnessMultiplier, slidingFrictionRatio };
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
  vehicle.tireFrictionCalibration.slidingFrictionRatio =
    resolved.slidingFrictionRatio;
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

export function assertSlidingFrictionRatio(ratio: number): void {
  if (!(ratio > 0 && ratio <= 1) || !Number.isFinite(ratio)) {
    throw new RangeError('tire sliding-friction ratio must be finite and lie in (0, 1]');
  }
}
