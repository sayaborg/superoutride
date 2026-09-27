import type { WheelSolveResult } from './tire-wheel.js';
import type { ContactObservation } from './vehicle-contact.js';

export interface TireObservation {
  readonly longitudinalVelocity: number;
  readonly lateralVelocity: number;
  /** Effective contact rolling radius times the accepted signed wheel angular velocity. */
  readonly wheelSpeed: number;
  /** Accepted signed wheel angular velocity (rad/s), output only. */
  readonly wheelAngularSpeed: number;
  /** Contact normal load (N), also written for a contact without a valid tire frame. */
  readonly load: number;
  /** Dissipated longitudinal/lateral slip power in watts, from the accepted tire solve. */
  readonly longitudinalPower: number;
  readonly lateralPower: number;
  readonly surface: string | null;
}
type MutableTire = { -readonly [Key in keyof TireObservation]: TireObservation[Key] };

/** Read-only tire observations of one vehicle; only vehicle physics writes them. */
export interface VehicleTireObservation {
  readonly front: TireObservation;
  readonly rear: TireObservation;
}

export function createVehicleTireObservation(): VehicleTireObservation {
  const tire = (): MutableTire => ({
    longitudinalVelocity: 0,
    lateralVelocity: 0,
    wheelSpeed: 0,
    wheelAngularSpeed: 0,
    load: 0,
    longitudinalPower: 0,
    lateralPower: 0,
    surface: null,
  });
  return { front: tire(), rear: tire() };
}

/** The one initialization: the given loads and every other observation zero. */
export function initializeVehicleTireObservation(
  tires: VehicleTireObservation,
  frontLoad: number,
  rearLoad: number,
): void {
  initialize(tires.front as MutableTire, frontLoad);
  initialize(tires.rear as MutableTire, rearLoad);
}

function initialize(tire: MutableTire, load: number): void {
  tire.longitudinalVelocity = 0;
  tire.lateralVelocity = 0;
  tire.wheelSpeed = 0;
  tire.wheelAngularSpeed = 0;
  tire.load = load;
  tire.longitudinalPower = 0;
  tire.lateralPower = 0;
  tire.surface = null;
}

/** Record the accepted final wheel result, never trial solves or reconstructed physics. */
export function recordVehicleTireObservation(
  tires: VehicleTireObservation,
  front: ContactObservation,
  frontWheel: WheelSolveResult,
  rear: ContactObservation,
  rearWheel: WheelSolveResult,
): void {
  record(tires.front as MutableTire, front, frontWheel);
  record(tires.rear as MutableTire, rear, rearWheel);
}

function record(result: MutableTire, contact: ContactObservation, wheel: WheelSolveResult): void {
  const loaded = contact.forceTransmitting && contact.tireFrameValid;
  result.longitudinalVelocity = loaded ? contact.longitudinalVelocity : 0;
  result.lateralVelocity = loaded ? contact.lateralVelocity : 0;
  result.wheelSpeed = loaded ? contact.effectiveRollingRadius * wheel.omega : 0;
  result.wheelAngularSpeed = loaded ? wheel.omega : 0;
  result.load = contact.normalLoad;
  // sx/sy use the force direction convention, so these products are nonnegative.
  result.longitudinalPower = loaded ? Math.max(0, wheel.tire.fx * wheel.tire.sx * wheel.tire.referenceSpeed) : 0;
  result.lateralPower = loaded ? Math.max(0, wheel.tire.fy * wheel.tire.sy * wheel.tire.referenceSpeed) : 0;
  result.surface = loaded ? (contact.surface.material?.id ?? null) : null;
}
