/** Authored acoustic approximation, independent of mechanical calibration. */
export interface VehicleAudioProfile {
  readonly cycleRevolutions: number;
  readonly firingPhases: readonly number[];
  readonly pulseWidth: number;
  readonly resonanceHz: number;
  readonly resonanceQ: number;
  readonly crackHz: number;
  readonly crackGain: number;
  readonly saturation: number;
  readonly gain: number;
  readonly exhaust?: {
    readonly banks: readonly number[];
    readonly lengths: readonly number[];
    readonly outlet: number;
  };
}

export function compileVehicleAudioProfile(profile: VehicleAudioProfile): VehicleAudioProfile {
  const { cycleRevolutions, firingPhases, pulseWidth, resonanceHz, resonanceQ, crackHz, crackGain, saturation, gain } =
    profile;
  if (
    ![cycleRevolutions, pulseWidth, resonanceHz, resonanceQ, crackHz, crackGain, saturation, gain].every(
      Number.isFinite,
    ) ||
    !(
      cycleRevolutions > 0 &&
      pulseWidth > 0 &&
      pulseWidth <= 1 &&
      resonanceHz > 0 &&
      resonanceHz <= 10000 &&
      resonanceQ > 0 &&
      resonanceQ <= 8 &&
      crackHz > 0 &&
      crackHz <= 10000 &&
      crackGain >= 0 &&
      crackGain <= 2 &&
      saturation >= 1 &&
      saturation <= 8 &&
      gain > 0 &&
      gain <= 1
    ) ||
    firingPhases.length === 0 ||
    firingPhases.length > 16 ||
    firingPhases.some(
      (phase, i) => !Number.isFinite(phase) || phase < 0 || phase >= 1 || (i > 0 && phase <= firingPhases[i - 1]!),
    )
  ) {
    throw new RangeError('invalid acoustic profile');
  }
  const exhaust = profile.exhaust;
  if (
    exhaust &&
    (exhaust.banks.length !== firingPhases.length ||
      exhaust.lengths.length !== firingPhases.length ||
      exhaust.banks.some((bank) => !Number.isInteger(bank) || bank < 0 || bank > 1) ||
      !exhaust.banks.includes(0) ||
      exhaust.lengths.some((length) => !Number.isFinite(length) || length < 0.1 || length > 3) ||
      !Number.isFinite(exhaust.outlet) ||
      exhaust.outlet < 0.1 ||
      exhaust.outlet > 4)
  )
    throw new RangeError('invalid exhaust topology');
  return Object.freeze({
    ...profile,
    firingPhases: Object.freeze([...firingPhases]),
    ...(exhaust
      ? {
          exhaust: Object.freeze({
            ...exhaust,
            banks: Object.freeze([...exhaust.banks]),
            lengths: Object.freeze([...exhaust.lengths]),
          }),
        }
      : {}),
  });
}
