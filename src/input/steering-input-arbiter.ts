import { clampSteering } from '../vehicle/driving-input.js';
import type { InputOwner } from './input-owner.js';

interface ActiveSteeringOwner {
  readonly owner: InputOwner;
  readonly value: number;
}

/**
 * Device-independent single-owner steering authority. A new owner publication supersedes the
 * previous owner; releasing that active owner returns to neutral and never revives a superseded
 * owner. Owners publish any finite value, clamped to [-1,+1].
 */
export class SteeringInputArbiter {
  private active: ActiveSteeringOwner | null = null;

  set(owner: InputOwner, value: number): void {
    this.active = { owner, value: clampSteering(value) };
  }

  release(owner: InputOwner): void {
    if (this.active?.owner === owner) this.active = null;
  }

  sample(): number {
    return this.active?.value ?? 0;
  }

  activeOwner(): InputOwner | null {
    return this.active?.owner ?? null;
  }

  reset(): void {
    this.active = null;
  }
}
