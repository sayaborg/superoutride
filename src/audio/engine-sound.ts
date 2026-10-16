import { DefinitionDomainError } from '../core/admission.js';

/** Firing facts and the exhaust's dimensions; amplitudes are not pressure in Pa. */
export interface EngineSoundDefinition {
  readonly cycleRevolutions: 1 | 2;
  /**
   * Each cylinder's exhaust-opening instant (start of blowdown) as a fraction of the cycle. The offset
   * from combustion top dead centre is the same for every cylinder, so it is not represented.
   */
  readonly firingPhases: readonly number[];
  readonly exhaust: ExhaustDefinition;
}

/**
 * The exhaust from the valves to the tail: one primary per cylinder, in `firingPhases` order, then the pipes. Junctions
 * are numbered from 0; waves travel both ways, so `from`/`to` only name a pipe's ends. Lengths and diameters are
 * internal dimensions in metres.
 */
export interface ExhaustDefinition {
  /** One cylinder's exhaust valve (a two-stroke's exhaust port). */
  readonly valve: ExhaustValve;
  /** Cylinder i's primary, from its valve (the head's exhaust port included) to junction `to`. */
  readonly primaries: readonly ExhaustPrimary[];
  /** Pipes from junction `from` to junction `to`, or to an open end (`to: null`), as far as the tail. */
  readonly pipes: readonly ExhaustPipe[];
}

export interface ExhaustValve {
  /** The diameter of the circle whose area is the valve's greatest open area. */
  readonly diameter: number;
  /** How long the valve is open, seat to seat, as a share of the cycle from the cylinder's firing phase. */
  readonly open: number;
}

export interface ExhaustPrimary {
  readonly length: number;
  readonly diameter: number;
  readonly to: number;
}

export interface ExhaustPipe {
  readonly length: number;
  readonly diameter: number;
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
 * Resource limits: author values bounding the kernel's work and delay storage, not claims about real exhausts. A tube
 * (primary or pipe) is at most `tubeLengthMeters` long and `tubeDiameterMeters` wide.
 */
export const EXHAUST_LIMITS = Object.freeze({
  cylinders: 16,
  pipes: 16,
  tubeLengthMeters: 4,
  tubeDiameterMeters: 0.5,
});

const junction = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/** A tube's length and diameter: positive, within the resource limits, refused at `<path>/length` or `/diameter`. */
function checkTube(tube: { readonly length: number; readonly diameter: number } | undefined, path: string): void {
  if (!tube) throw new DefinitionDomainError(path, 'Expected a tube');
  const { tubeLengthMeters, tubeDiameterMeters } = EXHAUST_LIMITS;
  if (!Number.isFinite(tube.length) || tube.length <= 0 || tube.length > tubeLengthMeters)
    throw new DefinitionDomainError(`${path}/length`, `A length lies within (0, ${tubeLengthMeters}] m`);
  if (!Number.isFinite(tube.diameter) || tube.diameter <= 0 || tube.diameter > tubeDiameterMeters)
    throw new DefinitionDomainError(`${path}/diameter`, `A diameter lies within (0, ${tubeDiameterMeters}] m`);
}

/**
 * Check the exhaust's junctions, refusing at the field each rule reads: junctions numbered from 0
 * (`exhaust/primaries/1/to`, `exhaust/pipes/2/from`, `exhaust/pipes/2/to`), contiguous; at least one open pipe; every
 * junction reaching an open end through pipes (either direction). The last two are rules over the pipes together and
 * refuse at `exhaust/pipes`. Loops are allowed.
 */
function checkJunctions(primaries: readonly ExhaustPrimary[], pipes: readonly ExhaustPipe[]): void {
  primaries.forEach(({ to }, i) => {
    if (!junction(to)) throw new DefinitionDomainError(`exhaust/primaries/${i}/to`, 'A junction number from 0');
  });
  pipes.forEach(({ from, to }, i) => {
    if (!junction(from)) throw new DefinitionDomainError(`exhaust/pipes/${i}/from`, 'A junction number from 0');
    if (to !== null && !junction(to))
      throw new DefinitionDomainError(`exhaust/pipes/${i}/to`, 'A junction number from 0, or null');
  });
  const used = new Set<number>(primaries.map(({ to }) => to));
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
 * `exhaust/primaries/0/length`, `exhaust/pipes/1/diameter`, `exhaust/valve/open`); the pipes' count and topology,
 * rules over them together, at `exhaust/pipes`.
 */
export function compileEngineSound(definition: EngineSoundDefinition): EngineSound {
  const { cycleRevolutions, firingPhases, exhaust } = definition;
  if (cycleRevolutions !== 1 && cycleRevolutions !== 2)
    throw new DefinitionDomainError('cycleRevolutions', 'cycleRevolutions must be 1 or 2');
  if (!Array.isArray(firingPhases) || firingPhases.length === 0 || firingPhases.length > EXHAUST_LIMITS.cylinders)
    throw new DefinitionDomainError('firingPhases', `Expected 1 to ${EXHAUST_LIMITS.cylinders} firing phases`);
  firingPhases.forEach((phase, i) => {
    if (!Number.isFinite(phase) || phase < 0 || phase >= 1 || (i > 0 && phase <= firingPhases[i - 1]!))
      throw new DefinitionDomainError(`firingPhases/${i}`, 'A firing phase lies in [0, 1), after the one before');
  });
  if (!exhaust || !exhaust.valve || !Array.isArray(exhaust.primaries) || !Array.isArray(exhaust.pipes))
    throw new DefinitionDomainError('exhaust', 'invalid exhaust topology');
  const { valve, primaries, pipes } = exhaust;
  if (!Number.isFinite(valve.diameter) || valve.diameter <= 0)
    throw new DefinitionDomainError('exhaust/valve/diameter', 'A valve diameter is positive');
  if (!Number.isFinite(valve.open) || valve.open <= 0 || valve.open >= 1)
    throw new DefinitionDomainError('exhaust/valve/open', 'A valve is open for a share of the cycle within (0, 1)');
  if (primaries.length !== firingPhases.length)
    throw new DefinitionDomainError('exhaust/primaries', 'Expected one primary per firing phase');
  primaries.forEach((primary, i) => checkTube(primary, `exhaust/primaries/${i}`));
  if (pipes.length < 1 || pipes.length > EXHAUST_LIMITS.pipes)
    throw new DefinitionDomainError('exhaust/pipes', `Expected 1 to ${EXHAUST_LIMITS.pipes} pipes`);
  pipes.forEach((pipe, i) => checkTube(pipe, `exhaust/pipes/${i}`));
  checkJunctions(primaries, pipes);
  return Object.freeze({
    cycleRevolutions,
    firingPhases: Object.freeze([...firingPhases]),
    exhaust: Object.freeze({
      valve: Object.freeze({ diameter: valve.diameter, open: valve.open }),
      primaries: Object.freeze(primaries.map(({ length, diameter, to }) => Object.freeze({ length, diameter, to }))),
      pipes: Object.freeze(
        pipes.map(({ length, diameter, from, to }) => Object.freeze({ length, diameter, from, to })),
      ),
    }),
  });
}
