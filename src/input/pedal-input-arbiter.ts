import {
  normalizedPedalRequest,
  type PedalInput,
  type PedalRequest,
} from './driving-input.js';

export type PedalChannel = 'throttle' | 'brake';

interface HeldPedalSource {
  readonly source: string;
  readonly pedal: PedalChannel;
  readonly order: number;
  readonly request: PedalRequest;
}

/**
 * Device-independent held-source arbitration. The most recently activated source that remains held
 * wins; releasing it reveals the next-most-recent held source without manufacturing another press.
 * Digital sources may use boolean shorthand; analog sources may remain actively held even at exact
 * zero so a touch origin is a real neutral authority rather than revealing an older device source.
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
    this.heldSources.set(source, { source, pedal, order: this.nextOrder, request });
  }

  setAnalogSource(source: string, pedal: PedalChannel, request: number): void {
    if (source.length === 0) throw new RangeError('pedal input source must be non-empty');
    normalizedPedalRequest(request);
    const current = this.heldSources.get(source);
    if (current !== undefined) {
      this.heldSources.set(source, { ...current, pedal, request });
      return;
    }
    this.nextOrder += 1;
    this.heldSources.set(source, { source, pedal, order: this.nextOrder, request });
  }

  releaseSource(source: string): void {
    this.heldSources.delete(source);
  }

  sample(): PedalInput {
    const winner = this.winner();
    return {
      throttle: winner?.pedal === 'throttle' ? winner.request : false,
      brake: winner?.pedal === 'brake' ? winner.request : false,
    };
  }

  activeSource(): string | null {
    return this.winner()?.source ?? null;
  }

  reset(): void {
    this.heldSources.clear();
    this.nextOrder = 0;
  }

  private winner(): HeldPedalSource | null {
    let winner: HeldPedalSource | null = null;
    for (const held of this.heldSources.values()) {
      if (winner === null || held.order > winner.order) winner = held;
    }
    return winner;
  }
}
