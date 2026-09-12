/** Consumer-owned read contract. No physics, catalog or DOM dependency. Units: SI and RPM. */
export interface TireAudioObservation {
  readonly load: number;
  readonly rollingSpeed: number;
  readonly slipSpeed: number;
  readonly utilization: number;
  readonly surface: 'ASPHALT' | 'SHOULDER' | 'GRASS' | 'DIRT' | 'SAND' | 'VOID';
}
export interface VehicleAudioObservation {
  readonly rpm: number;
  readonly idleRpm: number;
  readonly redlineRpm: number;
  readonly throttle: number;
  /** Delivered-drive fraction times throttle: an acoustic excitation proxy, not cylinder load. */
  readonly drive: number;
  readonly speed: number;
  readonly front: TireAudioObservation;
  readonly rear: TireAudioObservation;
}
