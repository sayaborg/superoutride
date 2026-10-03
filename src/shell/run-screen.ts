import type { TextLayer } from '../view/text-layer.js';
import { createMenu, type Menu, type MenuDefinition } from './menu.js';
import { formatRaceTime, type RunResult } from './race-status-hud.js';
import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import type { MenuCommand } from '../input/menu-input.js';

/** The run screen's states besides running: manual PAUSE, and finished after GOAL or GAME OVER. */
export interface RunFacts {
  readonly paused: boolean;
  /** The current Session reached RESULT. */
  readonly finished: boolean;
}

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

/** A run's step and frame: the frame draws the scene, then its HUD is written, then it presents after the text. */
export interface RunFrame {
  tick(): void;
  draw(): { writeHud(text: TextLayer, menu: boolean): void; present(): void };
  /** The ended run's result. */
  result(): RunResult;
}

/** What the PAUSE menu and RESULT lead to; RESUME and BACK on the PAUSE menu resume the run. */
export interface RunScreenActions {
  /** Assemble the same request again, with a new seed. */
  retry(): void;
  /** SELECT VEHICLE with the run's selection. */
  changeVehicle(): void;
  /** The run's first selection screen with its selection. */
  select(): void;
  title(): void;
}

/** RESULT's lines: the outcome as its title, the rank when there were rivals, race time and a circuit's best lap. */
function resultMenu(result: RunResult, actions: RunScreenActions): MenuDefinition {
  const items = Object.freeze([
    { label: 'RETRY', confirm: () => actions.retry() },
    { label: 'CHANGE VEHICLE', confirm: () => actions.changeVehicle() },
    { label: 'SELECT', confirm: () => actions.select() },
    { label: 'TITLE', confirm: () => actions.title() },
  ]);
  return {
    title: result.outcome,
    titlePalette: result.outcome === 'GOAL' ? TEXT_PALETTES.YELLOW : TEXT_PALETTES.RED,
    lines: [
      ...(result.standing ? [`RANK ${result.standing.rank}/${result.standing.count}`] : []),
      `TIME ${formatRaceTime(result.raceSeconds)}`,
      ...(result.bestLapSeconds === null ? [] : [`BEST LAP ${formatRaceTime(result.bestLapSeconds)}`]),
    ],
    items: () => items,
  };
}

/**
 * The run screen: the race advances only while running, and every frame draws the scene. While paused, the PAUSE menu
 * (RESUME / RETRY / QUIT) is drawn over the stopped frame and takes the menu commands; PAUSE and BACK resume, and QUIT
 * goes to TITLE. Once finished, RESULT is drawn over the stopped frame and takes the menu commands.
 */
export function createRunScreen(
  state: RunScreenState,
  run: RunFrame,
  frame: SoftwareSurface,
  text: TextLayer,
  actions: RunScreenActions,
): Screen {
  const resume = () => state.setPaused(false);
  const pauseItems = Object.freeze([
    { label: 'RESUME', confirm: resume },
    { label: 'RETRY', confirm: () => actions.retry() },
    { label: 'QUIT', confirm: () => actions.title() },
  ]);
  const pauseMenu = () => createMenu({ title: 'PAUSED', items: () => pauseItems, back: resume });
  // The menu over the stopped frame: PAUSE's while paused, RESULT's once finished.
  let menu: Menu | null = null,
    menuFinished = false;
  const current = () => {
    if (!menu || menuFinished !== state.finished) {
      menuFinished = state.finished;
      menu = menuFinished ? createMenu(resultMenu(run.result(), actions)) : pauseMenu();
    }
    return menu;
  };
  return {
    get live() {
      return state.live;
    },
    tick() {
      if (state.live) run.tick();
    },
    command(command: MenuCommand) {
      if (state.finished) {
        current().command(command);
        return;
      }
      if (command === 'PAUSE') {
        state.setPaused(!state.paused);
        return;
      }
      if (state.paused) current().command(command);
    },
    render() {
      const drawn = run.draw();
      text.clear();
      drawn.writeHud(text, !state.live);
      if (state.live) menu = null;
      else current().write(text);
      text.draw(frame);
      drawn.present();
    },
  };
}
