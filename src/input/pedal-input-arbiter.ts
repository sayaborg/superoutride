import {
  normalizedPedalRequest,
  type PedalInput,
  type PedalRequest,
} from './driving-input.js';

export type PedalChannel = 'throttle' | 'brake';

interface HeldPedalSource {
  readonly pedal: PedalChannel;
  readonly order: number;
  readonly request: PedalRequest;
}

/**
 * Device-independent held-source arbitration. The most recently activated source that remains held
 * wins; releasing it reveals the next-most-recent held source without manufacturing another press.
 * Digital sources may use boolean shorthand; analog sources publish normalized [0,1] amounts.
 */
export class PedalInputArbiter {
  private readonly heldSources = new Map<string, HeldPedalSource>();
  private nextOrder = 0;

  setSource(source: string, pedal: PedalChannel, request: PedalRequest): void {
    if (source.length === 0) throw new RangeError('pedal input source must be non-empty');
    const amount = normalizedPedalRequest(request);
    const current = this.heldSources.get(source);
    if (!(amount > 0)) {
      this.heldSources.delete(source);
      return;
    }
    if (current?.pedal === pedal) {
      this.heldSources.set(source, { ...current, request });
      return;
    }
    this.nextOrder += 1;
    this.heldSources.set(source, { pedal, order: this.nextOrder, request });
  }

  sample(): PedalInput {
    let winner: HeldPedalSource | null = null;
    for (const held of this.heldSources.values()) {
      if (winner === null || held.order > winner.order) winner = held;
    }
    return {
      throttle: winner?.pedal === 'throttle' ? winner.request : false,
      brake: winner?.pedal === 'brake' ? winner.request : false,
    };
  }

  reset(): void {
    this.heldSources.clear();
    this.nextOrder = 0;
  }
}
