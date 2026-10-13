/**
 * Cooperative slicing of long work: between its units the work asks whether its slice is `due` and, when it is, awaits
 * `pause`, which yields to the event loop and begins the next slice. Work that is given no slices (`UNSLICED`) runs
 * through at once.
 */
export interface WorkSlices {
  /** Whether the current slice has used its time. */
  due(): boolean;
  /** Yield to the event loop; the next slice begins when it resolves. */
  pause(): Promise<void>;
}

/** No slicing: the work never pauses. */
export const UNSLICED: WorkSlices = Object.freeze({
  due: () => false,
  pause: () => Promise.resolve(),
});

/**
 * Slices of `milliseconds` of work each by the clock `now`, each pause yielding through `yieldToEventLoop`. The first
 * slice begins when they are created.
 */
export function createWorkSlices(
  milliseconds: number,
  now: () => number,
  yieldToEventLoop: () => Promise<void>,
): WorkSlices {
  if (!(milliseconds > 0)) throw new RangeError('A work slice must last a positive time');
  let started = now();
  return Object.freeze({
    due: () => now() - started >= milliseconds,
    async pause() {
      await yieldToEventLoop();
      started = now();
    },
  });
}
