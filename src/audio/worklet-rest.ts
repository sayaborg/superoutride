declare const currentTime: number;

/**
 * Inside a worklet processor: whether its voice has it rest. A `{ restAt }` message names the context time from
 * which the processor renders silence without running its kernels; `{ restAt: null }` wakes it, and its kernels
 * continue from the state they rested in.
 */
export class WorkletRest {
  private restAt: number | null = null;

  /** Take a `{ restAt }` message; true when the message was one. */
  receive(data: unknown): boolean {
    if (typeof data !== 'object' || data === null || !Object.hasOwn(data, 'restAt')) return false;
    const { restAt } = data as { restAt: unknown };
    this.restAt = typeof restAt === 'number' ? restAt : null;
    return true;
  }

  get resting(): boolean {
    return this.restAt !== null && currentTime >= this.restAt;
  }
}
