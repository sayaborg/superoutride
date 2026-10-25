import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { pseudoDepth, pseudoProject, type PseudoCamera, type PseudoProjection } from './projection.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import type { SpriteAsset } from '../image/sprite.js';

interface CourseSpriteAuthoring {
  name: string;
  s: number;
  l: number;
  groundOffset?: number;
  asset: SpriteAsset;
}

/**
 * Where a picture's shadow is anchored: the height at its base point, the road's under a moving picture's and a fixed
 * object's own (a floating one's above the road), the shadow lying on the ground about it as every ground picture does.
 */
export interface SpriteShadowPlace {
  readonly y: number;
}

interface CourseSpritePlace {
  name: string;
  x: number;
  y: number;
  z: number;
  sRender: number;
  /** Its shadow's place; null for a picture that casts none. */
  shadow: SpriteShadowPlace | null;
}

/** A picture to draw. */
export type CourseSprite = CourseSpritePlace & { asset: SpriteAsset };

export interface VisibleCourseSprite extends CourseSpritePlace {
  asset: SpriteAsset;
  d: number;
  projection: PseudoProjection;
}

export function compileCourseSprite(
  guide: { readonly coordinates: PlanCoordinateReader },
  height: ProfileReader,
  source: CourseSpriteAuthoring,
): CourseSprite {
  const position = guide.coordinates.toWorld(source.s, source.l, createPlanCoordinateSample());
  const y = height.sample(source.s) + (source.groundOffset ?? 0);
  // A fixed object casts its shadow frame at its picture's own place and size.
  const place = { name: source.name, x: position.x, y, z: position.z, sRender: position.s, shadow: { y } };
  return { ...place, asset: source.asset };
}

/** The pictures `sprites` within the depth interval, far to near. */
export function collectVisibleCourseSprites(
  sprites: readonly CourseSprite[],
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
): readonly VisibleCourseSprite[] {
  const visible: VisibleCourseSprite[] = [];
  for (const sprite of sprites) {
    const d = pseudoDepth(sprite.sRender, camera.s);
    if (d < dStart || d > dEnd) continue;
    const projection = pseudoProject({ x: sprite.x, y: sprite.y, z: sprite.z, s: sprite.sRender }, camera);
    visible.push({ ...sprite, d, projection });
  }
  visible.sort((a, b) => b.d - a.d);
  return visible;
}
