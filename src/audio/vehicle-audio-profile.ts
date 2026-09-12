/** Firing facts and authored acoustic approximations; amplitudes are not pressure in Pa. */
export interface VehicleAudioProfile {
  readonly cycleRevolutions: 1 | 2;
  readonly firingPhases: readonly number[];
  readonly exhaust: {
    readonly banks: readonly number[];
    readonly lengths: readonly number[];
    readonly outlet: number;
  };
  readonly pulse: {
    readonly strength: number;
    readonly riseSeconds: number;
    readonly decaySeconds: number;
  };
}

export function compileVehicleAudioProfile(profile: VehicleAudioProfile): VehicleAudioProfile {
  const { cycleRevolutions, firingPhases, exhaust, pulse } = profile;
  if (
    (cycleRevolutions !== 1 && cycleRevolutions !== 2) ||
    !Array.isArray(firingPhases) ||
    firingPhases.length === 0 ||
    firingPhases.length > 16 ||
    firingPhases.some(
      (phase, i) => !Number.isFinite(phase) || phase < 0 || phase >= 1 || (i > 0 && phase <= firingPhases[i - 1]!),
    ) ||
    !pulse ||
    !Number.isFinite(pulse.strength) ||
    pulse.strength <= 0 ||
    pulse.strength > 4 ||
    !Number.isFinite(pulse.riseSeconds) ||
    pulse.riseSeconds < 0.00001 ||
    !Number.isFinite(pulse.decaySeconds) ||
    pulse.decaySeconds > 0.1 ||
    pulse.riseSeconds >= pulse.decaySeconds
  )
    throw new RangeError('invalid firing or pulse profile');
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
    pulse: Object.freeze({ ...pulse }),
    exhaust: Object.freeze({
      ...exhaust,
      banks: Object.freeze([...exhaust.banks]),
      lengths: Object.freeze([...exhaust.lengths]),
    }),
  });
}
