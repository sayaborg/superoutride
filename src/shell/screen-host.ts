import { createFrameLoop } from './frame-loop.js';
import type { MenuCommand, InputRoute } from '../input/menu-input.js';

/**
 * What a menu command did: moved the cursor or changed a value, slid SELECT SERIES to another series, confirmed
 * something, confirmed the choice that starts the run (`entry`), confirmed an item that offers nothing (`deny`), or
 * went back.
 */
export type MenuResponse = 'move' | 'slide' | 'confirm' | 'entry' | 'deny' | 'back';

/** A screen owns the frame while it is current: it advances one fixed step and draws one frame. */
export interface Screen {
  /** Whether the player's driving input and sound are live on this screen; only a running run is. */
  readonly live: boolean;
  tick(): void;
  render(): void;
  /** One menu command and what it did; nothing for a command that does nothing. While live only PAUSE arrives. */
  command(command: MenuCommand): MenuResponse | null | void;
  /** The host made another screen current. */
  leave?(): void;
}

/** The devices the host routes: driving input, sound and menu commands, and the sound of what a command did. */
export interface ScreenDevices {
  setRoute(route: InputRoute): void;
  /** Read the devices for this fixed step and return the menu commands since the last call. */
  menuCommands(): MenuCommand[];
  menuSound(response: MenuResponse): void;
  /** The brightness the next frames are presented at, in eighths of full. */
  setBrightness(eighths: number): void;
}

/** Fixed steps the frame takes to darken to black, and the next screen to brighten from it. */
export const TRANSITION_STEPS = 8;

/**
 * The one owner of the current screen and of whether the page runs. The one frame loop runs while the page is visible
 * and advances and draws the current screen. Every change of screen goes through black: the frame darkens to black over
 * `TRANSITION_STEPS` fixed steps, then the next screen brightens from black over as many; meanwhile no screen advances
 * and menu commands are dropped. It owns the input route: driving (driving input and sound live, only PAUSE as a menu
 * command) exactly while the page is visible, no transition runs and the current screen is live, menu while it is
 * visible otherwise, and off while hidden. It alone watches document visibility and page hiding, and reloads a page
 * restored from the back/forward cache.
 */
export function createScreenHost(
  target: Window,
  visibilityDocument: Document,
  devices: ScreenDevices,
  initial: Screen,
) {
  // The page starts from black. `next` is the screen a transition darkens toward; `brightness` is in eighths.
  let screen = initial,
    next: Screen | null = null,
    brightness = 0,
    hidden = visibilityDocument.hidden,
    route: InputRoute | null = null;
  const steady = () => next === null && brightness === TRANSITION_STEPS;
  // Each start begins a new frame clock, so stopped real time never enters the simulation. Each step first delivers
  // the menu commands to the current screen.
  const loop = createFrameLoop(
    () => {
      const commands = devices.menuCommands();
      if (!steady()) {
        // A transition: darken toward the next screen, which is made current at black, or brighten the current one.
        if (next === null) brightness++;
        else if (brightness === 0 || --brightness === 0) {
          screen.leave?.();
          [screen, next] = [next, null];
        }
        update();
        return;
      }
      // The one place a menu command's sound is decided: from what the screen says the command did.
      for (const command of commands) {
        const response = screen.command(command);
        if (response) devices.menuSound(response);
      }
      screen.tick();
    },
    () => {
      devices.setBrightness(brightness);
      screen.render();
    },
  );
  const update = () => {
    if (hidden) loop.stop();
    else loop.start();
    const next: InputRoute = hidden ? 'off' : steady() && screen.live ? 'driving' : 'menu';
    if (next === route) return;
    route = next;
    devices.setRoute(route);
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
      return route === 'driving';
    },
    /**
     * Make `target` the current screen through black; the screen it replaces is told it was left. A later request
     * during the transition replaces its target; one for the current screen while darkening brightens it again.
     */
    show(target: Screen) {
      next = target === screen ? null : target;
      update();
    },
    /** The current screen's `live` may have changed. */
    refresh: update,
  });
}
export type ScreenHost = ReturnType<typeof createScreenHost>;
