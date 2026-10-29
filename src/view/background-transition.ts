import type { RouteOccurrence } from '../course/course-route.js';
import type { PseudoCamera } from './projection.js';
import type { SoftwareSurface } from './software-surface.js';
import { backgroundHorizon, backgroundPan, paintBackgroundSpan, type TileBackground } from './tile-background.js';

/** An environment interval on the route ruler: its background, where its knot lies and how long its change runs. */
export interface RouteEnvironment {
  readonly occurrence: RouteOccurrence;
  readonly index: number;
  /** The route station of the interval's knot. */
  readonly start: number;
  readonly background: TileBackground;
  /** Metres from the knot over which its background replaces the one before it; 0 at once. */
  readonly transition: number;
}

/** The sky at a route station: `to`, and while a change runs, `from` with the share `p` of lines already `to`. */
export interface RouteSky {
  readonly from: TileBackground | null;
  readonly to: TileBackground;
  readonly p: number;
}

const ranks = new Map<number, Uint16Array>();
/**
 * Each of `height` screen lines' rank in a change: the lines in the order of their numbers' bits reversed (over the
 * fewest bits that number them), so that every share of lines lies spread evenly, the widest gaps filled first.
 */
function lineRanks(height: number): Uint16Array {
  let rank = ranks.get(height);
  if (!rank) {
    const bits = Math.max(1, Math.ceil(Math.log2(height)));
    rank = new Uint16Array(height);
    for (let n = 0, next = 0; n < 1 << bits; n++) {
      let line = 0;
      for (let b = 0; b < bits; b++) line |= ((n >> b) & 1) << (bits - 1 - b);
      if (line < height) rank[line] = next++;
    }
    ranks.set(height, rank);
  }
  return rank;
}

/** How many of `height` lines show the new sky at share `p`. */
export const newSkyLines = (height: number, p: number) => Math.round(height * p);

/**
 * Draw the sky for `camera` at the sky's yaw `yaw` ([Image assets](../../docs/image-assets.md#background-transitions)):
 * every line from one map, each by its own scroll, the lines ranked below `newSkyLines` from `to` and the rest from
 * `from`. No palette is rewritten and no color mixed.
 */
export function drawSky(target: SoftwareSurface, sky: RouteSky, camera: PseudoCamera, yaw: number): void {
  const yH = backgroundHorizon(camera);
  const toPan = backgroundPan(sky.to, yaw, camera);
  const from = sky.from;
  const fromPan = from ? backgroundPan(from, yaw, camera) : 0;
  const rank = lineRanks(target.height),
    shown = from ? newSkyLines(target.height, sky.p) : target.height;
  for (let y = 0; y < target.height; y++) {
    if (rank[y]! < shown) paintBackgroundSpan(target, sky.to, toPan, y, yH, 0, target.width);
    else paintBackgroundSpan(target, from!, fromPan, y, yH, 0, target.width);
  }
}
