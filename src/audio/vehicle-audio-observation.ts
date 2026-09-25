/** Consumer-owned read contract. No physics, catalog or DOM dependency. Units: SI and RPM. */
export interface TireAudioObservation {
  readonly longitudinalVelocity: number;
  readonly lateralVelocity: number;
  readonly wheelSpeed: number;
  /** Accepted wheel angular velocity, rad/s; not vehicle speed. */
  readonly wheelAngularSpeed: number;
  readonly load: number;
  /** Dissipated longitudinal/lateral slip power in watts, from the accepted tire solve. */
  readonly longitudinalPower: number;
  readonly lateralPower: number;
  readonly surface: string | null;
}
/** The powertrain's last shift; a new sequence marks a shift not yet heard. Sequence 0: none yet. */
export interface ShiftAudioObservation {
  readonly sequence: number;
  readonly direction: 'NONE' | 'UP' | 'DOWN';
  readonly fromRpm: number;
  readonly toRpm: number;
}
export interface VehicleAudioObservation {
  /** Engine speed exactly as simulated; it never falls below idle. */
  readonly rpm: number;
  /** The engine's effective opening in [0,1]: an acoustic excitation proxy, not cylinder load. */
  readonly effectiveOpening: number;
  readonly shift: ShiftAudioObservation;
  readonly front: TireAudioObservation;
  readonly rear: TireAudioObservation;
}
