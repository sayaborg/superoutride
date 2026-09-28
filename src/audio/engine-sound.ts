/** Firing facts and authored acoustic approximations; amplitudes are not pressure in Pa. */
export interface EngineSoundDefinition {
  readonly cycleRevolutions: 1 | 2;
  /**
   * Each cylinder's exhaust-opening instant (start of blowdown) as a fraction of the cycle. The offset
   * from combustion top dead centre is the same for every cylinder, so it is not represented.
   */
  readonly firingPhases: readonly number[];
  /** Crank degrees the exhaust valve (a two-stroke's exhaust port) is open, from lift-off to reseating. */
  readonly exhaustDurationDegrees: number;
  readonly exhaust: {
    readonly banks: readonly number[];
    readonly lengths: readonly number[];
    readonly outlet: number;
  };
}

export type CompiledEngineSound = Readonly<EngineSoundDefinition>;

export function compileEngineSound(definition: EngineSoundDefinition): CompiledEngineSound {
  const { cycleRevolutions, firingPhases, exhaustDurationDegrees, exhaust } = definition;
  if (
    (cycleRevolutions !== 1 && cycleRevolutions !== 2) ||
    !Array.isArray(firingPhases) ||
    firingPhases.length === 0 ||
    firingPhases.length > 16 ||
    firingPhases.some(
      (phase, i) => !Number.isFinite(phase) || phase < 0 || phase >= 1 || (i > 0 && phase <= firingPhases[i - 1]!),
    )
  )
    throw new RangeError('invalid engine sound firing phases');
  if (
    !Number.isFinite(exhaustDurationDegrees) ||
    exhaustDurationDegrees <= 0 ||
    exhaustDurationDegrees >= 360 * cycleRevolutions
  )
    throw new RangeError('invalid engine sound exhaust duration');
  // Resource limits bound delay storage; these are not claims about real exhaust geometry.
  if (
    !exhaust ||
    !Array.isArray(exhaust.banks) ||
    !Array.isArray(exhaust.lengths) ||
    exhaust.banks.length !== firingPhases.length ||
    exhaust.lengths.length !== firingPhases.length ||
    exhaust.banks.some((bank) => !Number.isInteger(bank) || bank < 0 || bank > 1) ||
    !exhaust.banks.includes(0) ||
    exhaust.lengths.some((length) => !Number.isFinite(length) || length < 0.1 || length > 3) ||
    !Number.isFinite(exhaust.outlet) ||
    exhaust.outlet < 0.1 ||
    exhaust.outlet > 4
  )
    throw new RangeError('invalid exhaust topology');
  return Object.freeze({
    cycleRevolutions,
    firingPhases: Object.freeze([...firingPhases]),
    exhaustDurationDegrees,
    exhaust: Object.freeze({
      ...exhaust,
      banks: Object.freeze([...exhaust.banks]),
      lengths: Object.freeze([...exhaust.lengths]),
    }),
  });
}
