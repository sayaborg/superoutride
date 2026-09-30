/** The run-state facts; the run is running only while none of them holds. */
export interface RunFacts {
  /** Manual PAUSE. */
  readonly paused: boolean;
  /** The document is hidden or the page was hidden (pagehide). */
  readonly hidden: boolean;
  /** The current Session reached GOAL or GAME OVER. */
  readonly finished: boolean;
}

export interface RunState extends RunFacts {
  readonly running: boolean;
  setPaused(paused: boolean): void;
  finish(): void;
  /** A rebuilt Session: clear `paused` and `finished`. */
  restart(): void;
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
    running = !hidden,
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
    get running() {
      return running;
    },
    setPaused(value) {
      update(value, hidden, finished);
    },
    finish() {
      update(paused, hidden, true);
    },
    restart() {
      update(false, hidden, false);
    },
    begin() {
      if (begun) return;
      begun = true;
      drive(running);
      observe(state);
    },
  };
  function update(nextPaused: boolean, nextHidden: boolean, nextFinished: boolean): void {
    if (nextPaused === paused && nextHidden === hidden && nextFinished === finished) return;
    paused = nextPaused;
    hidden = nextHidden;
    finished = nextFinished;
    const next = !paused && !hidden && !finished;
    const changed = next !== running;
    running = next;
    if (!begun) return;
    if (changed) drive(running);
    observe(state);
  }
  visibilityDocument.addEventListener('visibilitychange', () => update(paused, visibilityDocument.hidden, finished));
  target.addEventListener('pagehide', () => update(paused, true, finished));
  target.addEventListener('pageshow', (event) => {
    if (event.persisted) target.location.reload();
  });
  return state;
}
