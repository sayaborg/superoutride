import { DefinitionDomainError } from './definition-domain-error.js';
/** Authoring/UI values. P is pure-axis capacity onset at gripFactor=1, not body sideslip. */
export interface TireCharacteristics {
  readonly gripX: number;
  readonly peakSlipX: number;
  readonly gripY: number;
  readonly peakSlipY: number;
  readonly knee: number;
}

/** Sole five-coefficient force-law input. G/P/UI IDs are not additional runtime state. */
export interface CompiledTireCharacteristics {
  readonly muX: number;
  readonly muY: number;
  readonly kX: number;
  readonly kY: number;
  readonly rhoKnee: number;
}

export function compileTireCharacteristics(input: TireCharacteristics): Readonly<CompiledTireCharacteristics> {
  const { gripX, peakSlipX, gripY, peakSlipY, knee } = input;
  if (
    ![gripX, peakSlipX, gripY, peakSlipY].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(knee) ||
    !(knee > 0 && knee < 1)
  ) {
    throw new DefinitionDomainError('/tire', 'tire G/P must be finite and > 0; knee must lie in (0,1)');
  }
  const compiled = {
    muX: gripX,
    muY: gripY,
    kX: ((2 - knee) * gripX) / peakSlipX,
    kY: ((2 - knee) * gripY) / peakSlipY,
    rhoKnee: knee,
  };
  validateTireCharacteristics(compiled);
  return Object.freeze(compiled);
}

export function validateTireCharacteristics(tire: CompiledTireCharacteristics): void {
  if (
    !(tire.muX > 0) ||
    !Number.isFinite(tire.muX) ||
    !(tire.muY > 0) ||
    !Number.isFinite(tire.muY) ||
    !(tire.kX > 0) ||
    !Number.isFinite(tire.kX) ||
    !(tire.kY > 0) ||
    !Number.isFinite(tire.kY) ||
    !Number.isFinite(tire.rhoKnee) ||
    !(tire.rhoKnee > 0 && tire.rhoKnee < 1)
  ) {
    throw new DefinitionDomainError(
      '/tire',
      'compiled tire capacities/stiffness must be finite and > 0; knee in (0,1)',
    );
  }
}

/** Read-only inverse for selectors/serialization. It is not a second parameter authority. */
export function readTireCharacteristics(tire: CompiledTireCharacteristics): TireCharacteristics {
  validateTireCharacteristics(tire);
  return {
    gripX: tire.muX,
    peakSlipX: ((2 - tire.rhoKnee) * tire.muX) / tire.kX,
    gripY: tire.muY,
    peakSlipY: ((2 - tire.rhoKnee) * tire.muY) / tire.kY,
    knee: tire.rhoKnee,
  };
}

/** Per-station slots keep equality a composition decision, never a constraint in the tire law. */
export interface VehicleTireFrictionCalibrationState {
  readonly front: Readonly<CompiledTireCharacteristics>;
  readonly rear: Readonly<CompiledTireCharacteristics>;
}
interface VehicleTireFrictionCalibrationOwner {
  tireFrictionCalibration: Readonly<VehicleTireFrictionCalibrationState>;
}

export function createVehicleTireFrictionCalibration(
  front: CompiledTireCharacteristics,
  rear: CompiledTireCharacteristics = front,
): Readonly<VehicleTireFrictionCalibrationState> {
  const copy = (t: CompiledTireCharacteristics) => {
    validateTireCharacteristics(t);
    return Object.freeze({ muX: t.muX, muY: t.muY, kX: t.kX, kY: t.kY, rhoKnee: t.rhoKnee });
  };
  const resolvedFront = copy(front);
  return Object.freeze({ front: resolvedFront, rear: rear === front ? resolvedFront : copy(rear) });
}

/** Current five-axis browser adjustment intentionally links both stations. Atomic replacement. */
export function setVehicleTireFrictionCalibration(
  vehicle: VehicleTireFrictionCalibrationOwner,
  input: TireCharacteristics,
): void {
  const compiled = compileTireCharacteristics(input);
  vehicle.tireFrictionCalibration = createVehicleTireFrictionCalibration(compiled);
}
