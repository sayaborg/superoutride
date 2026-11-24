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
 * The exhaust from the valves to the tail, as the exhaust kernel reads it: tubes of one diameter that have only a
 * length, between valves, junctions and mouths. Tube i of the first `firingPhases.length` is cylinder i's, from its
 * valve (`from: null`; the head's exhaust port included); every other tube runs from a junction. A tube ends at a
 * junction or at a mouth (`to: null`). Junctions are numbered from 0 and are where three or more tubes meet; waves travel
 * both ways, so `from`/`to` only name a tube's ends. Lengths and the diameter are internal dimensions in metres.
 */
export interface ExhaustDefinition {
  /** One cylinder's exhaust valve (a two-stroke's exhaust port). */
  readonly valve: ExhaustValve;
  /** Every tube's internal diameter. */
  readonly diameter: number;
  readonly tubes: readonly ExhaustTube[];
}

export interface ExhaustValve {
  /** The diameter of the circle whose area is the valve's greatest open area. */
  readonly diameter: number;
  /** How long the valve is open, seat to seat, as a share of the cycle from the cylinder's firing phase. */
  readonly open: number;
}

/** A tube from a valve (`from: null`) or a junction, to a junction or a mouth (`to: null`). */
export interface ExhaustTube {
  readonly from: number | null;
  readonly to: number | null;
  readonly length: number;
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
 * Resource limits: author values bounding the kernel's work and delay storage and refusing broken values, not claims
 * about real exhausts or rules of the sound: at most
 * `cylinders` firing phases and `tubes` tubes, every tube at most `tubeLengthMeters` long and the exhaust at most
 * `diameterMeters` wide.
 */
export const EXHAUST_LIMITS = Object.freeze({
  cylinders: 16,
  tubes: 48,
  tubeLengthMeters: 8,
  diameterMeters: 0.5,
});

const junction = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/**
 * Check the exhaust's tubes and junctions, refusing at the field each rule reads: each tube's length, within the limits
 * (`exhaust/tubes/2/length`); the first `cylinders` tubes from a valve, in the cylinders' order, and no other
 * (`exhaust/tubes/1/from`); every end a junction number from 0, or null for a valve or a mouth (`exhaust/tubes/2/to`).
 * Rules over the tubes together refuse at `exhaust/tubes`: their count; junctions numbered from 0 with none missing;
 * three or more tubes meeting at every junction (two meeting alone are one tube); at least one mouth, which every
 * junction reaches through tubes (either direction). Loops are allowed.
 */
function checkTubes(tubes: readonly ExhaustTube[], cylinders: number): void {
  const { tubes: most, tubeLengthMeters } = EXHAUST_LIMITS;
  if (tubes.length < cylinders || tubes.length > most)
    throw new DefinitionDomainError(
      'exhaust/tubes',
      `Expected ${cylinders} to ${most} tubes: one from each valve first`,
    );
  tubes.forEach(({ from, to, length }, i) => {
    const at = `exhaust/tubes/${i}`;
    if (!Number.isFinite(length) || length <= 0 || length > tubeLengthMeters)
      throw new DefinitionDomainError(`${at}/length`, `A length lies within (0, ${tubeLengthMeters}] m`);
    if (i < cylinders ? from !== null : !junction(from))
      throw new DefinitionDomainError(
        `${at}/from`,
        i < cylinders ? `Tube ${i} runs from cylinder ${i}'s valve (null)` : 'A junction number from 0',
      );
    if (to !== null && !junction(to)) throw new DefinitionDomainError(`${at}/to`, 'A junction number from 0, or null');
  });
  // How many tube ends meet at each junction.
  const met = new Map<number, number>();
  for (const { from, to } of tubes)
    for (const end of [from, to]) if (end !== null) met.set(end, (met.get(end) ?? 0) + 1);
  for (let k = 0; k < met.size; k++) {
    if (!met.has(k)) throw new DefinitionDomainError('exhaust/tubes', `Junctions are numbered from 0; ${k} is missing`);
    if (met.get(k)! < 3)
      throw new DefinitionDomainError(
        'exhaust/tubes',
        `Junction ${k} is met by ${met.get(k)} tube ends; three or more meet at a junction, and two are one tube`,
      );
  }
  // Junctions touching a mouth's tube reach the open; spread that across tubes until nothing changes.
  if (!tubes.some(({ to }) => to === null))
    throw new DefinitionDomainError('exhaust/tubes', 'At least one tube ends at a mouth (to: null)');
  const reaches = new Set<number>(tubes.flatMap(({ from, to }) => (to === null && from !== null ? [from] : [])));
  for (let grown = true; grown;) {
    grown = false;
    for (const { from, to } of tubes)
      if (from !== null && to !== null && reaches.has(from) !== reaches.has(to)) {
        reaches.add(from).add(to);
        grown = true;
      }
  }
  for (let k = 0; k < met.size; k++)
    if (!reaches.has(k)) throw new DefinitionDomainError('exhaust/tubes', `Junction ${k} reaches no mouth`);
}

/**
 * The one value check of an engine sound. Each rule refuses at the field it reads (`firingPhases/2`,
 * `exhaust/valve/open`, `exhaust/diameter`, `exhaust/tubes/0/length`); the tubes' count and topology, rules over them
 * together, at `exhaust/tubes` (`checkTubes`).
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
  if (!exhaust || !exhaust.valve || !Array.isArray(exhaust.tubes))
    throw new DefinitionDomainError('exhaust', 'invalid exhaust topology');
  const { valve, diameter, tubes } = exhaust;
  if (!Number.isFinite(valve.diameter) || valve.diameter <= 0)
    throw new DefinitionDomainError('exhaust/valve/diameter', 'A valve diameter is positive');
  if (!Number.isFinite(valve.open) || valve.open <= 0 || valve.open >= 1)
    throw new DefinitionDomainError('exhaust/valve/open', 'A valve is open for a share of the cycle within (0, 1)');
  if (!Number.isFinite(diameter) || diameter <= 0 || diameter > EXHAUST_LIMITS.diameterMeters)
    throw new DefinitionDomainError(
      'exhaust/diameter',
      `A diameter lies within (0, ${EXHAUST_LIMITS.diameterMeters}] m`,
    );
  checkTubes(tubes, firingPhases.length);
  return Object.freeze({
    cycleRevolutions,
    firingPhases: Object.freeze([...firingPhases]),
    exhaust: Object.freeze({
      valve: Object.freeze({ diameter: valve.diameter, open: valve.open }),
      diameter,
      tubes: Object.freeze(tubes.map(({ from, to, length }) => Object.freeze({ from, to, length }))),
    }),
  });
}
