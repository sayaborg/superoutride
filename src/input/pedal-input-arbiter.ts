import { normalizedPedalRequest, type PedalInput, type PedalRequest } from '../vehicle/driving-input.js';

export type PedalChannel = 'throttle' | 'brake';

interface HeldPedalOwner {
  readonly owner: string;
  readonly pedal: PedalChannel;
  readonly order: number;
  readonly request: PedalRequest;
}

/**
 * Device-independent held-owner arbitration. The most recently activated owner that remains held
 * wins; releasing it reveals the next-most-recent held owner without manufacturing another press.
 * Digital owners may use boolean shorthand; analog owners may remain actively held even at exact
 * zero so a touch origin is a real neutral authority rather than revealing an older device owner.
 */
export class PedalInputArbiter {
  private readonly heldOwners = new Map<string, HeldPedalOwner>();
  private nextOrder = 0;

  setOwner(owner: string, pedal: PedalChannel, request: PedalRequest): void {
    if (owner.length === 0) throw new RangeError('pedal input owner must be non-empty');
    const amount = normalizedPedalRequest(request);
    const current = this.heldOwners.get(owner);
    if (!(amount > 0)) {
      this.heldOwners.delete(owner);
      return;
    }
    if (current?.pedal === pedal) {
      this.heldOwners.set(owner, { ...current, request });
      return;
    }
    this.nextOrder += 1;
    this.heldOwners.set(owner, { owner, pedal, order: this.nextOrder, request });
  }

  setAnalogOwner(owner: string, pedal: PedalChannel, request: number): void {
    if (owner.length === 0) throw new RangeError('pedal input owner must be non-empty');
    normalizedPedalRequest(request);
    const current = this.heldOwners.get(owner);
    if (current !== undefined) {
      this.heldOwners.set(owner, { ...current, pedal, request });
      return;
    }
    this.nextOrder += 1;
    this.heldOwners.set(owner, { owner, pedal, order: this.nextOrder, request });
  }

  releaseOwner(owner: string): void {
    this.heldOwners.delete(owner);
  }

  sample(): PedalInput {
    const winner = this.winner();
    return {
      throttle: winner?.pedal === 'throttle' ? winner.request : false,
      brake: winner?.pedal === 'brake' ? winner.request : false,
    };
  }

  activeOwner(): string | null {
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
