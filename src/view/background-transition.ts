import type { BackgroundArrival } from '../course/course-document.js';
import type { RouteOccurrence } from '../course/course-route.js';
import { SIM_DT } from '../race/fixed-step.js';
import type { PseudoCamera } from './projection.js';
import type { SoftwareSurface } from './software-surface.js';
import {
  backgroundHorizon,
  backgroundPan,
  drawTileBackground,
  paintBackgroundSpan,
  type TileBackground,
} from './tile-background.js';

/** An environment interval on the route ruler: its background, where its knot lies and how its background arrives. */
export interface RouteEnvironment {
  readonly occurrence: RouteOccurrence;
  readonly index: number;
  /** The route station of the interval's knot. */
  readonly start: number;
  readonly background: TileBackground;
  readonly arrival: BackgroundArrival;
}

/** A background transition's length in screen time. */
export const BACKGROUND_TRANSITION_SECONDS = 1;
const TRANSITION_STEPS = Math.round(BACKGROUND_TRANSITION_SECONDS / SIM_DT);
const TILE = 16;

interface Transition {
  readonly from: TileBackground;
  readonly to: TileBackground;
  readonly kind: 'wipe' | 'rise';
  /** A wipe's sweep: +1 from the left edge to the right, −1 from the right to the left. */
  readonly direction: 1 | -1;
  steps: number;
}

/**
 * The background the frame shows: the environment at the camera's station, or a transition into it. A transition runs
 * in screen time, `BACKGROUND_TRANSITION_SECONDS` of fixed steps from the step the camera's station crosses a knot whose
 * background arrives by `wipe` or `rise`, and finishes whatever the vehicle does next; crossing a knot backward runs
 * the reverse, by the arrival of the knot crossed. Every frame shows whole tiles of one map or the other, each in its
 * own palettes: a wipe lays both on one horizontal scroll, the incoming map's, and a rise moves whole tile rows. `cut`
 * (and a knot whose picture does not change) switches at once. Without fixed steps (a still frame) the environment at the camera's station is shown as it is.
 */
export function createBackgroundTransition() {
  let current: RouteEnvironment | null = null,
    transition: Transition | null = null,
    shown: RouteEnvironment | null = null;
  const frame = {
    /** Draw the frame's background for `camera`. */
    draw(target: SoftwareSurface, camera: PseudoCamera) {
      if (!transition) return drawTileBackground(target, shown!.background, camera);
      if (transition.kind === 'wipe') drawWipe(target, transition, camera);
      else drawRise(target, transition, camera);
    },
  };
  return Object.freeze({
    /**
     * One fixed step with the camera at `environment`; `turn` is the sign of the road's turn ahead of it (0 straight),
     * which a wipe sweeps toward.
     */
    advance(environment: RouteEnvironment, turn: number) {
      if (transition && ++transition.steps >= TRANSITION_STEPS) transition = null;
      if (current && (environment.occurrence !== current.occurrence || environment.index !== current.index)) {
        const forward = environment.start > current.start;
        const kind = forward ? environment.arrival : current.arrival;
        const from = transition ? transition.to : current.background;
        transition =
          kind === 'cut' || from.image === environment.background.image
            ? null
            : {
                from,
                to: environment.background,
                kind,
                direction: ((turn < 0 ? -1 : 1) * (forward ? 1 : -1)) as 1 | -1,
                steps: 0,
              };
      }
      current = environment;
    },
    /** The frame's background with the camera at `environment`. */
    frame(environment: RouteEnvironment) {
      shown = environment;
      return frame;
    },
  });
}
export type BackgroundTransition = ReturnType<typeof createBackgroundTransition>;

/** A wipe: the incoming map replaces the outgoing one tile column by tile column across the frame. */
function drawWipe(target: SoftwareSurface, t: Transition, camera: PseudoCamera) {
  const pan = backgroundPan(t.to, camera),
    first = (((-pan % TILE) + TILE) % TILE) as number;
  // Screen tile columns on the shared scroll: the first ends at `first` (when it is not empty), each next 16 wide.
  const columns = (first > 0 ? 1 : 0) + Math.ceil((target.width - first) / TILE);
  const revealed = Math.min(columns, Math.ceil((t.steps * columns) / TRANSITION_STEPS));
  const yH = backgroundHorizon(camera);
  for (let column = 0; column < columns; column++) {
    const left = column === 0 && first > 0 ? 0 : first + (column - (first > 0 ? 1 : 0)) * TILE,
      right = Math.min(target.width, column === 0 && first > 0 ? first : left + TILE);
    const incoming = t.direction > 0 ? column < revealed : column >= columns - revealed;
    const background = incoming ? t.to : t.from;
    for (let y = 0; y < target.height; y++) paintBackgroundSpan(target, background, pan, y, yH, 0, left, right);
  }
}

/**
 * A rise: the outgoing map sinks below the horizon row in whole tile rows over the first half, and the incoming one
 * rises from it over the second.
 */
function drawRise(target: SoftwareSurface, t: Transition, camera: PseudoCamera) {
  const yH = backgroundHorizon(camera),
    rows = Math.max(1, Math.ceil(Math.min(target.height, Math.max(0, yH)) / TILE)),
    half = TRANSITION_STEPS / 2;
  const sinking = t.steps < half;
  const background = sinking ? t.from : t.to;
  const shift = TILE * Math.min(rows, Math.ceil(((sinking ? t.steps : TRANSITION_STEPS - t.steps) / half) * rows));
  const pan = backgroundPan(background, camera);
  for (let y = 0; y < target.height; y++) paintBackgroundSpan(target, background, pan, y, yH, shift, 0, target.width);
}
