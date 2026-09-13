import type { SurfaceType } from './surface-map.js';
import type { WheelSolveResult } from './tire-wheel.js';
import type { ContactObservation } from './vehicle-dynamics.js';

interface TireObservation {
  readonly rollingSpeed: number;
  readonly slipSpeed: number;
  /** Dissipated longitudinal/lateral slip power in watts, from the accepted tire solve. */
  readonly longitudinalPower: number;
  readonly lateralPower: number;
  readonly surface: SurfaceType;
}
type MutableTire = { -readonly [Key in keyof TireObservation]: TireObservation[Key] };
interface VehicleTires {
  readonly front: TireObservation;
  readonly rear: TireObservation;
}

/** Optional output channel. No additions to the authoritative vehicle/control snapshot. */
const observations = new WeakMap<object, { front: MutableTire; rear: MutableTire }>();

/** The first reader subscribes; subsequent completed ticks update this same readonly view. */
export function observeVehicleTires(vehicle: object): VehicleTires {
  let result = observations.get(vehicle);
  if (!result) {
    const tire = (): MutableTire => ({
      rollingSpeed: 0,
      slipSpeed: 0,
      longitudinalPower: 0,
      lateralPower: 0,
      surface: 'VOID',
    });
    result = { front: tire(), rear: tire() };
    observations.set(vehicle, result);
  }
  return result;
}

export function resetVehicleTireObservation(vehicle: object): void {
  const result = observations.get(vehicle);
  if (!result) return;
  for (const tire of [result.front, result.rear]) {
    tire.rollingSpeed = 0;
    tire.slipSpeed = 0;
    tire.longitudinalPower = 0;
    tire.lateralPower = 0;
    tire.surface = 'VOID';
  }
}

/** Publish the accepted final wheel result, never trial solves or reconstructed physics. */
export function publishVehicleTireObservation(
  vehicle: object,
  front: ContactObservation,
  frontWheel: WheelSolveResult,
  rear: ContactObservation,
  rearWheel: WheelSolveResult,
): void {
  const result = observations.get(vehicle);
  if (!result) return;
  record(result.front, front, frontWheel);
  record(result.rear, rear, rearWheel);
}

function record(result: MutableTire, contact: ContactObservation, wheel: WheelSolveResult): void {
  const loaded = contact.forceTransmitting && contact.tireFrameValid;
  result.rollingSpeed = loaded ? Math.abs(contact.longitudinalVelocity) : 0;
  result.slipSpeed = loaded ? Math.hypot(wheel.tire.sx, wheel.tire.sy) * wheel.tire.referenceSpeed : 0;
  // sx/sy use the force direction convention, so these products are nonnegative.
  result.longitudinalPower = loaded ? Math.max(0, wheel.tire.fx * wheel.tire.sx * wheel.tire.referenceSpeed) : 0;
  result.lateralPower = loaded ? Math.max(0, wheel.tire.fy * wheel.tire.sy * wheel.tire.referenceSpeed) : 0;
  result.surface = loaded ? contact.surface.surfaceType : 'VOID';
}
