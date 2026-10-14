import { DefinitionDomainError } from '../core/admission.js';

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

/** Validated acoustic values, as `compileEngineSound` returns them. */
export type EngineSound = Readonly<EngineSoundDefinition>;

/** A delivered engine sound: its values, its ID (the document's file name) and its delivered bytes' SHA-256. */
export interface CompiledEngineSound extends EngineSound {
  readonly id: string;
  readonly sha256: string;
}

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

/**
 * The one value check of an engine sound. Each rule refuses at the field it reads (`firingPhases/2`,
 * `exhaust/lengths/0`); the exhaust's topology, a rule over its banks and pipes together, refuses at `exhaust`.
 */
export function compileEngineSound(definition: EngineSoundDefinition): EngineSound {
  const { cycleRevolutions, firingPhases, exhaust } = definition;
  if (cycleRevolutions !== 1 && cycleRevolutions !== 2)
    throw new DefinitionDomainError('cycleRevolutions', 'cycleRevolutions must be 1 or 2');
  if (!Array.isArray(firingPhases) || firingPhases.length === 0 || firingPhases.length > 16)
    throw new DefinitionDomainError('firingPhases', 'Expected 1 to 16 firing phases');
  firingPhases.forEach((phase, i) => {
    if (!Number.isFinite(phase) || phase < 0 || phase >= 1 || (i > 0 && phase <= firingPhases[i - 1]!))
      throw new DefinitionDomainError(`firingPhases/${i}`, 'A firing phase lies in [0, 1), after the one before');
  });
  if (!exhaust || !Array.isArray(exhaust.banks) || !Array.isArray(exhaust.lengths) || !Array.isArray(exhaust.pipes))
    throw new DefinitionDomainError('exhaust', 'invalid exhaust topology');
  if (exhaust.banks.length !== firingPhases.length)
    throw new DefinitionDomainError('exhaust/banks', 'Expected one bank per firing phase');
  if (exhaust.lengths.length !== firingPhases.length)
    throw new DefinitionDomainError('exhaust/lengths', 'Expected one main pipe length per firing phase');
  // Resource limits bound delay storage; these are not claims about real exhaust geometry.
  exhaust.lengths.forEach((length, i) => {
    if (!Number.isFinite(length) || length < 0.1 || length > 3)
      throw new DefinitionDomainError(`exhaust/lengths/${i}`, 'A main pipe length lies within [0.1, 3] m');
  });
  if (!validPipes(exhaust.banks, exhaust.pipes)) throw new DefinitionDomainError('exhaust', 'invalid exhaust topology');
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
