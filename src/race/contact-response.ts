import type { VehicleListingDocument } from '../vehicle/definition-document.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { resetDrivingActuatorState } from '../vehicle/physics/driving-actuator.js';
import { resetVehicleControlObservation } from '../vehicle/physics/vehicle-state.js';
import { initializeVehicleTireObservation } from '../vehicle/physics/vehicle-tire-observation.js';

/** Game timing, in seconds from contact; unrelated to a vehicle's physical failure or fuel. */
export const CONTACT_EXPLOSION = Object.freeze({ blastSeconds: 1.2, recoverySeconds: 2.4, protectionSeconds: 1 });

export interface ContactResponseObservation {
  readonly phase: 'driving' | 'exploding' | 'recovering' | 'protected';
  /** Time since contact while stopped, since recovery while protected, otherwise zero. */
  readonly seconds: number;
  /** Increases exactly once for each accepted contact start. */
  readonly sequence: number;
}

export interface ContactResponseState {
  readonly enabled: boolean;
  phase: ContactResponseObservation['phase'];
  seconds: number;
  sequence: number;
}

export function createContactResponse(policy: VehicleListingDocument['contactResponse']): ContactResponseState {
  return { enabled: policy === 'explode', phase: 'driving', seconds: 0, sequence: 0 };
}

export const contactResponseStopped = (state: ContactResponseObservation): boolean =>
  state.phase === 'exploding' || state.phase === 'recovering';

/** A solid contact starts the game sequence even at rest; repeated or protected starts do nothing. */
export function beginContactResponse(state: ContactResponseState, vehicle: VehicleState): void {
  if (!state.enabled || state.phase !== 'driving') return;
  state.phase = 'exploding';
  state.seconds = 0;
  state.sequence += 1;
  // The explicit game stop keeps the collision pose. Ordinary vehicle integration has no explosion exception.
  vehicle.velocityX = vehicle.velocityY = vehicle.velocityZ = 0;
  vehicle.yawRate = vehicle.pitchRate = 0;
  vehicle.frontWheelOmega = vehicle.rearWheelOmega = 0;
  vehicle.longitudinalAcceleration = vehicle.lateralAcceleration = 0;
  resetDrivingActuatorState(vehicle.actuator);
  resetVehicleControlObservation(vehicle);
  initializeVehicleTireObservation(vehicle.tires, vehicle.tires.front.load, vehicle.tires.rear.load);
}

/** One fixed gameplay step. A blocked recovery waits without replaying; success begins protection at rest. */
export function advanceContactResponse(state: ContactResponseState, dt: number, recover: () => boolean): boolean {
  if (state.phase === 'driving') return false;
  state.seconds += dt;
  if (state.phase === 'protected') {
    if (state.seconds >= CONTACT_EXPLOSION.protectionSeconds) {
      state.phase = 'driving';
      state.seconds = 0;
    }
    return false;
  }
  if (state.seconds >= CONTACT_EXPLOSION.blastSeconds) state.phase = 'recovering';
  if (state.seconds < CONTACT_EXPLOSION.recoverySeconds || !recover()) return false;
  state.phase = 'protected';
  state.seconds = 0;
  return true;
}
