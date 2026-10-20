import { fillPolygon, fillRect, mirrored, type Raster } from './raster.js';
import { canvas, ink, m } from './kit.js';

/**
 * The guidance's pictures where OUTRUN's roads part (original to this game; [Original road data](../../../docs/original-road-data.md#outruns-roads)):
 * yellow boards edged in black with black chevrons pointing to the road taken, on grey posts, each standing on the middle of its
 * bottom row, `-left` pointing left and `-right` its mirror.
 */

const YELLOW = 0xf8d020;
const BLACK = 0x181820;
const GREY = 0x9098a0;

/**
 * A board `width` × `height` metres, its bottom `clearance` above the ground, on `posts` posts, with `count` chevrons
 * pointing left.
 */
function board(width: number, height: number, clearance: number, posts: number, count: number): Raster {
  const r = canvas(width, height + clearance);
  const top = m(0.04);
  ink(r, (l) => {
    for (let k = 0; k < posts; k++) {
      const x = posts === 1 ? r.width / 2 : m(width * (k === 0 ? 0.25 : 0.75));
      fillRect(l, x - m(0.04), top + m(height) - m(0.02), m(0.08), m(clearance), GREY);
    }
    fillRect(l, 0, top, r.width, m(height) - top, BLACK);
  });
  // The black edge, then the yellow face inside it.
  const edge = m(0.08);
  fillRect(r, edge, top + edge, r.width - 2 * edge, m(height) - top - 2 * edge, YELLOW);
  // The chevrons, each a thick arrowhead pointing left, centred across the board.
  const span = m(height) * 0.6,
    stroke = span * 0.22,
    gap = span * 0.55;
  const middle = top + (m(height) - top) / 2;
  const first = r.width / 2 - ((count - 1) * gap) / 2 - span / 4;
  for (let k = 0; k < count; k++) {
    const x = first + k * gap;
    fillPolygon(
      r,
      [
        [x + span / 2, middle - span / 2],
        [x, middle],
        [x + span / 2, middle + span / 2],
        [x + span / 2 + stroke, middle + span / 2],
        [x + stroke, middle],
        [x + span / 2 + stroke, middle - span / 2],
      ],
      BLACK,
    );
  }
  return r;
}

/** The guidance's pictures, left and right, by name. */
export function drawGuidancePictures(): { name: string; raster: Raster }[] {
  // The sign before the parting: 3.0 × 1.5 m, a triple chevron, two posts, its bottom 1.2 m up.
  const arrow = board(3, 1.5, 1.2, 2, 3);
  // The chevron at the separator and across the dead end: 1.2 × 0.6 m, a double chevron, one post, 0.8 m up.
  const chevron = board(1.2, 0.6, 0.8, 1, 2);
  return [
    { name: 'route-arrow-left', raster: arrow },
    { name: 'route-arrow-right', raster: mirrored(arrow) },
    { name: 'route-chevron-left', raster: chevron },
    { name: 'route-chevron-right', raster: mirrored(chevron) },
  ];
}
