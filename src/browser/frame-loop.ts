/** Fixed browser simulation period in seconds. */
export const SIM_DT = 1 / 60;

/** Bound catch-up after a suspended tab; simulation itself always receives SIM_DT. */
export const MAX_FRAME_ELAPSED_SECONDS = 0.25;

export interface FrameClock {
  now(): number;
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

export interface FrameLoop {
  start(): void;
  stop(): void;
}

/** One browser scheduler, with an injectable clock for causal lifecycle regressions. */
export function createFrameLoop(
  tick: (dt: number) => void,
  render: () => void,
  clock: FrameClock = {
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
  },
): FrameLoop {
  let running = false;
  let generation = 0;
  let request: number | null = null;
  let previousTime = 0;
  let accumulator = 0;

  function requestNext(): void {
    const token = generation;
    request = clock.request((now) => frame(now, token));
  }

  function frame(now: number, token: number): void {
    if (!running || token !== generation) return;
    request = null;
    accumulator += Math.max(0, Math.min((now - previousTime) / 1000, MAX_FRAME_ELAPSED_SECONDS));
    previousTime = now;
    while (running && token === generation && accumulator >= SIM_DT) {
      accumulator -= SIM_DT;
      tick(SIM_DT);
    }
    if (!running || token !== generation) return;
    render();
    if (running && token === generation) requestNext();
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      generation += 1;
      previousTime = clock.now();
      accumulator = 0;
      requestNext();
    },
    stop(): void {
      running = false;
      generation += 1;
      if (request !== null) clock.cancel(request);
      request = null;
    },
  };
}
