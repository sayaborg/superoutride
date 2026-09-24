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
  y?: number;
  asset: SpriteAsset;
}

export interface CourseSprite {
  name: string;
  x: number;
  y: number;
  z: number;
  sRender: number;
  asset: SpriteAsset;
}

export interface VisibleCourseSprite extends CourseSprite {
  d: number;
  projection: PseudoProjection;
}

/** Ordinary observed reader; neither topology nor a source graph enters the renderer. */
interface CourseSpriteReader {
  visible(camera: PseudoCamera, dStart: number, dEnd: number): readonly VisibleCourseSprite[];
}
export type CourseSpriteInput = readonly CourseSprite[] | CourseSpriteReader;

export function compileCourseSprite(
  guide: { readonly coordinates: PlanCoordinateReader },
  height: ProfileReader,
  source: CourseSpriteAuthoring,
): CourseSprite {
  const position = guide.coordinates.toWorld(source.s, source.l, createPlanCoordinateSample());
  const y = source.y ?? height.sample(source.s) + (source.groundOffset ?? 0);
  return {
    name: source.name,
    x: position.x,
    y,
    z: position.z,
    sRender: position.s,
    asset: source.asset,
  };
}

export function collectVisibleCourseSprites(
  sprites: CourseSpriteInput,
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
): readonly VisibleCourseSprite[] {
  if ('visible' in sprites) return sprites.visible(camera, dStart, dEnd);
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
