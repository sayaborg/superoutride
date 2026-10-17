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
  /**
   * The slip power beyond the start of the tire law's plateau (W): the total slip power times
   * `max(0, 1 - (2 - KN) / rho)`, the share the dissipation would lose were the slip brought back along its own
   * direction to the plateau's start. Zero before the plateau and at its start.
   */
  readonly slidingPower: number;
  /** The tire force's fraction of its friction ellipse, `hypot(fx/capacityX, fy/capacityY)`: 1 when saturated. */
  readonly utilization: number;
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
    slidingPower: 0,
    utilization: 0,
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
  tire.slidingPower = 0;
  tire.utilization = 0;
  tire.surface = null;
}

/**
 * Record the accepted final wheel result, never trial solves or reconstructed physics; `rhoKnee` is the tire law's knee
 * start `KN`, whose plateau begins at `2 - KN`.
 */
export function recordVehicleTireObservation(
  tires: VehicleTireObservation,
  rhoKnee: number,
  front: ContactObservation,
  frontWheel: WheelSolveResult,
  rear: ContactObservation,
  rearWheel: WheelSolveResult,
): void {
  record(tires.front as MutableTire, front, frontWheel, rhoKnee);
  record(tires.rear as MutableTire, rear, rearWheel, rhoKnee);
}

function record(result: MutableTire, contact: ContactObservation, wheel: WheelSolveResult, rhoKnee: number): void {
  const loaded = contact.forceTransmitting && contact.tireFrameValid;
  result.longitudinalVelocity = loaded ? contact.longitudinalVelocity : 0;
  result.lateralVelocity = loaded ? contact.lateralVelocity : 0;
  result.wheelSpeed = loaded ? contact.effectiveRollingRadius * wheel.omega : 0;
  result.wheelAngularSpeed = loaded ? wheel.omega : 0;
  result.load = contact.normalLoad;
  // sx/sy use the force direction convention, so these products are nonnegative.
  result.longitudinalPower = loaded ? Math.max(0, wheel.tire.fx * wheel.tire.sx * wheel.tire.referenceSpeed) : 0;
  result.lateralPower = loaded ? Math.max(0, wheel.tire.fy * wheel.tire.sy * wheel.tire.referenceSpeed) : 0;
  const { fx, fy, capacityX, capacityY, rho } = wheel.tire;
  const beyond = rho > 0 ? Math.max(0, 1 - (2 - rhoKnee) / rho) : 0;
  result.slidingPower = (result.longitudinalPower + result.lateralPower) * beyond;
  result.utilization = loaded && capacityX > 0 && capacityY > 0 ? Math.hypot(fx / capacityX, fy / capacityY) : 0;
  result.surface = loaded ? (contact.surface.material?.id ?? null) : null;
}
