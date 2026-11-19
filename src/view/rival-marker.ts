import { TEXT_MARKS, TEXT_PALETTES, TEXT_TILE_SIZE } from '../image/text-tiles.js';
import type { ShownPicture } from './renderer.js';
import type { SoftwareSurface } from './software-surface.js';
import type { TextLayer } from './text-layer.js';

/** The marker's words over its arrow, in the normal 8×8 font. */
const WORD = 'RIVAL';
/** The marker stands this many pixels clear above the top of the rival's picture. */
const CLEAR = 2;

/**
 * The one rival's marker (K, 2026-11-19): RIVAL over a downward arrow, YELLOW in the normal font, of one size however
 * far the rival is, its arrow centred above the rival's picture where the finished frame shows it (`ShownPicture`),
 * over everything drawn. Kept within the frame, it stands at its edge where the rival's picture reaches past it.
 */
export function drawRivalMarker(frame: SoftwareSurface, text: TextLayer, shown: ShownPicture) {
  const width = WORD.length * TEXT_TILE_SIZE,
    height = 2 * TEXT_TILE_SIZE;
  const left = Math.min(frame.width - width, Math.max(0, Math.round(shown.x - width / 2))),
    top = Math.min(frame.height - height, Math.max(0, Math.round(shown.top) - CLEAR - height));
  text.stamp(frame, left, top, WORD, TEXT_PALETTES.YELLOW);
  text.stamp(
    frame,
    left + ((WORD.length - 1) / 2) * TEXT_TILE_SIZE,
    top + TEXT_TILE_SIZE,
    TEXT_MARKS.down,
    TEXT_PALETTES.YELLOW,
  );
}
