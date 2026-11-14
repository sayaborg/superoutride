import { wrapAngle } from '../core/math.js';
import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfilePolylineReader, ProfileReader } from '../course/geometry/profile.js';
import { halveRgb555 } from '../image/rgb555.js';
import type { SpriteAsset } from '../image/sprite.js';
import type { RouteSky } from './background-transition.js';
import type { CourseSprite } from './course-sprite.js';
import type { RouteWall } from './course-wall.js';
import type { StripGroundReader } from './strip-ground-sampler.js';

/** The road as a camera stands on it: its plan and its height along one ruler. */
export interface RoadReaders {
  readonly coordinates: Pick<PlanCoordinateReader, 'toWorld' | 'forwardEnd'>;
  readonly height: Pick<ProfileReader, 'sample'>;
}

/** Everything the renderer reads of a course along one ruler, and how a route station and a picture stand on it. */
export interface CourseView extends RoadReaders {
  readonly renderHeight: ProfilePolylineReader;
  readonly extent: { readonly start: number; readonly end: number };
  readonly ground: StripGroundReader;
  readonly walls: readonly RouteWall[];
  skyAt(s: number): RouteSky;
  skyYawAt(s: number, yaw: number): number;
  /** A route station on this ruler. */
  station(s: number): number;
  /** A picture on this ruler; an `oriented` one has a picture of its own for every direction it is seen from. */
  picture(sprite: CourseSprite, oriented: boolean): CourseSprite;
}

/** The step, metres, at which the reversed plan looks for its first station turned from a yaw; bisection refines it. */
const FACING_STEP_METERS = 1;
const FACING_BISECTIONS = 20;

const roads = new WeakMap<RoadReaders, RoadReaders>();

/**
 * The same road read the other way (K, 2026-11-14): station s reversed, lateral l mirrored and the heading turned half
 * round, so that a forward camera on it is a camera looking back along the road. World points are the road's own.
 */
export function reverseRoad(road: RoadReaders): RoadReaders {
  let reversed = roads.get(road);
  if (reversed) return reversed;
  const point = createPlanCoordinateSample();
  const faces = (s: number, yaw: number) =>
    Math.abs(wrapAngle(road.coordinates.toWorld(-s, 0, point).heading + Math.PI - yaw)) < Math.PI / 2;
  reversed = Object.freeze({
    coordinates: Object.freeze({
      toWorld(s, l, out) {
        road.coordinates.toWorld(-s, -l, out);
        out.s = s;
        out.l = l;
        out.heading = wrapAngle(out.heading + Math.PI);
        return out;
      },
      // The plan's own scan runs forward alone: here the turned heading is stepped, and the step that turns it bisected.
      forwardEnd(start, end, yaw) {
        if (!faces(start, yaw)) return start;
        for (let a = start; a < end;) {
          let b = Math.min(end, a + FACING_STEP_METERS);
          if (faces(b, yaw)) {
            a = b;
            continue;
          }
          for (let i = 0; i < FACING_BISECTIONS; i++) {
            const middle = (a + b) / 2;
            if (faces(middle, yaw)) a = middle;
            else b = middle;
          }
          return b;
        }
        return end;
      },
    } satisfies RoadReaders['coordinates']),
    height: Object.freeze({ sample: (s: number) => road.height.sample(-s) }),
  });
  roads.set(road, reversed);
  return reversed;
}

const mirrors = new WeakMap<SpriteAsset, SpriteAsset>(),
  halves = new WeakMap<SpriteAsset, SpriteAsset>();
// One made picture for each picture, made on first use.
const made = (cache: WeakMap<SpriteAsset, SpriteAsset>, asset: SpriteAsset, make: () => SpriteAsset) => {
  let picture = cache.get(asset);
  if (!picture) cache.set(asset, (picture = Object.freeze(make())));
  return picture;
};

/** A picture read on the reversed ruler: flipped left to right, extending sideways the other way. */
export function mirrored(asset: SpriteAsset): SpriteAsset {
  return made(mirrors, asset, () => {
    const { flip, extend, ...rest } = asset;
    return {
      ...rest,
      ...(!flip && { flip: true as const }),
      ...(extend && { extend: extend === 'left' ? ('right' as const) : ('left' as const) }),
    };
  });
}

/** A picture in its palettes at half brightness, by RGB555's one halving: a standing board's back (K, 2026-11-14). */
export function halfBright(asset: SpriteAsset): SpriteAsset {
  return made(halves, asset, () => ({
    ...asset,
    levels: Object.freeze(
      asset.levels.map((level) =>
        Object.freeze({ ...level, paletteRgb555: Object.freeze(level.paletteRgb555.map(halveRgb555)) }),
      ),
    ),
  }));
}

/**
 * The course read the other way, `reverseRoad`'s ruler throughout: its drawn height, extent, ground and walls follow
 * the road; the sky stands where it stands, its turn the camera's; a picture stands at its reversed station. Every
 * picture without its own image for each direction is read `mirrored`, standing or lying, as the reversed ruler reads
 * it; a standing one alone, a board seen from behind, is also at `halfBright`. `view` is a forward view.
 */
export function reverseCourseView(view: CourseView): CourseView {
  const road = reverseRoad(view);
  let source: ProfilePolylineReader['vertices'] | null = null,
    vertices: ProfilePolylineReader['vertices'] = [];
  const mirror = (reader: StripGroundReader, lateral: -1 | 1) => {
    const mirrored: StripGroundReader = {
      sampleSpan: (pixels, offset, count, s, l, stepL, deltaS, stats, shade) =>
        reader.sampleSpan(pixels, offset, count, -s, lateral * l, lateral * stepL, deltaS, stats, shade),
    };
    return Object.freeze(mirrored);
  };
  return Object.freeze({
    ...road,
    renderHeight: Object.freeze({
      get vertices() {
        if (view.renderHeight.vertices !== source) {
          source = view.renderHeight.vertices;
          vertices = Object.freeze(source.map(({ s, y }) => Object.freeze({ s: -s, y })).reverse());
        }
        return vertices;
      },
      sample(s: number, out = { y: 0, grade: 0 }) {
        view.renderHeight.sample(-s, out);
        out.grade = -out.grade;
        return out;
      },
    }),
    extent: Object.freeze({
      get start() {
        return -view.extent.end;
      },
      get end() {
        return -view.extent.start;
      },
    }),
    ground: mirror(view.ground, -1),
    // A wall's colors run up its height, which no reversal turns.
    walls: Object.freeze(
      view.walls.map((wall) =>
        Object.freeze({
          start: -wall.end,
          end: -wall.start,
          lateralAt: (s: number) => -wall.lateralAt(-s),
          bottom: wall.bottom,
          top: wall.top,
          color: mirror(wall.color, 1),
        }),
      ),
    ),
    skyAt: (s: number) => view.skyAt(-s),
    skyYawAt: (s: number, yaw: number) => view.skyYawAt(-s, yaw - Math.PI) + Math.PI,
    station: (s: number) => -s,
    picture: (sprite: CourseSprite, oriented: boolean) => ({
      ...sprite,
      sRender: -sprite.sRender,
      asset: oriented ? sprite.asset : mirrored(sprite.asset.lies ? sprite.asset : halfBright(sprite.asset)),
    }),
  });
}
