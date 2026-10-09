import { DefinitionDomainError, withDefinitionPath } from '../../core/admission.js';
/** Authoring/UI values. P is pure-axis capacity onset at gripFactor=1, not body sideslip. */
export interface TireCharacteristics {
  readonly gripX: number;
  readonly peakSlipX: number;
  readonly gripY: number;
  readonly peakSlipY: number;
  readonly knee: number;
  /** r in [0,1): how much less than in proportion the tire force grows with load (0 is in proportion). */
  readonly loadSensitivity: number;
}

/** Sole five-coefficient force-law input. G/P/UI IDs are not additional runtime state. */
export interface CompiledTireCharacteristics {
  readonly muX: number;
  readonly muY: number;
  readonly kX: number;
  readonly kY: number;
  readonly rhoKnee: number;
  readonly loadSensitivity: number;
}

export function compileTireCharacteristics(input: TireCharacteristics): Readonly<CompiledTireCharacteristics> {
  const { gripX, peakSlipX, gripY, peakSlipY, knee, loadSensitivity } = input;
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
    loadSensitivity,
  };
  withDefinitionPath(() => validateTireCharacteristics(compiled), {
    muX: 'gripX',
    muY: 'gripY',
    kX: 'peakSlipX',
    kY: 'peakSlipY',
    rhoKnee: 'knee',
    loadSensitivity: 'loadSensitivity',
  });
  return Object.freeze(compiled);
}

/**
 * The pure-lateral slip at which the lateral force reaches its plateau on a surface of `gripFactor`:
 * `gripFactor*(2-KN)*muY/kY`, which is `gripFactor*PY`.
 */
export function lateralPlateauSlip(tire: CompiledTireCharacteristics, gripFactor: number): number {
  return (gripFactor * (2 - tire.rhoKnee) * tire.muY) / tire.kY;
}

function validateTireCharacteristics(tire: CompiledTireCharacteristics): void {
  for (const field of ['muX', 'muY', 'kX', 'kY'] as const) {
    if (!(tire[field] > 0) || !Number.isFinite(tire[field]))
      throw new DefinitionDomainError(
        field,
        `${field} must be finite and > 0${field === 'kX' ? ' (from gripX, peakSlipX and knee)' : field === 'kY' ? ' (from gripY, peakSlipY and knee)' : ''}`,
      );
  }
  if (!Number.isFinite(tire.rhoKnee) || !(tire.rhoKnee > 0 && tire.rhoKnee < 1))
    throw new DefinitionDomainError('rhoKnee', 'rhoKnee must be finite and lie in (0,1)');
  if (!(tire.loadSensitivity >= 0 && tire.loadSensitivity < 1))
    throw new DefinitionDomainError('loadSensitivity', 'loadSensitivity must lie in [0,1)');
}

/**
 * The load the tire law reads for a contact's normal load `load` on a station whose static load is `staticLoad`:
 * `N/(1+r*(N/N0-1))`. It equals the static load there, rises with the load's slope `1-r` around it, and approaches
 * `N0/r` as the load grows (any load when r is 0).
 */
export function effectiveTireLoad(tire: CompiledTireCharacteristics, load: number, staticLoad: number): number {
  return load / (1 + tire.loadSensitivity * (load / staticLoad - 1));
}
