/** The run-state facts; the run is running only while none of them holds. */
export interface RunFacts {
  /** Manual PAUSE. */
  readonly paused: boolean;
  /** The document is hidden or the page was hidden (pagehide). */
  readonly hidden: boolean;
  /** The current Session reached GOAL or GAME OVER. */
  readonly finished: boolean;
  /** No run is loaded: one is being assembled, or its assembly failed. */
  readonly unloaded: boolean;
}

export interface RunState extends RunFacts {
  readonly running: boolean;
  setPaused(paused: boolean): void;
  finish(): void;
  /** A rebuilt Session: clear `paused` and `finished`. */
  restart(): void;
  /** The run is disposed: set `unloaded`. */
  unload(): void;
  /** A new run is loaded: clear `unloaded`, `paused` and `finished`. */
  load(): void;
  /** Drive the initial state once, after the composition that `drive` renders is complete. */
  begin(): void;
}

/**
 * The one owner of whether the run is running. It alone watches page visibility and page hiding, reloads a
 * page restored from the back/forward cache, calls `drive` exactly when `running` changes, and reports every
 * fact change to `observe`. Nothing is driven before `begin()`.
 */
export function createRunState(
  target: Window,
  visibilityDocument: Document,
  drive: (running: boolean) => void,
  observe: (facts: RunFacts) => void,
): RunState {
  let paused = false,
    hidden = visibilityDocument.hidden,
    finished = false,
    unloaded = true,
    running = false,
    begun = false;
  const state: RunState = {
    get paused() {
      return paused;
    },
    get hidden() {
      return hidden;
    },
    get finished() {
      return finished;
    },
    get unloaded() {
      return unloaded;
    },
    get running() {
      return running;
    },
    setPaused(value) {
      update(value, hidden, finished, unloaded);
    },
    finish() {
      update(paused, hidden, true, unloaded);
    },
    restart() {
      update(false, hidden, false, unloaded);
    },
    unload() {
      update(paused, hidden, finished, true);
    },
    load() {
      update(false, hidden, false, false);
    },
    begin() {
      if (begun) return;
      begun = true;
      drive(running);
      observe(state);
    },
  };
  function update(nextPaused: boolean, nextHidden: boolean, nextFinished: boolean, nextUnloaded: boolean): void {
    if (nextPaused === paused && nextHidden === hidden && nextFinished === finished && nextUnloaded === unloaded)
      return;
    paused = nextPaused;
    hidden = nextHidden;
    finished = nextFinished;
    unloaded = nextUnloaded;
    const next = !paused && !hidden && !finished && !unloaded;
    const changed = next !== running;
    running = next;
    if (!begun) return;
    if (changed) drive(running);
    observe(state);
  }
  visibilityDocument.addEventListener('visibilitychange', () =>
    update(paused, visibilityDocument.hidden, finished, unloaded),
  );
  target.addEventListener('pagehide', () => update(paused, true, finished, unloaded));
  target.addEventListener('pageshow', (event) => {
    if (event.persisted) target.location.reload();
  });
  return state;
}
