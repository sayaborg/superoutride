import { normalizedPedalRequest, type PedalInput, type PedalRequest } from '../vehicle/driving-input.js';
import type { InputOwner } from './input-owner.js';

export type PedalChannel = 'throttle' | 'brake';

interface HeldPedalOwner {
  readonly owner: InputOwner;
  readonly pedal: PedalChannel;
  readonly order: number;
  readonly request: PedalRequest;
}

/**
 * Device-independent held-owner arbitration. The most recently activated owner that remains held
 * wins; releasing it reveals the next-most-recent held owner without manufacturing another press.
 * An owner is held from its first set until its release, even at exact zero, so a touch origin is a
 * real neutral authority rather than revealing an older owner. A held owner keeps its activation
 * order when it sets again; a new owner takes the next order.
 */
export class PedalInputArbiter {
  private readonly heldOwners = new Map<InputOwner, HeldPedalOwner>();
  private nextOrder = 0;

  set(owner: InputOwner, pedal: PedalChannel, request: PedalRequest): void {
    normalizedPedalRequest(request);
    const current = this.heldOwners.get(owner);
    if (current !== undefined) {
      this.heldOwners.set(owner, { ...current, pedal, request });
      return;
    }
    this.nextOrder += 1;
    this.heldOwners.set(owner, { owner, pedal, order: this.nextOrder, request });
  }

  release(owner: InputOwner): void {
    this.heldOwners.delete(owner);
  }

  sample(): PedalInput {
    const winner = this.winner();
    return {
      throttle: winner?.pedal === 'throttle' ? winner.request : false,
      brake: winner?.pedal === 'brake' ? winner.request : false,
    };
  }

  activeOwner(): InputOwner | null {
    return this.winner()?.owner ?? null;
  }

  reset(): void {
    this.heldOwners.clear();
    this.nextOrder = 0;
  }

  private winner(): HeldPedalOwner | null {
    let winner: HeldPedalOwner | null = null;
    for (const held of this.heldOwners.values()) {
      if (winner === null || held.order > winner.order) winner = held;
    }
    return winner;
  }
}
