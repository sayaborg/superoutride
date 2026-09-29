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
  /** No fuel is injected; excitation becomes pumping rather than combustion. */
  readonly fuelCut: boolean;
  readonly shift: ShiftAudioObservation;
  readonly front: TireAudioObservation;
  readonly rear: TireAudioObservation;
}

/** A zeroed observation that its owner fills in place, once per presented frame. */
export type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
export type MutableVehicleAudioObservation = Mutable<Omit<VehicleAudioObservation, 'shift' | 'front' | 'rear'>> & {
  shift: Mutable<ShiftAudioObservation>;
  front: Mutable<TireAudioObservation>;
  rear: Mutable<TireAudioObservation>;
};
export function createVehicleAudioObservation(): MutableVehicleAudioObservation {
  const tire = (): Mutable<TireAudioObservation> => ({
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: null,
  });
  return {
    rpm: 0,
    effectiveOpening: 0,
    fuelCut: false,
    shift: { sequence: 0, direction: 'NONE', fromRpm: 0, toRpm: 0 },
    front: tire(),
    rear: tire(),
  };
}
