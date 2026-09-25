import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
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
  for (const field of ['gripX', 'peakSlipX', 'gripY', 'peakSlipY'] as const) {
    if (!Number.isFinite(input[field]) || !(input[field] > 0))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  }
  if (!Number.isFinite(knee) || !(knee > 0 && knee < 1))
    throw new DefinitionDomainError('knee', 'knee must be finite and lie in (0,1)');
  const compiled = {
    muX: gripX,
    muY: gripY,
    kX: ((2 - knee) * gripX) / peakSlipX,
    kY: ((2 - knee) * gripY) / peakSlipY,
    rhoKnee: knee,
  };
  withDefinitionPath(() => validateTireCharacteristics(compiled), {
    muX: 'gripX',
    muY: 'gripY',
    kX: 'peakSlipX',
    kY: 'peakSlipY',
    rhoKnee: 'knee',
  });
  return Object.freeze(compiled);
}

export function validateTireCharacteristics(tire: CompiledTireCharacteristics): void {
  for (const field of ['muX', 'muY', 'kX', 'kY'] as const) {
    if (!(tire[field] > 0) || !Number.isFinite(tire[field]))
      throw new DefinitionDomainError(
        field,
        `${field} must be finite and > 0${field === 'kX' ? ' (from gripX, peakSlipX and knee)' : field === 'kY' ? ' (from gripY, peakSlipY and knee)' : ''}`,
      );
  }
  if (!Number.isFinite(tire.rhoKnee) || !(tire.rhoKnee > 0 && tire.rhoKnee < 1))
    throw new DefinitionDomainError('rhoKnee', 'rhoKnee must be finite and lie in (0,1)');
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
