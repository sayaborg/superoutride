import { rasterCourseToWorld } from '../core/course.js';
import { pseudoDepth, pseudoProject, type PseudoCamera, type PseudoProjection } from '../core/projection.js';
import type { GuideCurve } from '../core/guide-curve.js';
import type { SpriteAsset } from '../render/sprite.js';
import type { CyclicHeightProfile } from '../visual/height-profile.js';

export interface CourseSpriteAuthoring {
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

export function compileCourseSprite(
  guide: GuideCurve,
  height: CyclicHeightProfile,
  source: CourseSpriteAuthoring,
): CourseSprite {
  const plan = rasterCourseToWorld(guide.raster, source.s, source.l);
  const y = source.y ?? (height.sampleRender(source.s).y + (source.groundOffset ?? 0));
  return {
    name: source.name,
    x: plan.x,
    y,
    z: plan.z,
    sRender: plan.s,
    asset: source.asset,
  };
}

export function collectVisibleCourseSprites(
  sprites: readonly CourseSprite[],
  camera: PseudoCamera,
  dStart: number,
  dEnd: number,
): VisibleCourseSprite[] {
  const visible: VisibleCourseSprite[] = [];
  for (const sprite of sprites) {
    const d = pseudoDepth(sprite.sRender, camera.s);
    if (d < dStart || d > dEnd) continue;
    const projection = pseudoProject(
      { x: sprite.x, y: sprite.y, z: sprite.z, s: sprite.sRender },
      camera,
    );
    visible.push({ ...sprite, d, projection });
  }
  visible.sort((a, b) => b.d - a.d);
  return visible;
}
