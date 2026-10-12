import { TEXT_PALETTES } from '../image/text-tiles.js';
import type { TextLayer } from '../view/text-layer.js';
import type { SoftwareSurface } from '../view/software-surface.js';
import type { Screen } from './screen-host.js';
import { createMenuScreen } from './menu.js';

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
