import { createFrameLoop } from './frame-loop.js';

/** A screen owns the frame while it is current: it advances one fixed step and draws one frame. */
export interface Screen {
  /** Whether the player's driving input and sound are live on this screen; only a running run is. */
  readonly live: boolean;
  tick(): void;
  render(): void;
}

/**
 * The one owner of the current screen and of whether the page runs. The one frame loop runs while the page is visible
 * and advances and draws the current screen; driving input and sound are live exactly while the page is visible and
 * the current screen is live. It alone watches document visibility and page hiding, and reloads a page restored from
 * the back/forward cache.
 */
export function createScreenHost(
  target: Window,
  visibilityDocument: Document,
  setLive: (live: boolean) => void,
  initial: Screen,
) {
  let screen = initial,
    hidden = visibilityDocument.hidden,
    live = false;
  // Each start begins a new frame clock, so stopped real time never enters the simulation.
  const loop = createFrameLoop(
    () => screen.tick(),
    () => screen.render(),
  );
  const update = () => {
    if (hidden) loop.stop();
    else loop.start();
    const next = !hidden && screen.live;
    if (next === live) return;
    live = next;
    setLive(live);
  };
  visibilityDocument.addEventListener('visibilitychange', () => {
    hidden = visibilityDocument.hidden;
    update();
  });
  target.addEventListener('pagehide', () => {
    hidden = true;
    update();
  });
  target.addEventListener('pageshow', (event) => {
    if (event.persisted) target.location.reload();
  });
  setLive(false);
  update();
  return Object.freeze({
    get screen() {
      return screen;
    },
    get live() {
      return live;
    },
    /** Make `next` the current screen. */
    show(next: Screen) {
      screen = next;
      update();
    },
    /** The current screen's `live` may have changed. */
    refresh: update,
  });
}
export type ScreenHost = ReturnType<typeof createScreenHost>;
