import { clampSteering } from './driving-input.js';

export type SteeringDirection = -1 | 1;

interface ActiveSteeringSource {
  readonly source: string;
  readonly value: number;
}

/**
 * Device-independent single-source steering authority. A new source publication supersedes the
 * previous source; releasing that active source returns to neutral and never revives a superseded
 * source. Digital devices use press(), while analog devices publish any finite value in [-1,+1].
 */
export class SteeringInputArbiter {
  private active: ActiveSteeringSource | null = null;

  press(source: string, direction: SteeringDirection): void {
    this.setValue(source, direction);
  }

  setValue(source: string, value: number): void {
    if (source.length === 0) throw new RangeError('steering input source must be non-empty');
    if (!Number.isFinite(value)) throw new RangeError('steering input value must be finite');
    this.active = { source, value: clampSteering(value) };
  }

  release(source: string): void {
    if (this.active?.source === source) this.active = null;
  }

  sample(): number {
    return this.active?.value ?? 0;
  }

  activeSource(): string | null {
    return this.active?.source ?? null;
  }

  reset(): void {
    this.active = null;
  }
}
