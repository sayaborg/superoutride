import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { pseudoDepth, pseudoProject, type PseudoCamera, type PseudoProjection } from './projection.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { SpriteAsset } from '../image/sprite.js';
import { SPRITE_VIEW_COUNT } from '../image/sprite-views.js';

interface CourseSpriteAuthoring {
  name: string;
  s: number;
  l: number;
  groundOffset?: number;
  /** Its picture, or a view set's pictures and the picture of each view. */
  asset: SpriteAsset | Omit<CourseSpriteViews, 'heading'>;
}

/**
 * A board with views: its pictures, the picture of each of its 32 views, and the heading of the road at its station in
 * the frame its position is in.
 */
export interface CourseSpriteViews {
  readonly pictures: readonly SpriteAsset[];
  readonly views: readonly number[];
  readonly heading: number;
}

/** Where a picture's shadow lies: the road's height under its base point and how far along the road it reaches. */
export interface SpriteShadowPlace {
  readonly y: number;
  readonly reach: number;
}

interface CourseSpritePlace {
  name: string;
  x: number;
  y: number;
  z: number;
  sRender: number;
  /** Its shadow's place; null for a picture that casts none (a fixed object's). */
  shadow: SpriteShadowPlace | null;
}

/** A picture to draw, or a board with views, whose picture its view selects where it is seen. */
export type CourseSprite = CourseSpritePlace &
  ({ asset: SpriteAsset; views: null } | { asset: null; views: CourseSpriteViews });

export interface VisibleCourseSprite extends CourseSpritePlace {
  asset: SpriteAsset;
  d: number;
  projection: PseudoProjection;
  /** Given as a vehicle's picture: a thing with depth along the road, not a board. */
  vehicle: boolean;
}

/**
 * A board's view, 0–31, as SUPER MONACO GP selects it ([Architecture](../../docs/architecture.md#boards-with-views)):
 * the angle α = (θ − ψ) − (π/4) tan β, the road's heading at the board turned right from the camera's yaw less the
 * board's bearing to the right of the camera's axis, in steps of π/32 counted down, half a turn round.
 */
export function selectCourseSpriteView(relativeHeading: number, tanBearing: number): number {
  const step = Math.floor((relativeHeading - (Math.PI / 4) * tanBearing) / (Math.PI / SPRITE_VIEW_COUNT));
  return ((step % SPRITE_VIEW_COUNT) + SPRITE_VIEW_COUNT) % SPRITE_VIEW_COUNT;
}

export function compileCourseSprite(
  guide: { readonly coordinates: PlanCoordinateReader },
  height: ProfileReader,
  source: CourseSpriteAuthoring,
): CourseSprite {
  const position = guide.coordinates.toWorld(source.s, source.l, createPlanCoordinateSample());
  const y = height.sample(source.s) + (source.groundOffset ?? 0);
  const place = { name: source.name, x: position.x, y, z: position.z, sRender: position.s, shadow: null };
  return 'views' in source.asset
    ? { ...place, asset: null, views: Object.freeze({ ...source.asset, heading: position.heading }) }
    : { ...place, asset: source.asset, views: null };
}

/** The boards `sprites` and the vehicles' pictures `vehicles` within the depth interval, far to near. */
export function collectVisibleCourseSprites(
  sprites: readonly CourseSprite[],
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
  vehicles: readonly CourseSprite[] = [],
): readonly VisibleCourseSprite[] {
  const visible: VisibleCourseSprite[] = [];
  for (const sprite of sprites) collect(sprite, false);
  for (const sprite of vehicles) collect(sprite, true);
  visible.sort((a, b) => b.d - a.d);
  return visible;

  function collect(sprite: CourseSprite, vehicle: boolean) {
    const d = pseudoDepth(sprite.sRender, camera.s);
    if (d < dStart || d > dEnd) return;
    const projection = pseudoProject({ x: sprite.x, y: sprite.y, z: sprite.z, s: sprite.sRender }, camera);
    const views = sprite.views;
    const asset = views
      ? views.pictures[
          views.views[
            selectCourseSpriteView(views.heading - camera.yaw, projection.cameraRightDistance / projection.depth)
          ]!
        ]!
      : sprite.asset;
    visible.push({ ...sprite, asset, d, projection, vehicle });
  }
}
