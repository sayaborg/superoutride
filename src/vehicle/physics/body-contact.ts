import { DefinitionDomainError } from '../../core/admission.js';

/** The game-wide body contact spring-damper: angular frequency `2π × frequencyHertz` (rad/s) and damping ratio. */
export interface CompiledBodyContact {
  readonly angularFrequency: number;
  readonly dampingRatio: number;
}

/** Convert the saved body contact values; the stability bound needs the fixed step and is admitted with the model. */
export function compileBodyContact(value: { frequencyHertz: number; dampingRatio: number }): CompiledBodyContact {
  if (!(value.frequencyHertz > 0) || !Number.isFinite(value.frequencyHertz))
    throw new DefinitionDomainError('frequencyHertz', 'body contact frequencyHertz must be finite and > 0');
  if (!(value.dampingRatio > 0) || !Number.isFinite(value.dampingRatio))
    throw new DefinitionDomainError('dampingRatio', 'body contact dampingRatio must be finite and > 0');
  return Object.freeze({ angularFrequency: 2 * Math.PI * value.frequencyHertz, dampingRatio: value.dampingRatio });
}

/**
 * Admit explicit integration of the contact at the fixed step: the force is held through one step of `N` substeps,
 * each updating velocity before position. For the relative motion `x'' = −ω²x − 2ζωx'` with `p = ω × step` and
 * `c = (N + 1) / (2N)`, one step maps (x, x'·step) by a matrix with trace `2 − cp² − 2ζp` and determinant
 * `1 − 2ζp + (1 − c)p²`; both eigenvalues lie inside the unit circle exactly when the three conditions below hold.
 */
export function assertBodyContactStability(contact: CompiledBodyContact, step: number, substeps: number): void {
  const p = contact.angularFrequency * step;
  const zeta = contact.dampingRatio;
  const c = (substeps + 1) / (2 * substeps);
  if (!((1 - c) * p < 2 * zeta && 2 - 2 * zeta * p + (1 - c) * p * p > 0 && 4 - 4 * zeta * p + (1 - 2 * c) * p * p > 0))
    throw new RangeError(
      `body contact (ω ${contact.angularFrequency.toFixed(3)} rad/s, ζ ${zeta}) is unstable at the ${step} s step`,
    );
}

/**
 * The magnitude of the force pushing two overlapping bodies apart along their contact axis: the spring-damper on the
 * pair's reduced mass, `max(0, μ(ω²x + 2ζωv))` for overlap `x` and approach speed `v`. It never pulls.
 */
export function bodyContactForce(
  contact: CompiledBodyContact,
  reducedMass: number,
  overlap: number,
  approachSpeed: number,
): number {
  const omega = contact.angularFrequency;
  return Math.max(0, reducedMass * (omega * omega * overlap + 2 * contact.dampingRatio * omega * approachSpeed));
}
