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
  return Object.freeze({ ...profile, firingPhases: Object.freeze([...firingPhases]) });
}
