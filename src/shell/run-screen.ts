import type { TextLayer } from '../view/text-layer.js';
import { createMenu, type Menu } from './menu.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import type { MenuCommand } from '../input/menu-input.js';

/** The run screen's states besides running: manual PAUSE, and finished after GOAL or GAME OVER. */
export interface RunFacts {
  readonly paused: boolean;
  /** The current Session reached RESULT. */
  readonly finished: boolean;
}

/** The PAUSE menu's items. */
const PAUSE_ITEMS = Object.freeze([{ label: 'RESUME' }, { label: 'RETRY' }, { label: 'QUIT' }]);

/**
 * The run screen's one state: running, paused or finished. The run runs only while neither fact holds; PAUSE and
 * finishing stop the race, driving input and sound. Every change is reported to `observe`.
 */
export function createRunScreenState(observe: (facts: RunFacts) => void) {
  let paused = false,
    finished = false;
  const state = {
    get paused() {
      return paused;
    },
    get finished() {
      return finished;
    },
    get live() {
      return !paused && !finished;
    },
    setPaused(value: boolean) {
      update(value, finished);
    },
    finish() {
      update(paused, true);
    },
    /** A rebuilt Session: clear `paused` and `finished`. */
    restart() {
      update(false, false);
    },
  };
  function update(nextPaused: boolean, nextFinished: boolean) {
    if (nextPaused === paused && nextFinished === finished) return;
    paused = nextPaused;
    finished = nextFinished;
    observe(state);
  }
  return state;
}
export type RunScreenState = ReturnType<typeof createRunScreenState>;

/** A run's step and frame: the frame draws the scene, then presents it after the screen's text. */
export interface RunFrame {
  tick(): void;
  draw(): { present(): void };
}

/** What the PAUSE menu's RETRY and QUIT do; RESUME and BACK resume the run. */
export interface RunScreenActions {
  /** Assemble the same request again, with a new seed. */
  retry(): void;
  quit(): void;
}

/**
 * The run screen: the race advances only while running, and every frame draws the scene. While paused, the PAUSE menu
 * (RESUME / RETRY / QUIT) is drawn over the stopped frame and takes the menu commands; PAUSE and BACK resume.
 */
export function createRunScreen(
  state: RunScreenState,
  run: RunFrame,
  frame: SoftwareSurface,
  text: TextLayer,
  actions: RunScreenActions,
): Screen {
  const pauseMenu = () =>
    createMenu({
      title: 'PAUSED',
      items: () => PAUSE_ITEMS,
      confirm: (index) => {
        if (index === 0) state.setPaused(false);
        else if (index === 1) actions.retry();
        else actions.quit();
      },
      back: () => state.setPaused(false),
    });
  let menu: Menu | null = null;
  return {
    get live() {
      return state.live;
    },
    tick() {
      if (state.live) run.tick();
    },
    command(command: MenuCommand) {
      if (state.finished) return;
      if (command === 'PAUSE') {
        state.setPaused(!state.paused);
        return;
      }
      if (!state.paused) return;
      menu ??= pauseMenu();
      menu.command(command);
    },
    render() {
      const drawn = run.draw();
      text.clear();
      if (state.paused) (menu ??= pauseMenu()).write(text);
      else menu = null;
      text.draw(frame);
      drawn.present();
    },
  };
}
