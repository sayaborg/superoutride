import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import { createMenuScreen, SCREEN_BACKGROUND, writeCentred } from './menu.js';

/** The screen while a run loads. */
export function createLoadingScreen(frame: SoftwareSurface, text: TextLayer, present: () => void): Screen {
  return {
    live: false,
    tick() {},
    command() {},
    render() {
      frame.clear(SCREEN_BACKGROUND);
      text.clear();
      writeCentred(text, Math.floor((TEXT_ROWS - 1) / 2), 'LOADING', TEXT_PALETTES.WHITE);
      text.draw(frame);
      present();
    },
  };
}

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
