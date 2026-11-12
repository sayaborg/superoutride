import type { VehicleListingDocument } from '../vehicle/definition-document.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { resetDrivingActuatorState } from '../vehicle/physics/driving-actuator.js';
import { resetVehicleControlObservation } from '../vehicle/physics/vehicle-state.js';
import { mix } from './seed-mix.js';

/**
 * Game timing from contact, POLE POSITION II's explosion's: its frames a second (its screen's, 24.576 MHz / 4 / 384 /
 * 264), the frame its debris is cleared at, which ends the blast, and the frame the vehicle is back at, as its script
 * (`content/originals/explosions/polepos2-explosion.json`) gives them; unrelated to a vehicle's physical failure or
 * fuel.
 */
const FRAMES_A_SECOND = 24_576_000 / 4 / 384 / 264;
export const CONTACT_EXPLOSION = Object.freeze({
  framesASecond: FRAMES_A_SECOND,
  blastFrames: 162,
  recoveryFrames: 174,
  blastSeconds: 162 / FRAMES_A_SECOND,
  recoverySeconds: 174 / FRAMES_A_SECOND,
  protectionSeconds: 1,
});

export interface ContactResponseObservation {
  readonly phase: 'driving' | 'exploding' | 'recovering' | 'protected';
  /** Time since contact while stopped, since recovery while protected, otherwise zero. */
  readonly seconds: number;
  /** Increases exactly once for each accepted contact start. */
  readonly sequence: number;
  /** The explosion's 32-bit word, drawn from the run's seed, the vehicle and the sequence, its debris' randomness. */
  readonly seed: number;
  /** The vehicle's yaw at the contact, radians, which its debris keeps as it is thrown (the auditor's choice). */
  readonly yaw: number;
}

export interface ContactResponseState {
  readonly enabled: boolean;
  phase: ContactResponseObservation['phase'];
  seconds: number;
  sequence: number;
  seed: number;
  yaw: number;
}

export function createContactResponse(policy: VehicleListingDocument['contactResponse']): ContactResponseState {
  return { enabled: policy === 'explode', phase: 'driving', seconds: 0, sequence: 0, seed: 0, yaw: 0 };
}

export const contactResponseStopped = (state: ContactResponseObservation): boolean =>
  state.phase === 'exploding' || state.phase === 'recovering';

/**
 * A solid contact starts the game sequence even at rest, its controls let go; repeated or protected starts do
 * nothing. `seed` draws the explosion's word from its sequence (`explosionSeed`).
 */
export function beginContactResponse(
  state: ContactResponseState,
  vehicle: VehicleState,
  seed: (sequence: number) => number,
): void {
  if (!state.enabled || state.phase !== 'driving') return;
  state.phase = 'exploding';
  state.seconds = 0;
  state.sequence += 1;
  state.seed = seed(state.sequence);
  state.yaw = vehicle.yaw;
  // The driver lets go; the vehicle keeps its motion and slides on, braked, by its own physics (K, 2026-11-08).
  resetDrivingActuatorState(vehicle.actuator);
  resetVehicleControlObservation(vehicle);
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

/** A vehicle `id`'s explosion's word, its `sequence`th, from the run's `seed`: integer arithmetic alone. */
export function explosionSeed(seed: number, id: string, sequence: number): number {
  let h = mix(seed ^ 0x5bd1e995);
  for (let k = 0; k < id.length; k++) h = mix(h ^ id.charCodeAt(k));
  return mix(h ^ sequence);
}
