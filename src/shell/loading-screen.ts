import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import { createMenuScreen, writeCentred } from './menu.js';
import type { TilePicture } from '../image/tile-picture.js';

/**
 * The screen after a run's assembly failed: LOAD FAILED in red, with RETRY and BACK. The reason is not drawn: it may
 * hold characters without text tiles, so the shell reports it outside the frame.
 */
export function createLoadFailedScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  actions: { retry(): void; back(): void },
): Screen {
  const items = Object.freeze([
    { label: 'RETRY', confirm: () => actions.retry() },
    { label: 'BACK', confirm: () => actions.back() },
  ]);
  return createMenuScreen(frame, text, present, {
    title: 'LOAD FAILED',
    titlePalette: TEXT_PALETTES.RED,
    items: () => items,
    back: () => actions.back(),
  });
}

/** LOADING's row: the text grid's last (y 232–239), which the picture of the controls leaves free. */
const LOADING_ROW = 29;

/**
 * LOADING, the screen the page's startup stands on: the picture of the controls, and over it `LOADING <n>%` centred in
 * YELLOW on the bottom row, which the picture leaves free, nothing else and no blinking. The percentage is
 * the share of the startup's files read, whole and never falling. Commands do nothing; it thins away to the next screen.
 */
export function createLoadingScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  picture: TilePicture,
) {
  let percent = 0,
    // The percentage drawn last: the canvas keeps the frame presented, so an unchanged one is not drawn again.
    drawn: number | null = null;
  // Resolved once a frame showing 100% has been drawn, so the page leaves LOADING only from it.
  let complete = () => {};
  const completed = new Promise<void>((resolve) => (complete = resolve));
  const screen: Screen = {
    live: false,
    thinsAway: true,
    tick() {},
    command() {},
    render() {
      if (percent === drawn) return;
      drawn = percent;
      frame.clear(0);
      picture.draw(frame, 0, 0);
      text.clear();
      writeCentred(text, LOADING_ROW, `LOADING ${percent}%`, TEXT_PALETTES.YELLOW);
      text.draw(frame);
      present();
      if (percent === 100) complete();
    },
  };
  return Object.freeze({
    screen,
    /** The share of the startup's files read, 0 to 1. */
    progress(share: number) {
      percent = Math.max(percent, Math.floor(share * 100));
    },
    /** Resolves once LOADING has drawn 100%. */
    completed,
  });
}
