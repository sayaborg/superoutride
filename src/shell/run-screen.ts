import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';

/** The run screen's states besides running: manual PAUSE, and finished after GOAL or GAME OVER. */
export interface RunFacts {
  readonly paused: boolean;
  /** The current Session reached RESULT. */
  readonly finished: boolean;
}

/** PAUSED is centred in the text grid while the run is paused. */
const PAUSED = 'PAUSED';
const PAUSED_COLUMN = (TEXT_COLUMNS - PAUSED.length) / 2;
const PAUSED_ROW = Math.floor((TEXT_ROWS - 1) / 2);

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

/** The run screen: the race advances only while running; every frame draws the scene, with PAUSED while paused. */
export function createRunScreen(state: RunScreenState, run: RunFrame, frame: SoftwareSurface, text: TextLayer): Screen {
  return {
    get live() {
      return state.live;
    },
    tick() {
      if (state.live) run.tick();
    },
    render() {
      const drawn = run.draw();
      text.clear();
      if (state.paused) text.write(PAUSED_COLUMN, PAUSED_ROW, PAUSED, TEXT_PALETTES.WHITE);
      text.draw(frame);
      drawn.present();
    },
  };
}
