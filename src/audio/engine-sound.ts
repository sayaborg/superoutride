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
    /** One primary per cylinder, sharing one internal diameter. */
    readonly primaries: { readonly lengths: readonly number[]; readonly bore: number };
    /** Series segments from each collector to the open end; a wide segment is an expansion chamber. */
    readonly outlet: readonly ExhaustSegment[];
  };
}

/** A pipe segment's length and internal diameter, in meters. */
export interface ExhaustSegment {
  readonly length: number;
  readonly bore: number;
  /** Additional loss from packing at `absorptionHz`, in Np/m (0 to 20); 0 for a plain pipe segment. */
  readonly absorption: number;
  /** Reference frequency of `absorption` (50 to 8000 Hz); the packing loss falls toward 0 at low frequency. */
  readonly absorptionHz: number;
}

export type CompiledEngineSound = Readonly<EngineSoundDefinition>;

const validBore = (bore: number) => Number.isFinite(bore) && bore >= 0.01 && bore <= 0.3;

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
  const primaries = exhaust?.primaries;
  const outlet = exhaust?.outlet;
  if (
    !exhaust ||
    !Array.isArray(exhaust.banks) ||
    !primaries ||
    !Array.isArray(primaries.lengths) ||
    !Array.isArray(outlet) ||
    exhaust.banks.length !== firingPhases.length ||
    primaries.lengths.length !== firingPhases.length ||
    exhaust.banks.some((bank) => !Number.isInteger(bank) || bank < 0 || bank > 1) ||
    !exhaust.banks.includes(0) ||
    primaries.lengths.some((length) => !Number.isFinite(length) || length < 0.1 || length > 3) ||
    !validBore(primaries.bore) ||
    outlet.length < 1 ||
    outlet.length > 4 ||
    outlet.some(
      (segment) =>
        !segment ||
        !Number.isFinite(segment.length) ||
        segment.length <= 0 ||
        !validBore(segment.bore) ||
        !Number.isFinite(segment.absorption) ||
        segment.absorption < 0 ||
        segment.absorption > 20 ||
        !Number.isFinite(segment.absorptionHz) ||
        segment.absorptionHz < 50 ||
        segment.absorptionHz > 8000,
    )
  )
    throw new RangeError('invalid exhaust topology');
  const outletLength = outlet.reduce((total, segment) => total + segment.length, 0);
  if (outletLength < 0.1 || outletLength > 4) throw new RangeError('invalid exhaust topology');
  return Object.freeze({
    cycleRevolutions,
    firingPhases: Object.freeze([...firingPhases]),
    exhaust: Object.freeze({
      banks: Object.freeze([...exhaust.banks]),
      primaries: Object.freeze({ lengths: Object.freeze([...primaries.lengths]), bore: primaries.bore }),
      outlet: Object.freeze(
        outlet.map(({ length, bore, absorption, absorptionHz }) =>
          Object.freeze({ length, bore, absorption, absorptionHz }),
        ),
      ),
    }),
  });
}
