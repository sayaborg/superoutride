import type { CourseMap, MapPoint } from '../course/course-map.js';
import type { SoftwareSurface } from './software-surface.js';

/** The colors a map is drawn in, RGB555. */
export interface CourseMapColors {
  readonly line: number;
  readonly core: number;
  readonly start: number;
  readonly checkpoint: number;
  /** The arrowhead that marks the way the route runs, and its outline. */
  readonly arrow: number;
  readonly outline: number;
}

/** Pixels the centreline's 3-pixel line reaches either side of its path. */
const LINE_REACH = 1;
/** The start line's bar: pixels either side of the road's centre, 9 in all. */
const START_REACH = 4;
/**
 * The arrowhead that marks the way the route runs, in pixels: its centre `along` the path from the start, its back
 * `back` behind the centre and its tip `front` ahead, its half width `spread` of the length to its tip, an outline
 * `outline` wide around it, and the path `aim` either side of the centre that gives its direction.
 */
const ARROW = Object.freeze({ along: 14, back: 2.5, front: 3.5, spread: 0.75, outline: 1.2, aim: 4 });

/**
 * Draw `map` into `frame`, scaled to fit the box at (`x`, `y`) of `width` × `height` pixels and centred in it: the
 * centreline 3 pixels wide in `line` with a 1-pixel `core`, a 1×9-pixel bar of `start` across the start line, a 3×3
 * dot of `checkpoint` at each checkpoint gate, and an arrowhead of `arrow` outlined in `outline` 14 pixels along the
 * path from the start, pointing the way the route runs (K's prototype of the cards, 2026-11-09).
 */
export function drawCourseMap(
  frame: SoftwareSurface,
  map: CourseMap,
  box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  colors: CourseMapColors,
) {
  const east = map.centreline.map((p) => p.east),
    north = map.centreline.map((p) => p.north);
  const [west, eastmost] = [Math.min(...east), Math.max(...east)],
    [south, northmost] = [Math.min(...north), Math.max(...north)];
  // The line and the start bar reach beyond the path; the path fits inside that margin.
  const margin = START_REACH;
  const scale = Math.min(
    (box.width - 1 - 2 * margin) / Math.max(1e-9, eastmost - west),
    (box.height - 1 - 2 * margin) / Math.max(1e-9, northmost - south),
  );
  const left = box.x + (box.width - 1 - (eastmost - west) * scale) / 2,
    top = box.y + (box.height - 1 - (northmost - south) * scale) / 2;
  const exact = (p: MapPoint) => ({ x: left + (p.east - west) * scale, y: top + (northmost - p.north) * scale });
  const pixel = (p: MapPoint) => {
    const { x, y } = exact(p);
    return { x: Math.round(x), y: Math.round(y) };
  };
  const set = (x: number, y: number, color: number) => frame.setPixel(x, y, color);
  // Every pixel of the polyline, one segment after another.
  const path = (visit: (x: number, y: number) => void) => {
    for (let i = 1; i < map.centreline.length; i++) {
      const a = pixel(map.centreline[i - 1]!),
        b = pixel(map.centreline[i]!);
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      for (let k = 0; k <= steps; k++)
        visit(Math.round(a.x + ((b.x - a.x) * k) / steps), Math.round(a.y + ((b.y - a.y) * k) / steps));
    }
  };
  path((x, y) => {
    for (let dy = -LINE_REACH; dy <= LINE_REACH; dy++)
      for (let dx = -LINE_REACH; dx <= LINE_REACH; dx++) set(x + dx, y + dy, colors.line);
  });
  path((x, y) => set(x, y, colors.core));
  for (const checkpoint of map.checkpoints) {
    const { x, y } = pixel(checkpoint);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + dy, colors.checkpoint);
  }
  // Across the road: the direction turned a right angle, in screen pixels (north is up).
  const { x, y } = pixel(map.start.point);
  const across = { x: map.start.direction.north, y: map.start.direction.east };
  for (let k = -START_REACH; k <= START_REACH; k++)
    set(Math.round(x + across.x * k), Math.round(y + across.y * k), colors.start);
  drawArrow(map.centreline.map(exact), set, colors);
}

/** The arrowhead on the path `points` (pixels from the start), pointing along it; none on a path too short to aim. */
function drawArrow(
  points: readonly { readonly x: number; readonly y: number }[],
  set: (x: number, y: number, color: number) => void,
  colors: CourseMapColors,
) {
  // The point `distance` pixels along the path, or its end.
  const along = (distance: number) => {
    for (let i = 1, walked = 0; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length > 0 && walked + length >= distance) {
        const t = (distance - walked) / length;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      walked += length;
    }
    return points[points.length - 1]!;
  };
  const centre = along(ARROW.along),
    ahead = along(ARROW.along + ARROW.aim),
    behind = along(ARROW.along - ARROW.aim);
  const length = Math.hypot(ahead.x - behind.x, ahead.y - behind.y);
  if (length === 0) return;
  const [ux, uy] = [(ahead.x - behind.x) / length, (ahead.y - behind.y) / length],
    [cx, cy] = [Math.round(centre.x), Math.round(centre.y)];
  // Within the arrowhead grown by `grow`: `u` along its direction from the centre, `v` across it.
  const inside = (x: number, y: number, grow: number) => {
    const u = (x - cx) * ux + (y - cy) * uy,
      v = Math.abs((y - cy) * ux - (x - cx) * uy);
    return u >= -ARROW.back - grow && u <= ARROW.front + grow && v <= (ARROW.front - u) * ARROW.spread + grow;
  };
  // A square about the centre that holds the outlined arrowhead.
  const reach = Math.ceil(ARROW.back + (ARROW.back + ARROW.front) * ARROW.spread + ARROW.outline);
  for (let y = cy - reach; y <= cy + reach; y++)
    for (let x = cx - reach; x <= cx + reach; x++)
      if (inside(x, y, 0)) set(x, y, colors.arrow);
      else if (inside(x, y, ARROW.outline)) set(x, y, colors.outline);
}
