import { TEXT_PALETTES } from '../image/text-tiles.js';
import { TEXT_COLUMNS, TEXT_ROWS, type TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';

/** The plain background of screens without a scene. */
export const SCREEN_BACKGROUND = 0;

/**
 * The screen while a run loads (LOADING) or after its assembly failed (LOAD FAILED in red). The reason is not drawn:
 * it may hold characters without text tiles, so the shell reports it outside the frame.
 */
export function createLoadingScreen(
  frame: SoftwareSurface,
  text: TextLayer,
  present: () => void,
  failed: boolean,
): Screen {
  const message = failed ? 'LOAD FAILED' : 'LOADING';
  return {
    live: false,
    tick() {},
    render() {
      frame.clear(SCREEN_BACKGROUND);
      text.clear();
      text.write(
        Math.floor((TEXT_COLUMNS - message.length) / 2),
        Math.floor((TEXT_ROWS - 1) / 2),
        message,
        failed ? TEXT_PALETTES.RED : TEXT_PALETTES.WHITE,
      );
      text.draw(frame);
      present();
    },
  };
}
