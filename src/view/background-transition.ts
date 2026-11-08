import type { RouteOccurrence } from '../course/course-route.js';
import type { PseudoCamera } from './projection.js';
import type { SoftwareSurface } from './software-surface.js';
import { backgroundHorizon, backgroundPan, paintBackgroundSpan, type TileBackground } from './tile-background.js';
import { lineThinningRanks, newLineCount } from './line-thinning.js';

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

/**
 * Draw the sky for `camera` at the sky's yaw `yaw` ([Image assets](../../docs/image-assets.md#background-transitions)):
 * every line from one map, each by its own scroll, by line thinning: the lines ranked below `newLineCount` from `to`
 * and the rest from `from`. No palette is rewritten and no color mixed.
 */
export function drawSky(target: SoftwareSurface, sky: RouteSky, camera: PseudoCamera, yaw: number): void {
  const yH = backgroundHorizon(camera);
  const toPan = backgroundPan(sky.to, yaw, camera);
  const from = sky.from;
  const fromPan = from ? backgroundPan(from, yaw, camera) : 0;
  const rank = lineThinningRanks(target.height),
    shown = from ? newLineCount(target.height, sky.p) : target.height;
  for (let y = 0; y < target.height; y++) {
    if (rank[y]! < shown) paintBackgroundSpan(target, sky.to, toPan, y, yH, 0, target.width);
    else paintBackgroundSpan(target, from!, fromPan, y, yH, 0, target.width);
  }
}
