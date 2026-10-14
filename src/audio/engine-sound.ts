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
  /** The document's authoring notes as written: never read, kept for the DEV export. */
  readonly metadata: unknown;
}

/**
 * Check the exhaust's pipes against its banks, refusing at the field each rule reads: 1 to 8 pipes
 * (`exhaust/pipes`) of 0.1 to 4 m (`exhaust/pipes/2/length`) between junctions numbered from 0 (`exhaust/banks/1`,
 * `exhaust/pipes/2/from`, `exhaust/pipes/2/to`), contiguous; at least one open; every junction reaching an open end
 * through pipes (either direction). The last two are rules over the pipes together and refuse at `exhaust/pipes`.
 * Loops are allowed.
 */
function checkPipes(banks: readonly number[], pipes: readonly ExhaustPipe[]): void {
  const junction = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
  if (pipes.length < 1 || pipes.length > 8) throw new DefinitionDomainError('exhaust/pipes', 'Expected 1 to 8 pipes');
  banks.forEach((bank, i) => {
    if (!junction(bank)) throw new DefinitionDomainError(`exhaust/banks/${i}`, 'A bank is a junction number from 0');
  });
  pipes.forEach((pipe, i) => {
    if (!pipe) throw new DefinitionDomainError(`exhaust/pipes/${i}`, 'Expected a pipe');
    if (!Number.isFinite(pipe.length) || pipe.length < 0.1 || pipe.length > 4)
      throw new DefinitionDomainError(`exhaust/pipes/${i}/length`, 'A pipe length lies within [0.1, 4] m');
    if (!junction(pipe.from))
      throw new DefinitionDomainError(`exhaust/pipes/${i}/from`, 'A pipe end is a junction number from 0');
    if (pipe.to !== null && !junction(pipe.to))
      throw new DefinitionDomainError(`exhaust/pipes/${i}/to`, 'A pipe end is a junction number from 0, or null');
  });
  const used = new Set<number>(banks);
  for (const pipe of pipes) {
    used.add(pipe.from);
    if (pipe.to !== null) used.add(pipe.to);
  }
  const count = used.size;
  for (let k = 0; k < count; k++)
    if (!used.has(k))
      throw new DefinitionDomainError('exhaust/pipes', `Junctions are numbered from 0; ${k} is missing`);
  // Junctions touching an open pipe reach the open end; spread that across pipes until nothing changes.
  const reaches = new Set<number>(pipes.filter((pipe) => pipe.to === null).map((pipe) => pipe.from));
  if (reaches.size === 0) throw new DefinitionDomainError('exhaust/pipes', 'At least one pipe is open (to: null)');
  for (let grown = true; grown;) {
    grown = false;
    for (const { from, to } of pipes)
      if (to !== null && reaches.has(from) !== reaches.has(to)) {
        reaches.add(from).add(to);
        grown = true;
      }
  }
  for (let k = 0; k < count; k++)
    if (!reaches.has(k)) throw new DefinitionDomainError('exhaust/pipes', `Junction ${k} reaches no open end`);
}

/**
 * The one value check of an engine sound. Each rule refuses at the field it reads (`firingPhases/2`,
 * `exhaust/lengths/0`, `exhaust/pipes/1/length`); the pipes' topology, a rule over them together, at `exhaust/pipes`.
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
  checkPipes(exhaust.banks, exhaust.pipes);
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
