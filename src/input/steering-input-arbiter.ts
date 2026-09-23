import { clampSteering } from '../vehicle/driving-input.js';

export type SteeringDirection = -1 | 1;

interface ActiveSteeringOwner {
  readonly owner: string;
  readonly value: number;
}

/**
 * Device-independent single-owner steering authority. A new owner publication supersedes the
 * previous owner; releasing that active owner returns to neutral and never revives a superseded
 * owner. Digital devices use press(), while analog devices publish any finite value in [-1,+1].
 */
export class SteeringInputArbiter {
  private active: ActiveSteeringOwner | null = null;

  press(owner: string, direction: SteeringDirection): void {
    this.setValue(owner, direction);
  }

  setValue(owner: string, value: number): void {
    if (owner.length === 0) throw new RangeError('steering input owner must be non-empty');
    this.active = { owner, value: clampSteering(value) };
  }

  release(owner: string): void {
    if (this.active?.owner === owner) this.active = null;
  }

  sample(): number {
    return this.active?.value ?? 0;
  }

  activeOwner(): string | null {
    return this.active?.owner ?? null;
  }

  reset(): void {
    this.active = null;
  }
}
