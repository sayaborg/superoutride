import type { PedalInput } from './driving-input.js';

export type PedalChannel = 'throttle' | 'brake';

interface HeldPedalSource {
  readonly pedal: PedalChannel;
  readonly order: number;
}

/**
 * Device-independent held-source arbitration. The most recently pressed source that remains held
 * wins; releasing it reveals the next-most-recent held source without manufacturing another press.
 */
export class PedalInputArbiter {
  private readonly heldSources = new Map<string, HeldPedalSource>();
  private nextOrder = 0;

  setSource(source: string, pedal: PedalChannel, pressed: boolean): void {
    if (source.length === 0) throw new RangeError('pedal input source must be non-empty');
    const current = this.heldSources.get(source);
    if (!pressed) {
      this.heldSources.delete(source);
      return;
    }
    if (current?.pedal === pedal) return;
    this.nextOrder += 1;
    this.heldSources.set(source, { pedal, order: this.nextOrder });
  }

  sample(): PedalInput {
    let winner: HeldPedalSource | null = null;
    for (const held of this.heldSources.values()) {
      if (winner === null || held.order > winner.order) winner = held;
    }
    return {
      throttle: winner?.pedal === 'throttle',
      brake: winner?.pedal === 'brake',
    };
  }

  reset(): void {
    this.heldSources.clear();
    this.nextOrder = 0;
  }
}
