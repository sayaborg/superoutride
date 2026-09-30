import type { PedalRequest } from '../vehicle/driving-input.js';
import type { InputOwner } from './input-owner.js';
import type { PedalChannel } from './pedal-input-arbiter.js';

/**
 * The input manager's publication boundary for adapters. Each call returns whether it was accepted;
 * nothing is accepted while input is suspended.
 */
export interface DrivingInputPublisher {
  setSteering(owner: InputOwner, value: number): boolean;
  releaseSteering(owner: InputOwner): boolean;
  setPedal(owner: InputOwner, pedal: PedalChannel, request: PedalRequest): boolean;
  releasePedal(owner: InputOwner): boolean;
}
