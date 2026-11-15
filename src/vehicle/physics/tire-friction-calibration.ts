import { DefinitionDomainError } from '../../core/admission.js';

/**
 * A brush tire's authored values (K, 2026-11-16): its grip `mu`, the bound of its force over its load, and its
 * stiffness `c`, its force over its load at unit slip; its peak slip `3*mu/c` follows from them. Its force opposes its
 * slip, alike along the wheel and across it.
 */
export interface TireCharacteristics {
  readonly grip: number;
  readonly stiffness: number;
  /** s in (0,1]: the force sliding far past the peak over the peak's force (1 holds the peak). */
  readonly slidingRatio: number;
}

/** The sole force-law input: the admitted values themselves. */
export type CompiledTireCharacteristics = Readonly<TireCharacteristics>;

export function compileTireCharacteristics(input: TireCharacteristics): CompiledTireCharacteristics {
  const { grip, stiffness, slidingRatio } = input;
  for (const field of ['grip', 'stiffness'] as const) {
    if (!Number.isFinite(input[field]) || !(input[field] > 0))
      throw new DefinitionDomainError(field, `${field} must be finite and > 0`);
  }
  if (!(slidingRatio > 0 && slidingRatio <= 1))
    throw new DefinitionDomainError('slidingRatio', 'slidingRatio must lie in (0,1]');
  return Object.freeze({ grip, stiffness, slidingRatio });
}

/** The game-wide load sensitivity `r` in [0,1); a value outside it is a domain error at `path`. */
export function validateTireLoadSensitivity(loadSensitivity: number, path: string): number {
  if (!(loadSensitivity >= 0 && loadSensitivity < 1))
    throw new DefinitionDomainError(path, `${path} must lie in [0,1)`);
  return loadSensitivity;
}

/** The slip at which the tire reaches its peak on a surface of `gripFactor`: `gripFactor*3*mu/c`. */
export function tirePeakSlip(tire: CompiledTireCharacteristics, gripFactor: number): number {
  return (gripFactor * 3 * tire.grip) / tire.stiffness;
}

/**
 * The brush's force over its peak force at `theta`, its slip over its peak slip: `1-(1-theta)^3` up to the peak, then
 * 1. Its slope is 3 at zero slip and 0 at the peak.
 */
export function brushForce(theta: number): number {
  if (Number.isNaN(theta)) throw new RangeError('tire slip cannot be NaN');
  if (!(theta > 0)) return 0;
  if (theta >= 1) return 1;
  // The expanded form keeps the small-slip force exact.
  return theta * (3 - 3 * theta + theta * theta);
}

/** The inverse of `brushForce` on [0,1]: the slip over the peak slip `1-(1-f)^(1/3)` at which the force is `f`. */
export function brushSlipAtForce(f: number): number {
  return f >= 1 ? 1 : f <= 0 ? 0 : 1 - Math.cbrt(1 - f);
}

/**
 * The force's fall past the peak at `theta`: 1 up to the peak, then `s+(1-s)/(1+u^2)` with `u = theta-1`, falling from
 * the peak with zero slope toward the sliding ratio `s` over the width of the peak slip. A sliding ratio of 1 holds it
 * at 1.
 */
export function slidingFall(theta: number, slidingRatio: number): number {
  if (!(theta > 1)) return 1;
  const u = theta - 1;
  return slidingRatio + (1 - slidingRatio) / (1 + u * u);
}

/**
 * The load the tire law reads for a contact's normal load `load` on a station whose static load is `staticLoad`, under
 * the game-wide load sensitivity `r`: `N/(1+r*(N/N0-1))`. It equals the static load there, rises with the load's slope
 * `1-r` around it, and approaches `N0/r` as the load grows (any load when r is 0).
 */
export function effectiveTireLoad(loadSensitivity: number, load: number, staticLoad: number): number {
  return load / (1 + loadSensitivity * (load / staticLoad - 1));
}
