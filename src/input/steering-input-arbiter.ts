export type SteeringDirection = -1 | 1;

interface ActiveSteeringSource {
  readonly source: string;
  readonly direction: SteeringDirection;
}

/**
 * Device-independent single-source steering authority. A new press supersedes the previous source;
 * releasing that active source returns to neutral and never revives a superseded source.
 */
export class SteeringInputArbiter {
  private active: ActiveSteeringSource | null = null;

  press(source: string, direction: SteeringDirection): void {
    if (source.length === 0) throw new RangeError('steering input source must be non-empty');
    this.active = { source, direction };
  }

  release(source: string): void {
    if (this.active?.source === source) this.active = null;
  }

  sample(): -1 | 0 | 1 {
    return this.active?.direction ?? 0;
  }

  activeSource(): string | null {
    return this.active?.source ?? null;
  }

  reset(): void {
    this.active = null;
  }
}
