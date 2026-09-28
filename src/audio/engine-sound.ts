/** Firing facts and authored acoustic approximations; amplitudes are not pressure in Pa. */
export interface EngineSoundDefinition {
  readonly cycleRevolutions: 1 | 2;
  /**
   * Each cylinder's exhaust-opening instant (start of blowdown) as a fraction of the cycle. The offset
   * from combustion top dead centre is the same for every cylinder, so it is not represented.
   */
  readonly firingPhases: readonly number[];
  readonly exhaust: {
    readonly banks: readonly number[];
    readonly lengths: readonly number[];
    /** Pipes from a junction to another junction, or to an open end (`to: null`). */
    readonly pipes: readonly ExhaustPipe[];
  };
}

/**
 * One exhaust pipe. Junctions are numbered from 0; `banks[i]` is cylinder i's junction. Waves travel both ways,
 * so `from`/`to` only name the ends.
 */
export interface ExhaustPipe {
  readonly length: number;
  readonly from: number;
  readonly to: number | null;
}

export type CompiledEngineSound = Readonly<EngineSoundDefinition>;

/**
 * Junction numbers are contiguous from 0 and cover every bank and pipe end; 1 to 8 pipes of 0.1 to 4 m, at least
 * one open; every junction reaches an open end through pipes (either direction). Loops are allowed.
 */
function validPipes(banks: readonly number[], pipes: readonly ExhaustPipe[]): boolean {
  const junction = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
  if (pipes.length < 1 || pipes.length > 8 || !banks.every(junction)) return false;
  for (const pipe of pipes)
    if (
      !pipe ||
      !Number.isFinite(pipe.length) ||
      pipe.length < 0.1 ||
      pipe.length > 4 ||
      !junction(pipe.from) ||
      (pipe.to !== null && !junction(pipe.to))
    )
      return false;
  const used = new Set<number>(banks);
  for (const pipe of pipes) {
    used.add(pipe.from);
    if (pipe.to !== null) used.add(pipe.to);
  }
  const count = used.size;
  for (let k = 0; k < count; k++) if (!used.has(k)) return false;
  // Junctions touching an open pipe reach the open end; spread that across pipes until nothing changes.
  const reaches = new Set<number>(pipes.filter((pipe) => pipe.to === null).map((pipe) => pipe.from));
  if (reaches.size === 0) return false;
  for (let grown = true; grown;) {
    grown = false;
    for (const { from, to } of pipes)
      if (to !== null && reaches.has(from) !== reaches.has(to)) {
        reaches.add(from).add(to);
        grown = true;
      }
  }
  return reaches.size === count;
}

export function compileEngineSound(definition: EngineSoundDefinition): CompiledEngineSound {
  const { cycleRevolutions, firingPhases, exhaust } = definition;
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
  // Resource limits bound delay storage; these are not claims about real exhaust geometry.
  if (
    !exhaust ||
    !Array.isArray(exhaust.banks) ||
    !Array.isArray(exhaust.lengths) ||
    !Array.isArray(exhaust.pipes) ||
    exhaust.banks.length !== firingPhases.length ||
    exhaust.lengths.length !== firingPhases.length ||
    exhaust.lengths.some((length) => !Number.isFinite(length) || length < 0.1 || length > 3) ||
    !validPipes(exhaust.banks, exhaust.pipes)
  )
    throw new RangeError('invalid exhaust topology');
  return Object.freeze({
    cycleRevolutions,
    firingPhases: Object.freeze([...firingPhases]),
    exhaust: Object.freeze({
      banks: Object.freeze([...exhaust.banks]),
      lengths: Object.freeze([...exhaust.lengths]),
      pipes: Object.freeze(exhaust.pipes.map(({ length, from, to }) => Object.freeze({ length, from, to }))),
    }),
  });
}
