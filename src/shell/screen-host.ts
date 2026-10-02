import { createFrameLoop } from './frame-loop.js';
import type { MenuCommand, MenuInputMode } from '../input/menu-input.js';

/** A screen owns the frame while it is current: it advances one fixed step and draws one frame. */
export interface Screen {
  /** Whether the player's driving input and sound are live on this screen; only a running run is. */
  readonly live: boolean;
  tick(): void;
  render(): void;
  /** One menu command; while the screen is live only PAUSE arrives. */
  command(command: MenuCommand): void;
}

/** The devices the host routes: driving input, sound and menu commands. */
export interface ScreenDevices {
  setMode(mode: MenuInputMode): void;
  menuCommands(): MenuCommand[];
}

/**
 * The one owner of the current screen and of whether the page runs. The one frame loop runs while the page is visible
 * and advances and draws the current screen. It owns the device mode: driving (driving input and sound live, only
 * PAUSE as a menu command) exactly while the page is visible and the current screen is live, menu while it is visible
 * otherwise, and off while hidden. It alone watches document visibility and page hiding, and reloads a page restored
 * from the back/forward cache.
 */
export function createScreenHost(
  target: Window,
  visibilityDocument: Document,
  devices: ScreenDevices,
  initial: Screen,
) {
  let screen = initial,
    hidden = visibilityDocument.hidden,
    mode: MenuInputMode | null = null;
  // Each start begins a new frame clock, so stopped real time never enters the simulation. Each step first delivers
  // the menu commands to the current screen.
  const loop = createFrameLoop(
    () => {
      for (const command of devices.menuCommands()) screen.command(command);
      screen.tick();
    },
    () => screen.render(),
  );
  const update = () => {
    if (hidden) loop.stop();
    else loop.start();
    const next: MenuInputMode = hidden ? 'off' : screen.live ? 'driving' : 'menu';
    if (next === mode) return;
    mode = next;
    devices.setMode(mode);
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
  update();
  return Object.freeze({
    get screen() {
      return screen;
    },
    get live() {
      return mode === 'driving';
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
